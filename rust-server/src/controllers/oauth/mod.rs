pub mod github;
pub mod provider;

use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    response::{IntoResponse, Redirect, Response},
};
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, Scope,
    TokenResponse, TokenUrl, basic::BasicClient,
};
use tracing::error;

use crate::{
    controllers::{
        jwt::generate_jwt,
        oauth::provider::{OAuthError, OAuthIdentity, Provider},
        user::api_register_user,
        utils::{get_conn, get_var_from_env},
    },
    models::{
        self,
        oauth::AuthRequest,
        state::AppState,
        user::{NewUser, UserAuthInfo},
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

    Ok(format!("{api_url}/api/user/link/{}/callback", provider.slug()))
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

fn redirect_de_erro(provider: Option<Provider>, erro: OAuthError) -> Response {
    Redirect::to(&format!(
        "{}/login?auth_error={}",
        frontend_url(),
        erro.code(provider)
    ))
    .into_response()
}

fn autorizar(provider: Provider, redirect_url: String) -> Result<Response, OAuthError> {
    let client = oauth_client!(provider, redirect_url);

    let mut request = client.authorize_url(CsrfToken::new_random);
    for scope in provider.scopes() {
        request = request.add_scope(Scope::new(scope.to_string()));
    }

    let (auth_url, _csrf_token) = request.url();

    Ok(Redirect::to(auth_url.as_str()).into_response())
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

    match provider {
        Provider::Github => github::identidade(&http_client, access_token).await,
    }
}

fn ids_externos(provider: Provider, external_id: &str) -> (Option<String>, Option<String>) {
    match provider {
        Provider::Github => (Some(external_id.to_string()), None),
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
    user: models::user::User,
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

    Redirect::to(&format!(
        "{}/auth-callback?token={}&refresh={}",
        frontend_url(),
        token,
        refresh
    ))
    .into_response()
}

pub async fn api_oauth_login(Path(slug): Path<String>) -> Response {
    let inicio = resolver(&slug).and_then(|provider| {
        let redirect_url = login_callback_url(provider)?;
        autorizar(provider, redirect_url)
    });

    match inicio {
        Ok(response) => response,
        Err(erro) => redirect_de_erro(Provider::from_slug(&slug), erro),
    }
}

pub async fn api_link_init(Path(slug): Path<String>) -> Response {
    let inicio = resolver(&slug).and_then(|provider| {
        let redirect_url = link_callback_url(provider)?;
        autorizar(provider, redirect_url)
    });

    match inicio {
        Ok(response) => response,
        Err(erro) => redirect_de_erro(Provider::from_slug(&slug), erro),
    }
}

pub async fn api_oauth_callback(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(params): Query<AuthRequest>,
) -> Response {
    let provider = match resolver(&slug) {
        Ok(provider) => provider,
        Err(erro) => return redirect_de_erro(Provider::from_slug(&slug), erro),
    };

    let redirect_url = match login_callback_url(provider) {
        Ok(url) => url,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let identity = match identidade(provider, params.code, redirect_url).await {
        Ok(identity) => identity,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let conn = &mut match get_conn(&state.pool).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("falha ao obter conexão no OAuth: {}", e.1.0);
            return redirect_de_erro(Some(provider), OAuthError::Session);
        }
    };

    if let Ok(user) = models::user::find_user_by_email(conn, &identity.email).await {
        if user.primary_provider != provider.auth_provider() {
            return Redirect::to(&format!(
                "{}/login?auth_error=wrong_login_method",
                frontend_url()
            ))
            .into_response();
        }

        return redirect_com_sessao(conn, user, provider).await;
    }

    let (github_id, google_id) = ids_externos(provider, &identity.external_id);

    let registro = api_register_user(
        State(state),
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
        Err(_) => Redirect::to(&frontend_url()).into_response(),
    }
}

pub async fn api_link_callback(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(params): Query<AuthRequest>,
) -> Response {
    let provider = match resolver(&slug) {
        Ok(provider) => provider,
        Err(erro) => return redirect_de_erro(Provider::from_slug(&slug), erro),
    };

    let redirect_url = match link_callback_url(provider) {
        Ok(url) => url,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let identity = match identidade(provider, params.code, redirect_url).await {
        Ok(identity) => identity,
        Err(erro) => return redirect_de_erro(Some(provider), erro),
    };

    let conn = &mut match get_conn(&state.pool).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("falha ao obter conexão no OAuth: {}", e.1.0);
            return redirect_de_erro(Some(provider), OAuthError::Session);
        }
    };

    let user = match models::user::find_user_by_email(conn, &identity.email).await {
        Ok(user) => user,
        Err(_) => return redirect_de_erro(Some(provider), OAuthError::EmailNotFound),
    };

    if let Err(e) = models::user::update_user_provider(
        conn,
        &user.id,
        provider.auth_provider(),
        identity.avatar_url,
    )
    .await
    {
        error!("falha ao vincular provider ao usuário: {e:?}");
        return redirect_de_erro(Some(provider), OAuthError::EmailNotFound);
    }

    redirect_com_sessao(conn, user, provider).await
}
