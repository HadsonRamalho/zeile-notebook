use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        email::send_password_reset_email,
        jwt::{extract_claims_from_header, generate_jwt},
        utils::{Sanitize, get_conn, hash_needs_migration, password_hash, password_verify},
    },
    models::{error::ApiError, state::AppState},
};

use super::dto::{
    LoginUser, RefreshPayload, ResetPasswordPayload, SessionResponse, UpdateUser,
    UpdateUserPassword, UserAuthInfo, UserEmail,
};
use super::entity::{AuthProvider, NewUser, User};
use super::repository;
use super::service::get_user_notebook_permissions;

#[utoipa::path(post, path = "/user/register", responses((status = CREATED, body = String), (status = 401, body = ApiError)))]
pub async fn api_register_user(
    State(state): State<Arc<AppState>>,
    input: Json<NewUser>,
) -> Result<(StatusCode, Json<SessionResponse>), ApiError> {
    let mut user_input = input.0;
    user_input.sanitize();

    if let Err(errors) = user_input.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    if user_input.password_hash.is_some() && user_input.primary_provider == AuthProvider::Email {
        user_input.password_hash = Some(password_hash(&user_input.password_hash.unwrap()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = match repository::register_user(conn, &user_input).await {
        Ok(user) => user,
        Err(e) => return Err(ApiError::Database(e)),
    };

    let user_id = user.id;
    let token = generate_jwt(UserAuthInfo::from(user))?;
    let (_, refresh) = repository::issue(conn, user_id).await?;

    Ok((
        StatusCode::CREATED,
        Json(SessionResponse {
            access_token: token,
            refresh_token: refresh,
            expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
        }),
    ))
}

#[utoipa::path(post, path = "/user/login", responses((status = OK, body = String), (status = 401, body = ApiError)))]
pub async fn api_login_user(
    State(state): State<Arc<AppState>>,
    Json(input): Json<LoginUser>,
) -> Result<Json<SessionResponse>, ApiError> {
    let mut user_input = input;
    user_input.sanitize();

    if let Err(errors) = user_input.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = repository::find_user_by_email(conn, &user_input.email)
        .await
        .map_err(|_| ApiError::InvalidCredentials)?;

    if !user.is_active || user.deleted_at.is_some() {
        return Err(ApiError::NotActiveUser);
    }

    if user.primary_provider != AuthProvider::Email {
        return Err(ApiError::WrongProvider(format!(
            "{:?}",
            user.primary_provider
        )));
    }

    let current_hash = user.password_hash.clone();

    let password_valid = match &current_hash {
        Some(hash) => password_verify(&user_input.password, hash),
        None => false,
    };

    if !password_valid {
        return Err(ApiError::InvalidCredentials);
    }

    if current_hash.as_deref().is_some_and(hash_needs_migration) {
        let new_hash = password_hash(&user_input.password);

        if let Err(e) = repository::rehash_user_password(conn, &user.id, new_hash).await {
            tracing::warn!("failed to migrate password hash for user {}: {e}", user.id);
        }
    }

    let user_id = user.id;
    let token = generate_jwt(UserAuthInfo::from(user))?;
    let (_, refresh) = repository::issue(conn, user_id).await?;

    Ok(Json(SessionResponse {
        access_token: token,
        refresh_token: refresh,
        expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
    }))
}

#[utoipa::path(post, path = "/user/refresh", request_body = RefreshPayload, responses((status = CREATED, body = SessionResponse), (status = 401, body = ApiError)))]
pub async fn api_refresh_session(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshPayload>,
) -> Result<Json<SessionResponse>, ApiError> {
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let current = repository::find_by_token(conn, &payload.refresh_token).await?;

    if !current.usable(chrono::Utc::now()) {
        if current.replaced_by.is_some() {
            tracing::warn!(
                "reuse of rotated refresh token for user {}; revoking sessions",
                current.user_id
            );
            repository::revoke_for_user(conn, current.user_id)
                .await
                .ok();
            state.sessions.invalidate(current.user_id);
        }

        return Err(ApiError::InvalidAuthorizationToken);
    }

    let user = repository::find_user_by_id(conn, &current.user_id).await?;

    if !user.is_active || user.deleted_at.is_some() {
        return Err(ApiError::NotActiveUser);
    }

    let (_, refresh) = repository::rotate(conn, &current).await?;
    let token = generate_jwt(UserAuthInfo::from(user))?;

    Ok(Json(SessionResponse {
        access_token: token,
        refresh_token: refresh,
        expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
    }))
}

#[utoipa::path(post, path = "/user/logout", request_body = RefreshPayload, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_logout(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshPayload>,
) -> Result<StatusCode, ApiError> {
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    if let Ok(current) = repository::find_by_token(conn, &payload.refresh_token).await {
        repository::revoke(conn, current.id).await?;
        state.sessions.invalidate(current.user_id);
    }

    Ok(StatusCode::OK)
}

#[utoipa::path(patch, path = "/user/update", request_body = UpdateUser, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_update_user_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    input: Json<UpdateUser>,
) -> Result<StatusCode, ApiError> {
    let mut user_input = input.0;
    user_input.sanitize();

    if let Err(errors) = user_input.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    if repository::find_user_by_id(conn, &id).await.is_err() {
        return Err(ApiError::UserNotFound);
    }

    match repository::update_user_data(conn, &id, &user_input).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(e),
    }
}

#[utoipa::path(get, path = "/user/me", responses((status = OK, body = User), (status = 401, body = ApiError)))]
pub async fn api_get_logged_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<User>, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = repository::find_user_by_id(conn, &id)
        .await
        .map_err(|_| ApiError::UserNotFound)?;

    Ok(Json(user))
}

#[utoipa::path(delete, path = "/user/", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    repository::delete_user(conn, &id).await?;

    Ok(StatusCode::OK)
}

#[utoipa::path(patch, path = "/user/password", request_body = UpdateUserPassword, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_update_user_password(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    input: Json<UpdateUserPassword>,
) -> Result<StatusCode, ApiError> {
    let user_input = input.0;

    if let Err(errors) = user_input.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    if user_input.confirm_password != user_input.new_password {
        return Err(ApiError::PasswordsDoNotMatch);
    }

    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = repository::find_user_by_id(conn, &id).await?;

    if user.primary_provider != AuthProvider::Email {
        return Err(ApiError::WrongProvider("E-mail".to_string()));
    }

    let is_current_password_valid = match &user.password_hash {
        Some(hash) => password_verify(&user_input.current_password, hash),
        None => false,
    };

    if !is_current_password_valid {
        return Err(ApiError::InvalidPassword);
    }

    let hashed = password_hash(&user_input.new_password);

    repository::update_user_password(conn, &id, hashed).await?;

    let revoked = repository::revoke_for_user(conn, id).await?;
    state.sessions.invalidate(id);

    tracing::info!("password changed; {revoked} session(s) revoked for user {id}");

    Ok(StatusCode::OK)
}

#[utoipa::path(get, path = "/notebook/{id}/permissions", responses((status = OK, body = crate::domain::team::TeamRoleView), (status = 401, body = ApiError)))]
pub async fn api_get_user_notebook_permissions(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<crate::domain::team::TeamRoleView>, ApiError> {
    let id = match extract_claims_from_header(&headers).await {
        Ok(data) => Some(data.1.id),
        Err(_) => None,
    };

    get_user_notebook_permissions(&state.pool, &notebook_id, id).await
}

#[utoipa::path(post, path = "/user/request-password-reset", request_body = UserEmail, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_request_password_reset(
    State(state): State<Arc<AppState>>,
    Json(input): Json<UserEmail>,
) -> Result<StatusCode, ApiError> {
    let mut email = input;
    email.sanitize();

    if let Err(errors) = email.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = match repository::find_user_by_email(conn, &email.email).await {
        Ok(u) => u,
        Err(_) => return Ok(StatusCode::OK),
    };

    if user.primary_provider != AuthProvider::Email {
        return Err(ApiError::WrongProvider(format!(
            "{:?}",
            user.primary_provider
        )));
    }

    let reset_token = crate::controllers::jwt::generate_reset_token(user.id)?;
    let frontend_url = crate::controllers::utils::get_frontend_url_from_env()
        .unwrap_or_else(|_| "http://localhost:3000".to_string());

    let reset_link = format!("{}/reset-password?token={}", frontend_url, reset_token);

    send_password_reset_email(&user, &reset_link).await?;

    Ok(StatusCode::OK)
}

#[utoipa::path(post, path = "/user/execute-password-reset", request_body = ResetPasswordPayload, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_execute_password_reset(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ResetPasswordPayload>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let claims = crate::controllers::jwt::verify_reset_token(&payload.token)?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = repository::find_user_by_id(conn, &claims.sub).await?;

    if crate::controllers::jwt::reset_token_was_consumed(&claims, user.password_changed_at) {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    let hashed_password = crate::controllers::utils::password_hash(&payload.new_password);

    repository::update_user_password(conn, &claims.sub, hashed_password).await?;

    let revoked = repository::revoke_for_user(conn, claims.sub).await?;
    state.sessions.invalidate(claims.sub);

    tracing::info!(
        "password reset; {revoked} session(s) revoked for user {}",
        claims.sub
    );

    Ok(StatusCode::OK)
}
