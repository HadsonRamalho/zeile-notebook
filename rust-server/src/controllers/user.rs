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
        utils::{Sanitize, get_conn, hash_precisa_migrar, password_hash, password_verify},
    },
    models::{
        self,
        error::ApiError,
        state::AppState,
        team::TeamRole,
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
) -> Result<(StatusCode, Json<SessaoResponse>), ApiError> {
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
    let (_, refresh) = models::refresh_token::emitir(conn, user_id).await?;

    Ok((
        StatusCode::CREATED,
        Json(SessaoResponse {
            access_token: token,
            refresh_token: refresh,
            expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
        }),
    ))
}

#[derive(serde::Serialize)]
pub struct SessaoResponse {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    #[serde(rename = "expiresInSecs")]
    pub expires_in_secs: i64,
}

#[derive(serde::Deserialize)]
pub struct RefreshPayload {
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
}

#[utoipa::path(post, path = "/user/login", responses((status = OK, body = String), (status = 401, body = ApiError)))]
pub async fn api_login_user(
    State(state): State<Arc<AppState>>,
    Json(input): Json<LoginUser>,
) -> Result<Json<SessaoResponse>, ApiError> {
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

    let hash_atual = user.password_hash.clone();

    let password_valid = match &hash_atual {
        Some(hash) => password_verify(&user_input.password, hash),
        None => false,
    };

    if !password_valid {
        return Err(ApiError::InvalidCredentials);
    }

    if hash_atual.as_deref().is_some_and(hash_precisa_migrar) {
        let novo_hash = password_hash(&user_input.password);

        if let Err(e) = models::user::rehash_user_password(conn, &user.id, novo_hash).await {
            tracing::warn!("falha ao migrar hash de senha do usuário {}: {e}", user.id);
        }
    }

    let user_id = user.id;
    let token = generate_jwt(UserAuthInfo::from(user))?;
    let (_, refresh) = models::refresh_token::emitir(conn, user_id).await?;

    Ok(Json(SessaoResponse {
        access_token: token,
        refresh_token: refresh,
        expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
    }))
}

/// Troca um refresh token por um par novo. O token usado é revogado e aponta
/// para o substituto, então reuso de token já rotacionado é detectável.
pub async fn api_refresh_session(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshPayload>,
) -> Result<Json<SessaoResponse>, ApiError> {
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let atual = models::refresh_token::buscar_por_token(conn, &payload.refresh_token).await?;

    if !atual.utilizavel(chrono::Utc::now()) {
        // Reuso de um token já rotacionado é sinal de vazamento: derruba a
        // familia inteira em vez de só recusar esta tentativa.
        if atual.replaced_by.is_some() {
            tracing::warn!(
                "reuso de refresh token rotacionado do usuário {}; revogando sessões",
                atual.user_id
            );
            let _ = models::refresh_token::revogar_do_usuario(conn, atual.user_id).await;
            state.sessoes.invalidar(atual.user_id);
        }

        return Err(ApiError::InvalidAuthorizationToken);
    }

    let user = models::user::find_user_by_id(conn, &atual.user_id).await?;

    if !user.is_active || user.deleted_at.is_some() {
        return Err(ApiError::NotActiveUser);
    }

    let (_, refresh) = models::refresh_token::rotacionar(conn, &atual).await?;
    let token = generate_jwt(UserAuthInfo::from(user))?;

    Ok(Json(SessaoResponse {
        access_token: token,
        refresh_token: refresh,
        expires_in_secs: crate::controllers::jwt::access_token_ttl_secs(),
    }))
}

pub async fn api_logout(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshPayload>,
) -> Result<StatusCode, ApiError> {
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    // Logout de token desconhecido responde OK: dizer que não existe entregaria
    // um oráculo de tokens válidos.
    if let Ok(atual) = models::refresh_token::buscar_por_token(conn, &payload.refresh_token).await {
        models::refresh_token::revogar(conn, atual.id).await?;
        state.sessoes.invalidar(atual.user_id);
    }

    Ok(StatusCode::OK)
}

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

    let revogados = models::refresh_token::revogar_do_usuario(conn, id).await?;
    state.sessoes.invalidar(id);

    tracing::info!("senha trocada; {revogados} sessão(ões) revogada(s) do usuário {id}");

    Ok(StatusCode::OK)
}

pub fn get_user_owner_permissions() -> TeamRole {
    let permissions = TeamRole {
        id: Uuid::new_v4(),
        team_id: Uuid::new_v4(),
        name: "Notebook Owner".to_string(),
        can_read: true,
        can_write: true,
        can_manage_privacy: true,
        can_manage_clones: true,
        can_invite_users: true,
        can_remove_users: true,
        can_manage_permissions: true,
        created_at: chrono::Utc::now().naive_local(),
        can_manage_team: true,
    };

    permissions
}

pub async fn get_user_notebook_permissions(
    pool: &Pool<AsyncPgConnection>,
    notebook_id: &Uuid,
    user_id: Option<Uuid>,
) -> Result<Json<TeamRole>, ApiError> {
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
                return Ok(Json(TeamRole::get_view_only()));
            }
            return Ok(Json(TeamRole::get_all_false()));
        }
    };

    let permissions = if let Some(id) = user_id {
        let permissions = match models::team::find_team_member_with_role(conn, team_id, id).await {
            Ok(p) => p.1,
            Err(e) => {
                if notebook.is_public {
                    return Ok(Json(TeamRole::get_view_only()));
                }
                return Err(e);
            }
        };
        permissions
    } else {
        if notebook.is_public {
            TeamRole::get_view_only()
        } else {
            TeamRole::get_all_false()
        }
    };

    Ok(Json(permissions))
}

pub async fn api_get_user_notebook_permissions(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<TeamRole>, ApiError> {
    let id = match extract_claims_from_header(&headers).await {
        Ok(data) => Some(data.1.id),
        Err(_) => None,
    };

    let permissions = get_user_notebook_permissions(&state.pool, &notebook_id, id).await?;

    Ok(permissions)
}

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

pub async fn api_execute_password_reset(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ResetPasswordPayload>,
) -> Result<StatusCode, ApiError> {
    let claims = crate::controllers::jwt::verify_reset_token(&payload.token)?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = models::user::find_user_by_id(conn, &claims.sub).await?;

    if crate::controllers::jwt::reset_token_foi_consumido(&claims, user.password_changed_at) {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    let hashed_password = crate::controllers::utils::password_hash(&payload.new_password);

    models::user::update_user_password(conn, &claims.sub, hashed_password).await?;

    let revogados = models::refresh_token::revogar_do_usuario(conn, claims.sub).await?;
    state.sessoes.invalidar(claims.sub);

    tracing::info!(
        "senha redefinida; {revogados} sessão(ões) revogada(s) do usuário {}",
        claims.sub
    );

    Ok(StatusCode::OK)
}
