use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use tracing::error;
use uuid::Uuid;

use crate::{
    controllers::{
        jwt::{extract_claims_from_header, generate_jwt},
        utils::get_conn,
    },
    models::{error::ApiError, state::AppState},
};

use super::entity::AuthRequest;
use super::provider::{OAuthError, Provider};
use super::service::{
    authorize, error_redirect, external_ids, frontend_url, identity, link_callback_url,
    link_redirect, login_callback_url, resolve, with_cookie,
};
use super::state::{self, Purpose};

use crate::domain::user::dto::{
    AuthMethodsResponse, LinkStartResponse, ProvidersResponse, UserAuthInfo,
};
use crate::domain::user::entity::{NewUser, User};
use crate::domain::user::{controller as user_controller, repository as user_repository};

async fn redirect_with_session(
    conn: &mut diesel_async::AsyncPgConnection,
    user: User,
    provider: Provider,
) -> Response {
    let user_id = user.id;

    let Ok(token) = generate_jwt(UserAuthInfo::from(user)) else {
        return error_redirect(Some(provider), OAuthError::Session);
    };

    let refresh = match user_repository::issue(conn, user_id).await {
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
        axum::response::Redirect::to(&destination).into_response(),
        &state::expired_cookie(),
    )
}

#[utoipa::path(get, path = "/user/login/{provider}", responses((status = OK)))]
pub async fn api_oauth_login(Path(slug): Path<String>) -> Response {
    let start = resolve(&slug).and_then(|provider| {
        let redirect_url = login_callback_url(provider)?;
        let challenge = state::issue(provider, Purpose::Login, None)?;
        let url = authorize(provider, redirect_url, &challenge.state)?;

        Ok((url, challenge.set_cookie))
    });

    match start {
        Ok((url, cookie)) => {
            with_cookie(axum::response::Redirect::to(&url).into_response(), &cookie)
        }
        Err(error) => error_redirect(Provider::from_slug(&slug), error),
    }
}

#[utoipa::path(post, path = "/user/link/{provider}", responses((status = CREATED, body = crate::domain::user::LinkStartResponse), (status = 401, body = ApiError)))]
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

#[utoipa::path(get, path = "/user/auth/callback/{provider}", responses((status = OK)))]
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

    let by_id = user_repository::find_user_by_provider_id(
        conn,
        provider.auth_provider(),
        &identity.external_id,
    )
    .await;

    if let Ok(user) = by_id {
        return redirect_with_session(conn, user, provider).await;
    }

    if let Ok(user) = user_repository::find_user_by_email(conn, &identity.email).await {
        if let Err(e) = user_repository::link_provider_account(
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

    let registration = user_controller::api_register_user(
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

    match user_repository::find_user_by_email(conn, &identity.email).await {
        Ok(user) => redirect_with_session(conn, user, provider).await,
        Err(_) => error_redirect(Some(provider), OAuthError::Session),
    }
}

#[utoipa::path(get, path = "/user/link/{provider}/callback", responses((status = OK)))]
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

    if let Ok(owner) = user_repository::find_user_by_provider_id(
        conn,
        provider.auth_provider(),
        &identity.external_id,
    )
    .await
        && owner.id != user_id
    {
        return link_redirect(provider, "already_linked");
    }

    if let Err(e) = user_repository::link_provider_account(
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
        axum::response::Redirect::to(&format!(
            "{}/profile?linked={}",
            frontend_url(),
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

    let user = user_repository::find_user_by_id(conn, &user_id).await?;

    if !user.provider_linked(provider.auth_provider()) {
        return Ok(StatusCode::NO_CONTENT);
    }

    if !user.can_unlink(provider.auth_provider()) {
        return Err(ApiError::LastLoginMethod);
    }

    user_repository::unlink_provider_account(conn, &user_id, provider.auth_provider()).await?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(get, path = "/user/auth/methods", responses((status = OK, body = AuthMethodsResponse), (status = 401, body = ApiError)))]
pub async fn api_auth_methods(
    State(state_app): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AuthMethodsResponse>, ApiError> {
    let user_id: Uuid = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state_app.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = user_repository::find_user_by_id(conn, &user_id).await?;

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

#[utoipa::path(get, path = "/auth/providers", responses((status = OK, body = ProvidersResponse)))]
pub async fn api_auth_providers() -> Json<ProvidersResponse> {
    Json(ProvidersResponse {
        providers: Provider::configured()
            .into_iter()
            .map(Provider::slug)
            .collect(),
    })
}
