use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Pool};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        email::send_password_reset_email,
        jwt::{extract_claims_from_header, generate_jwt},
        utils::{Sanitize, get_conn, hash_needs_migration, password_hash, password_verify},
    },
    models::{
        self,
        error::ApiError,
        state::AppState,
        team::{RolePermissions, TeamRoleView},
        user::{
            AuthProvider, LoginUser, NewUser, ResetPasswordPayload, UpdateUser, UpdateUserPassword,
            User, UserAuthInfo, UserEmail,
        },
    },
};

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

    let user = match models::user::register_user(conn, &user_input).await {
        Ok(user) => user,
        Err(e) => return Err(ApiError::Database(e)),
    };

    let user_id = user.id;
    let token = generate_jwt(UserAuthInfo::from(user))?;
    let (_, refresh) = models::refresh_token::issue(conn, user_id).await?;

    Ok((
        StatusCode::CREATED,
        Json(SessionResponse {
            access_token: token,
            refresh_token: refresh,
            expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
        }),
    ))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in_secs: i64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshPayload {
    pub refresh_token: String,
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

    let user = models::user::find_user_by_email(conn, &user_input.email)
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

        if let Err(e) = models::user::rehash_user_password(conn, &user.id, new_hash).await {
            tracing::warn!("failed to migrate password hash for user {}: {e}", user.id);
        }
    }

    let user_id = user.id;
    let token = generate_jwt(UserAuthInfo::from(user))?;
    let (_, refresh) = models::refresh_token::issue(conn, user_id).await?;

    Ok(Json(SessionResponse {
        access_token: token,
        refresh_token: refresh,
        expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
    }))
}

/// Exchanges a refresh token for a new pair. The used token is revoked and
/// points to its replacement, so reuse of an already-rotated token is detectable.
#[utoipa::path(post, path = "/user/refresh", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_refresh_session(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshPayload>,
) -> Result<Json<SessionResponse>, ApiError> {
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let current = models::refresh_token::find_by_token(conn, &payload.refresh_token).await?;

    if !current.usable(chrono::Utc::now()) {
        // Reuse of an already-rotated token is a sign of a leak: drop the
        // whole family instead of just refusing this one attempt.
        if current.replaced_by.is_some() {
            tracing::warn!(
                "reuse of rotated refresh token for user {}; revoking sessions",
                current.user_id
            );
            let _ = models::refresh_token::revoke_for_user(conn, current.user_id).await;
            state.sessions.invalidate(current.user_id);
        }

        return Err(ApiError::InvalidAuthorizationToken);
    }

    let user = models::user::find_user_by_id(conn, &current.user_id).await?;

    if !user.is_active || user.deleted_at.is_some() {
        return Err(ApiError::NotActiveUser);
    }

    let (_, refresh) = models::refresh_token::rotate(conn, &current).await?;
    let token = generate_jwt(UserAuthInfo::from(user))?;

    Ok(Json(SessionResponse {
        access_token: token,
        refresh_token: refresh,
        expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
    }))
}

#[utoipa::path(post, path = "/user/logout", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_logout(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshPayload>,
) -> Result<StatusCode, ApiError> {
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    // Logout of an unknown token responds OK: saying it doesn't exist would
    // give an oracle for valid tokens.
    if let Ok(current) = models::refresh_token::find_by_token(conn, &payload.refresh_token).await {
        models::refresh_token::revoke(conn, current.id).await?;
        state.sessions.invalidate(current.user_id);
    }

    Ok(StatusCode::OK)
}

#[utoipa::path(patch, path = "/user/update", responses((status = OK), (status = 401, body = ApiError)))]
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

    match models::user::find_user_by_id(conn, &id).await {
        Err(_) => {
            return Err(ApiError::UserNotFound);
        }
        _ => {}
    };

    match models::user::update_user_data(conn, &id, &user_input).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(e),
    }
}

#[utoipa::path(get, path = "/user/me", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_get_logged_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<User>, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = models::user::find_user_by_id(conn, &id)
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

    let _ = models::user::delete_user(conn, &id).await?;

    Ok(StatusCode::OK)
}

#[utoipa::path(patch, path = "/user/password", responses((status = OK), (status = 401, body = ApiError)))]
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

    let user = models::user::find_user_by_id(conn, &id).await?;

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

    let password_hash = password_hash(&user_input.new_password);

    models::user::update_user_password(conn, &id, password_hash).await?;

    let revoked = models::refresh_token::revoke_for_user(conn, id).await?;
    state.sessions.invalidate(id);

    tracing::info!("password changed; {revoked} session(s) revoked for user {id}");

    Ok(StatusCode::OK)
}

pub fn get_user_owner_permissions() -> TeamRoleView {
    TeamRoleView::synthetic("Notebook Owner", RolePermissions::all())
}

pub async fn get_user_notebook_permissions(
    pool: &Pool<AsyncPgConnection>,
    notebook_id: &Uuid,
    user_id: Option<Uuid>,
) -> Result<Json<TeamRoleView>, ApiError> {
    let conn = &mut get_conn(&pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let notebook = models::notebook::find_notebook_by_id(conn, notebook_id).await?;

    if let Some(notebook_user_id) = notebook.user_id {
        if let Some(id) = user_id
            && notebook_user_id == id
        {
            return Ok(Json(get_user_owner_permissions()));
        }
    }

    let team_id = match notebook.team_id {
        Some(id) => id,
        None => {
            if notebook.is_public {
                return Ok(Json(TeamRoleView::view_only()));
            }
            return Ok(Json(TeamRoleView::all_false()));
        }
    };

    let Some(id) = user_id else {
        if notebook.is_public {
            return Ok(Json(TeamRoleView::view_only()));
        }
        return Ok(Json(TeamRoleView::all_false()));
    };

    let role = match models::team::find_team_member_with_role(conn, team_id, id).await {
        Ok((_, role)) => role,
        Err(e) => {
            if notebook.is_public {
                return Ok(Json(TeamRoleView::view_only()));
            }
            return Err(e);
        }
    };

    Ok(Json(models::team::build_role_view(conn, &role).await?))
}

#[utoipa::path(get, path = "/notebook/{id}/permissions", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_get_user_notebook_permissions(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<TeamRoleView>, ApiError> {
    let id = match extract_claims_from_header(&headers).await {
        Ok(data) => Some(data.1.id),
        Err(_) => None,
    };

    let permissions = get_user_notebook_permissions(&state.pool, &notebook_id, id).await?;

    Ok(permissions)
}

#[utoipa::path(post, path = "/user/request-password-reset", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_request_password_reset(
    State(state): State<Arc<AppState>>,
    Json(input): Json<UserEmail>,
) -> Result<StatusCode, ApiError> {
    let mut email = input;
    email.sanitize();

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = match models::user::find_user_by_email(conn, &email.email).await {
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

#[utoipa::path(post, path = "/user/execute-password-reset", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_execute_password_reset(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ResetPasswordPayload>,
) -> Result<StatusCode, ApiError> {
    let claims = crate::controllers::jwt::verify_reset_token(&payload.token)?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = models::user::find_user_by_id(conn, &claims.sub).await?;

    if crate::controllers::jwt::reset_token_was_consumed(&claims, user.password_changed_at) {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    let hashed_password = crate::controllers::utils::password_hash(&payload.new_password);

    models::user::update_user_password(conn, &claims.sub, hashed_password).await?;

    let revoked = models::refresh_token::revoke_for_user(conn, claims.sub).await?;
    state.sessions.invalidate(claims.sub);

    tracing::info!(
        "password reset; {revoked} session(s) revoked for user {}",
        claims.sub
    );

    Ok(StatusCode::OK)
}
