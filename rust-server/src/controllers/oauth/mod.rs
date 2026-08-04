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

fn resolve(slug: &str) -> Result<Provider, OAuthError> {
    let provider = Provider::from_slug(slug).ok_or(OAuthError::UnknownProvider)?;

    if !provider.is_configured() {
        tracing::warn!(
            "OAuth for {} unavailable: missing API_URL/{}/{}",
            provider.slug(),
            provider.client_id_var(),
            provider.client_secret_var()
        );
        return Err(OAuthError::Unavailable);
    }

    Ok(provider)
}

fn with_cookie(mut response: Response, cookie: &str) -> Response {
    match HeaderValue::from_str(cookie) {
        Ok(value) => {
            response.headers_mut().append(SET_COOKIE, value);
        }
        Err(e) => error!("invalid state cookie: {e}"),
    }

    response
}

fn error_redirect(provider: Option<Provider>, error: OAuthError) -> Response {
    let destination = format!(
        "{}/login?auth_error={}",
        frontend_url(),
        error.code(provider)
    );

    with_cookie(
        Redirect::to(&destination).into_response(),
        &state::expired_cookie(),
    )
}

fn authorize(
    provider: Provider,
    redirect_url: String,
    challenge: &str,
) -> Result<String, OAuthError> {
    let client = oauth_client!(provider, redirect_url);

    let mut request = client.authorize_url(|| CsrfToken::new(challenge.to_string()));
    for scope in provider.scopes() {
        request = request.add_scope(Scope::new(scope.to_string()));
    }

    let (auth_url, _) = request.url();

    Ok(auth_url.to_string())
}

async fn identity(
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
            error!("Error validating token: {e}");
            OAuthError::TokenExchange
        })?;

    let http_client = crate::outbound::http_client();
    let access_token = token.access_token().secret();

    let identity = match provider {
        Provider::Github => github::identity(&http_client, access_token).await?,
        Provider::Google => google::identity(&http_client, access_token).await?,
    };

    if !identity.email_verified {
        tracing::warn!(
            "login for {} refused: unverified email at the provider",
            provider.slug()
        );
        return Err(OAuthError::EmailNotVerified);
    }

    Ok(identity)
}

fn external_ids(provider: Provider, external_id: &str) -> (Option<String>, Option<String>) {
    match provider {
        Provider::Github => (Some(external_id.to_string()), None),
        Provider::Google => (None, Some(external_id.to_string())),
    }
}

/// Redirects to the front with the token pair. The 15-minute access token
/// alone would let the OAuth session drop after 15 minutes, with no way to renew.
///
/// The refresh travels in the query the same way the access token already
/// did — meaning both pass through browser history. That's the weakness this
/// flow already had; swapping it for a single-use exchange code is the natural evolution.
async fn redirect_with_session(
    conn: &mut diesel_async::AsyncPgConnection,
    user: User,
    provider: Provider,
) -> Response {
    let user_id = user.id;

    let Ok(token) = generate_jwt(UserAuthInfo::from(user)) else {
        return error_redirect(Some(provider), OAuthError::Session);
    };

    let refresh = match models::refresh_token::issue(conn, user_id).await {
        Ok((_, refresh)) => refresh,
        Err(e) => {
            error!("failed to issue refresh token in OAuth: {e}");
            return error_redirect(Some(provider), OAuthError::Session);
        }
    };

    let destination = format!(
        "{}/auth-callback?token={}&refresh={}",
        frontend_url(),
        token,
        refresh
    );

    with_cookie(
        Redirect::to(&destination).into_response(),
        &state::expired_cookie(),
    )
}

#[utoipa::path(get, path = "/user/login/{provider}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_oauth_login(Path(slug): Path<String>) -> Response {
    let start = resolve(&slug).and_then(|provider| {
        let redirect_url = login_callback_url(provider)?;
        let challenge = state::issue(provider, Purpose::Login, None)?;
        let url = authorize(provider, redirect_url, &challenge.state)?;

        Ok((url, challenge.set_cookie))
    });

    match start {
        Ok((url, cookie)) => with_cookie(Redirect::to(&url).into_response(), &cookie),
        Err(error) => error_redirect(Provider::from_slug(&slug), error),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkStartResponse {
    pub url: String,
}

#[utoipa::path(post, path = "/user/link/{provider}", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_link_start(
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let provider = resolve(&slug).map_err(|error| match error {
        OAuthError::UnknownProvider => ApiError::Request("provider desconhecido".to_string()),
        _ => ApiError::MissingEnv("OAUTH_PROVIDER".to_string()),
    })?;

    let redirect_url =
        link_callback_url(provider).map_err(|_| ApiError::MissingEnv("API_URL".to_string()))?;

    let challenge = state::issue(provider, Purpose::Link, Some(user_id))
        .map_err(|_| ApiError::CreateToken("state do OAuth".to_string()))?;

    let url = authorize(provider, redirect_url, &challenge.state)
        .map_err(|_| ApiError::MissingEnv("OAUTH_PROVIDER".to_string()))?;

    Ok(with_cookie(
        Json(LinkStartResponse { url }).into_response(),
        &challenge.set_cookie,
    ))
}

#[utoipa::path(get, path = "/user/auth/callback/{provider}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_oauth_callback(
    State(state_app): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(params): Query<AuthRequest>,
    headers: HeaderMap,
) -> Response {
    let provider = match resolve(&slug) {
        Ok(provider) => provider,
        Err(error) => return error_redirect(Provider::from_slug(&slug), error),
    };

    if let Err(error) = state::validate(&params.state, provider, Purpose::Login, &headers) {
        return error_redirect(Some(provider), error);
    }

    let redirect_url = match login_callback_url(provider) {
        Ok(url) => url,
        Err(error) => return error_redirect(Some(provider), error),
    };

    let identity = match identity(provider, params.code, redirect_url).await {
        Ok(identity) => identity,
        Err(error) => return error_redirect(Some(provider), error),
    };

    let conn = &mut match get_conn(&state_app.pool).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("failed to obtain connection in OAuth: {}", e.1.0);
            return error_redirect(Some(provider), OAuthError::Session);
        }
    };

    let by_id = models::user::find_user_by_provider_id(
        conn,
        provider.auth_provider(),
        &identity.external_id,
    )
    .await;

    if let Ok(user) = by_id {
        return redirect_with_session(conn, user, provider).await;
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
            error!("failed to link provider to existing account: {e:?}");
            return error_redirect(Some(provider), OAuthError::Session);
        }

        return redirect_with_session(conn, user, provider).await;
    }

    let (github_id, google_id) = external_ids(provider, &identity.external_id);

    let registration = api_register_user(
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

    if let Err(e) = registration {
        error!("failed to register user coming from OAuth: {e:?}");
        return error_redirect(Some(provider), OAuthError::Session);
    }

    match models::user::find_user_by_email(conn, &identity.email).await {
        Ok(user) => redirect_with_session(conn, user, provider).await,
        Err(_) => error_redirect(Some(provider), OAuthError::Session),
    }
}

#[utoipa::path(get, path = "/user/link/{provider}/callback", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_link_callback(
    State(state_app): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(params): Query<AuthRequest>,
    headers: HeaderMap,
) -> Response {
    let provider = match resolve(&slug) {
        Ok(provider) => provider,
        Err(error) => return error_redirect(Provider::from_slug(&slug), error),
    };

    let user_id = match state::validate(&params.state, provider, Purpose::Link, &headers) {
        Ok(Some(user_id)) => user_id,
        Ok(None) => return error_redirect(Some(provider), OAuthError::InvalidState),
        Err(error) => return error_redirect(Some(provider), error),
    };

    let redirect_url = match link_callback_url(provider) {
        Ok(url) => url,
        Err(error) => return error_redirect(Some(provider), error),
    };

    let identity = match identity(provider, params.code, redirect_url).await {
        Ok(identity) => identity,
        Err(error) => return error_redirect(Some(provider), error),
    };

    let conn = &mut match get_conn(&state_app.pool).await {
        Ok(conn) => conn,
        Err(e) => {
            error!("failed to obtain connection in OAuth: {}", e.1.0);
            return error_redirect(Some(provider), OAuthError::Session);
        }
    };

    if let Ok(owner) = models::user::find_user_by_provider_id(
        conn,
        provider.auth_provider(),
        &identity.external_id,
    )
    .await
        && owner.id != user_id
    {
        return link_redirect(provider, "already_linked");
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
        error!("failed to link provider to user: {e:?}");
        return link_redirect(provider, "link_failed");
    }

    with_cookie(
        Redirect::to(&format!(
            "{}/profile?linked={}",
            frontend_url(),
            provider.slug()
        ))
        .into_response(),
        &state::expired_cookie(),
    )
}

fn link_redirect(provider: Provider, error: &str) -> Response {
    with_cookie(
        Redirect::to(&format!(
            "{}/profile?link_error={}&provider={}",
            frontend_url(),
            error,
            provider.slug()
        ))
        .into_response(),
        &state::expired_cookie(),
    )
}

#[utoipa::path(delete, path = "/user/link/{provider}", responses((status = OK), (status = 401, body = ApiError)))]
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

    if !user.provider_linked(provider.auth_provider()) {
        return Ok(StatusCode::NO_CONTENT);
    }

    if !user.can_unlink(provider.auth_provider()) {
        return Err(ApiError::LastLoginMethod);
    }

    models::user::unlink_provider_account(conn, &user_id, provider.auth_provider()).await?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthMethodsResponse {
    pub password: bool,
    pub providers: Vec<&'static str>,
    pub primary_provider: models::user::AuthProvider,
}

#[utoipa::path(get, path = "/user/auth/methods", responses((status = OK), (status = 401, body = ApiError)))]
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
            .filter(|provider| user.provider_linked(provider.auth_provider()))
            .map(|provider| provider.slug())
            .collect(),
        primary_provider: user.primary_provider,
    }))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersResponse {
    pub providers: Vec<&'static str>,
}

#[utoipa::path(get, path = "/auth/providers", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_auth_providers() -> Json<ProvidersResponse> {
    Json(ProvidersResponse {
        providers: Provider::configured()
            .into_iter()
            .map(Provider::slug)
            .collect(),
    })
}
