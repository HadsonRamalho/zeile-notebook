use axum::{
    http::{HeaderValue, header::SET_COOKIE},
    response::{IntoResponse, Redirect, Response},
};
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, Scope,
    TokenResponse, TokenUrl, basic::BasicClient,
};
use tracing::error;

use crate::controllers::utils::get_var_from_env;

use super::provider::{OAuthError, OAuthIdentity, Provider};
use super::state;
use super::{github, google};

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

pub fn frontend_url() -> String {
    get_var_from_env("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string())
}

pub fn login_callback_url(provider: Provider) -> Result<String, OAuthError> {
    let api_url = get_var_from_env("API_URL").map_err(|_| OAuthError::Unavailable)?;

    Ok(format!(
        "{api_url}/api/user/auth/callback/{}",
        provider.slug()
    ))
}

pub fn link_callback_url(provider: Provider) -> Result<String, OAuthError> {
    let api_url = get_var_from_env("API_URL").map_err(|_| OAuthError::Unavailable)?;

    Ok(format!(
        "{api_url}/api/user/link/{}/callback",
        provider.slug()
    ))
}

pub fn resolve(slug: &str) -> Result<Provider, OAuthError> {
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

pub fn with_cookie(mut response: Response, cookie: &str) -> Response {
    match HeaderValue::from_str(cookie) {
        Ok(value) => {
            response.headers_mut().append(SET_COOKIE, value);
        }
        Err(e) => error!("invalid state cookie: {e}"),
    }

    response
}

pub fn error_redirect(provider: Option<Provider>, error: OAuthError) -> Response {
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

pub fn link_redirect(provider: Provider, error: &str) -> Response {
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

pub fn authorize(
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

pub async fn identity(
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

pub fn external_ids(provider: Provider, external_id: &str) -> (Option<String>, Option<String>) {
    match provider {
        Provider::Github => (Some(external_id.to_string()), None),
        Provider::Google => (None, Some(external_id.to_string())),
    }
}
