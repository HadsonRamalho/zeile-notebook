pub mod github;
pub mod google;
pub mod provider;
pub mod state;

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header::SET_COOKIE},
    response::{IntoResponse, Redirect, Response},
};
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, Scope,
    TokenResponse, TokenUrl, basic::BasicClient,
};
use tracing::error;
use uuid::Uuid;

use crate::{
    controllers::{
        jwt::{extract_claims_from_header, generate_jwt},
        oauth::{
            provider::{OAuthError, OAuthIdentity, Provider},
            state::Purpose,
        },
        user::api_register_user,
        utils::{get_conn, get_var_from_env},
    },
    models::{
        self,
        error::ApiError,
        oauth::AuthRequest,
        state::AppState,
        user::{NewUser, User, UserAuthInfo},
    },
};

macro_rules! oauth_client {
    ($provider:expr, $redirect_url:expr) => {{
        let provider: Provider = $provider;

        let client_id = get_var_from_env(provider.client_id_var())
            .map_err(|_| OAuthError::Unavailable)?
            .to_string();
        let client_secret = get_var_from_env(provider.client_secret_var())
            .map_err(|_| OAuthError::Unavailable)?
            .to_string();

        let auth_url =
            AuthUrl::new(provider.auth_url().to_string()).map_err(|_| OAuthError::Unavailable)?;
        let token_url =
            TokenUrl::new(provider.token_url().to_string()).map_err(|_| OAuthError::Unavailable)?;
        let redirect_url = RedirectUrl::new($redirect_url).map_err(|_| OAuthError::Unavailable)?;

        BasicClient::new(ClientId::new(client_id))
            .set_client_secret(ClientSecret::new(client_secret))
            .set_auth_uri(auth_url)
            .set_token_uri(token_url)
            .set_redirect_uri(redirect_url)
    }};
}

fn frontend_url() -> String {
    get_var_from_env("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string())
}

fn login_callback_url(provider: Provider) -> Result<String, OAuthError> {
    let api_url = get_var_from_env("API_URL").map_err(|_| OAuthError::Unavailable)?;

    Ok(format!(
        "{api_url}/api/user/auth/callback/{}",
        provider.slug()
    ))
}

fn link_callback_url(provider: Provider) -> Result<String, OAuthError> {
    let api_url = get_var_from_env("API_URL").map_err(|_| OAuthError::Unavailable)?;

    Ok(format!(
        "{api_url}/api/user/link/{}/callback",
        provider.slug()
    ))
}

fn resolver(slug: &str) -> Result<Provider, OAuthError> {
    let provider = Provider::from_slug(slug).ok_or(OAuthError::UnknownProvider)?;

    if !provider.is_configured() {
        tracing::warn!(
            "OAuth de {} indisponível: API_URL/{}/{} ausentes",
            provider.slug(),
            provider.client_id_var(),
            provider.client_secret_var()
        );
        return Err(OAuthError::Unavailable);
    }

    Ok(provider)
}

fn com_cookie(mut response: Response, cookie: &str) -> Response {
    match HeaderValue::from_str(cookie) {
        Ok(valor) => {
            response.headers_mut().append(SET_COOKIE, valor);
        }
        Err(e) => error!("cookie de state inválido: {e}"),
    }

    response
}

fn redirect_de_erro(provider: Option<Provider>, erro: OAuthError) -> Response {
    let destino = format!(
        "{}/login?auth_error={}",
        frontend_url(),
        erro.code(provider)
    );

    com_cookie(
        Redirect::to(&destino).into_response(),
        &state::cookie_expirado(),
    )
}

fn autorizar(
    provider: Provider,
    redirect_url: String,
    desafio: &str,
) -> Result<String, OAuthError> {
    let client = oauth_client!(provider, redirect_url);

    let mut request = client.authorize_url(|| CsrfToken::new(desafio.to_string()));
    for scope in provider.scopes() {
        request = request.add_scope(Scope::new(scope.to_string()));
    }

    let (auth_url, _) = request.url();

    Ok(auth_url.to_string())
}

async fn identidade(
    provider: Provider,
    code: String,
    redirect_url: String,
) -> Result<OAuthIdentity, OAuthError> {
    let client = oauth_client!(provider, redirect_url);

    let token = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(&crate::outbound::http_client())
        .await
        .map_err(|e| {
            error!("Erro ao validar o token: {e}");
            OAuthError::TokenExchange
        })?;

    let http_client = crate::outbound::http_client();
    let access_token = token.access_token().secret();

    let identity = match provider {
        Provider::Github => github::identidade(&http_client, access_token).await?,
        Provider::Google => google::identidade(&http_client, access_token).await?,
    };

    if !identity.email_verified {
        tracing::warn!(
            "login de {} recusado: e-mail não verificado no provider",
            provider.slug()
        );
        return Err(OAuthError::EmailNotVerified);
    }

    Ok(identity)
}

fn ids_externos(provider: Provider, external_id: &str) -> (Option<String>, Option<String>) {
    match provider {
        Provider::Github => (Some(external_id.to_string()), None),
        Provider::Google => (None, Some(external_id.to_string())),
    }
}

/// Redireciona para o front com o par de tokens. O access token de 15 minutos
/// sozinho deixaria a sessão do OAuth cair em 15 minutos, sem como renovar.
///
/// O refresh viaja na query como o access token já viajava — o que significa que
/// ambos passam pelo histórico do navegador. É a fraqueza que este fluxo já
/// tinha; trocar por um código de troca de uso único é a evolução natural.
async fn redirect_com_sessao(
    conn: &mut diesel_async::AsyncPgConnection,
    user: User,
    provider: Provider,
) -> Response {
    let user_id = user.id;

    let Ok(token) = generate_jwt(UserAuthInfo::from(user)) else {
        return redirect_de_erro(Some(provider), OAuthError::Session);
    };

    let refresh = match models::refresh_token::emitir(conn, user_id).await {
        Ok((_, refresh)) => refresh,
        Err(e) => {
            error!("falha ao emitir refresh token no OAuth: {e}");
            return redirect_de_erro(Some(provider), OAuthError::Session);
        }
    };

    let destino = format!(
        "{}/auth-callback?token={}&refresh={}",
        frontend_url(),
        token,
        refresh
    );

    com_cookie(
        Redirect::to(&destino).into_response(),
        &state::cookie_expirado(),
    )
}

pub async fn api_oauth_login(Path(slug): Path<String>) -> Response {
    let inicio = resolver(&slug).and_then(|provider| {
        let redirect_url = login_callback_url(provider)?;
        let desafio = state::emitir(provider, Purpose::Login, None)?;
        let url = autorizar(provider, redirect_url, &desafio.state)?;

        Ok((url, desafio.set_cookie))
    });

    match inicio {
        Ok((url, cookie)) => com_cookie(Redirect::to(&url).into_response(), &cookie),
        Err(erro) => redirect_de_erro(Provider::from_slug(&slug), erro),
    }
}

#[derive(serde::Serialize)]
pub struct LinkStartResponse {
    pub url: String,
}

pub async fn api_link_start(
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let provider = resolver(&slug).map_err(|erro| match erro {
        OAuthError::UnknownProvider => ApiError::Request("provider desconhecido".to_string()),
        _ => ApiError::MissingEnv("OAUTH_PROVIDER".to_string()),
    })?;

    let redirect_url =
        link_callback_url(provider).map_err(|_| ApiError::MissingEnv("API_URL".to_string()))?;

    let desafio = state::emitir(provider, Purpose::Link, Some(user_id))
        .map_err(|_| ApiError::CreateToken("state do OAuth".to_string()))?;

    let url = autorizar(provider, redirect_url, &desafio.state)
        .map_err(|_| ApiError::MissingEnv("OAUTH_PROVIDER".to_string()))?;

    Ok(com_cookie(
        Json(LinkStartResponse { url }).into_response(),
        &desafio.set_cookie,
    ))
}

pub async fn api_oauth_callback(
    State(state_app): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(params): Query<AuthRequest>,
    headers: HeaderMap,
) -> Response {
    let provider = match resolver(&slug) {
        Ok(provider) => provider,
        Err(erro) => return redirect_de_erro(Provider::from_slug(&slug), erro),
    };

    if let Err(erro) = state::validar(&params.state, provider, Purpose::Login, &headers) {
        return redirect_de_erro(Some(provider), erro);
    }

    let redirect_url = match login_callback_url(provider) {
        Ok(url) => url,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let identity = match identidade(provider, params.code, redirect_url).await {
        Ok(identity) => identity,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let conn = &mut match get_conn(&state_app.pool).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("falha ao obter conexão no OAuth: {}", e.1.0);
            return redirect_de_erro(Some(provider), OAuthError::Session);
        }
    };

    let por_id = models::user::find_user_by_provider_id(
        conn,
        provider.auth_provider(),
        &identity.external_id,
    )
    .await;

    if let Ok(user) = por_id {
        return redirect_com_sessao(conn, user, provider).await;
    }

    if let Ok(user) = models::user::find_user_by_email(conn, &identity.email).await {
        if let Err(e) = models::user::link_provider_account(
            conn,
            &user.id,
            provider.auth_provider(),
            &identity.external_id,
            identity.avatar_url.clone(),
        )
        .await
        {
            error!("falha ao vincular provider a conta existente: {e:?}");
            return redirect_de_erro(Some(provider), OAuthError::Session);
        }

        return redirect_com_sessao(conn, user, provider).await;
    }

    let (github_id, google_id) = ids_externos(provider, &identity.external_id);

    let registro = api_register_user(
        State(state_app),
        Json(NewUser {
            name: identity.name,
            email: identity.email.clone(),
            password_hash: None,
            primary_provider: provider.auth_provider(),
            github_id,
            google_id,
            avatar_url: identity.avatar_url,
        }),
    )
    .await;

    if let Err(e) = registro {
        error!("falha ao registrar usuário vindo do OAuth: {e:?}");
        return redirect_de_erro(Some(provider), OAuthError::Session);
    }

    match models::user::find_user_by_email(conn, &identity.email).await {
        Ok(user) => redirect_com_sessao(conn, user, provider).await,
        Err(_) => redirect_de_erro(Some(provider), OAuthError::Session),
    }
}

pub async fn api_link_callback(
    State(state_app): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(params): Query<AuthRequest>,
    headers: HeaderMap,
) -> Response {
    let provider = match resolver(&slug) {
        Ok(provider) => provider,
        Err(erro) => return redirect_de_erro(Provider::from_slug(&slug), erro),
    };

    let user_id = match state::validar(&params.state, provider, Purpose::Link, &headers) {
        Ok(Some(user_id)) => user_id,
        Ok(None) => return redirect_de_erro(Some(provider), OAuthError::InvalidState),
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let redirect_url = match link_callback_url(provider) {
        Ok(url) => url,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let identity = match identidade(provider, params.code, redirect_url).await {
        Ok(identity) => identity,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let conn = &mut match get_conn(&state_app.pool).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("falha ao obter conexão no OAuth: {}", e.1.0);
            return redirect_de_erro(Some(provider), OAuthError::Session);
        }
    };

    if let Ok(dono) = models::user::find_user_by_provider_id(
        conn,
        provider.auth_provider(),
        &identity.external_id,
    )
    .await
        && dono.id != user_id
    {
        return redirect_de_vinculo(provider, "already_linked");
    }

    if let Err(e) = models::user::link_provider_account(
        conn,
        &user_id,
        provider.auth_provider(),
        &identity.external_id,
        identity.avatar_url,
    )
    .await
    {
        error!("falha ao vincular provider ao usuário: {e:?}");
        return redirect_de_vinculo(provider, "link_failed");
    }

    com_cookie(
        Redirect::to(&format!(
            "{}/profile?linked={}",
            frontend_url(),
            provider.slug()
        ))
        .into_response(),
        &state::cookie_expirado(),
    )
}

fn redirect_de_vinculo(provider: Provider, erro: &str) -> Response {
    com_cookie(
        Redirect::to(&format!(
            "{}/profile?link_error={}&provider={}",
            frontend_url(),
            erro,
            provider.slug()
        ))
        .into_response(),
        &state::cookie_expirado(),
    )
}

pub async fn api_unlink(
    State(state_app): State<Arc<AppState>>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id: Uuid = extract_claims_from_header(&headers).await?.1.id;

    let provider = Provider::from_slug(&slug)
        .ok_or_else(|| ApiError::Request("provider desconhecido".to_string()))?;

    let conn = &mut get_conn(&state_app.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = models::user::find_user_by_id(conn, &user_id).await?;

    if !user.provider_vinculado(provider.auth_provider()) {
        return Ok(StatusCode::NO_CONTENT);
    }

    if !user.pode_desvincular(provider.auth_provider()) {
        return Err(ApiError::LastLoginMethod);
    }

    models::user::unlink_provider_account(conn, &user_id, provider.auth_provider()).await?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Serialize)]
pub struct AuthMethodsResponse {
    pub password: bool,
    pub providers: Vec<&'static str>,
    pub primary_provider: models::user::AuthProvider,
}

pub async fn api_auth_methods(
    State(state_app): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AuthMethodsResponse>, ApiError> {
    let user_id: Uuid = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state_app.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = models::user::find_user_by_id(conn, &user_id).await?;

    Ok(Json(AuthMethodsResponse {
        password: user.password_hash.is_some(),
        providers: Provider::ALL
            .iter()
            .filter(|provider| user.provider_vinculado(provider.auth_provider()))
            .map(|provider| provider.slug())
            .collect(),
        primary_provider: user.primary_provider,
    }))
}

#[derive(serde::Serialize)]
pub struct ProvidersResponse {
    pub providers: Vec<&'static str>,
}

pub async fn api_auth_providers() -> Json<ProvidersResponse> {
    Json(ProvidersResponse {
        providers: Provider::configurados()
            .into_iter()
            .map(Provider::slug)
            .collect(),
    })
}
