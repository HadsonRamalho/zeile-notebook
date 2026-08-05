use axum::{
    Json,
    extract::{Query, State},
};
use diesel_async::AsyncPgConnection;
use hyper::{HeaderMap, StatusCode};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    controllers::{
        jwt::extract_claims_from_header,
        notifications::{NotificationInput, spawn_deliver},
        utils::get_conn,
    },
    models::{
        self,
        admin::{
            AdminNotebookView, AdminSearchResult, AdminSystemStats, AdminTeamView, AdminUserView,
            PaginatedResponse, PaginationQuery, get_detailed_system_stats, get_paginated_notebooks,
            get_paginated_teams, get_paginated_users, search_notebooks, search_teams, search_users,
        },
        error::ApiError,
        state::AppState,
        user::UserRole,
    },
};

pub async fn check_admin_role(
    conn: &mut AsyncPgConnection,
    headers: &HeaderMap,
) -> Result<(), ApiError> {
    let claims = extract_claims_from_header(headers).await?.1;

    let user = models::user::find_user_by_id(conn, &claims.id).await?;

    if claims.role != UserRole::Admin || user.role != UserRole::Admin {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    Ok(())
}

#[utoipa::path(get, path = "/admin/stats", responses((status = OK, body = AdminSystemStats), (status = 401, body = ApiError)))]
pub async fn api_get_admin_stats(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<AdminSystemStats>), ApiError> {
    let mut conn = get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    check_admin_role(&mut conn, &headers).await?;

    let stats = get_detailed_system_stats(&mut conn).await?;

    Ok((StatusCode::OK, Json(stats)))
}

#[utoipa::path(get, path = "/admin/users", responses((status = OK, body = PaginatedResponse<AdminUserView>), (status = 401, body = ApiError)))]
pub async fn api_get_admin_users(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<PaginatedResponse<AdminUserView>>), ApiError> {
    let mut conn = get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    check_admin_role(&mut conn, &headers).await?;

    let users_data = get_paginated_users(&mut conn, params.page, params.limit).await?;

    Ok((StatusCode::OK, Json(users_data)))
}

#[utoipa::path(get, path = "/admin/teams", responses((status = OK, body = PaginatedResponse<AdminTeamView>), (status = 401, body = ApiError)))]
pub async fn api_get_admin_teams(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<PaginatedResponse<AdminTeamView>>), ApiError> {
    let mut conn = get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    check_admin_role(&mut conn, &headers).await?;

    let teams_data = get_paginated_teams(&mut conn, params.page, params.limit).await?;

    Ok((StatusCode::OK, Json(teams_data)))
}

#[derive(Deserialize)]
pub struct AdminSearchQuery {
    pub kind: String,
    pub q: String,
}

#[utoipa::path(get, path = "/admin/search", responses((status = OK, body = Vec<AdminSearchResult>), (status = 401, body = ApiError)))]
pub async fn api_admin_search(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AdminSearchQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<AdminSearchResult>>), ApiError> {
    let mut conn = get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    check_admin_role(&mut conn, &headers).await?;

    let query = params.q.trim();
    if query.is_empty() {
        return Ok((StatusCode::OK, Json(Vec::new())));
    }

    let results = match params.kind.as_str() {
        "users" => search_users(&mut conn, query).await?,
        "teams" => search_teams(&mut conn, query).await?,
        "notebooks" => search_notebooks(&mut conn, query).await?,
        _ => return Err(ApiError::Request("Tipo de busca inválido".to_string())),
    };

    Ok((StatusCode::OK, Json(results)))
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminNotifyRequest {
    pub target_kind: String,
    pub target_id: Uuid,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
}

#[utoipa::path(post, path = "/admin/notify", request_body = AdminNotifyRequest, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_admin_notify(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<AdminNotifyRequest>,
) -> Result<StatusCode, ApiError> {
    let mut conn = get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    check_admin_role(&mut conn, &headers).await?;

    let title = payload.title.trim().to_string();
    let body = payload.body.trim().to_string();
    if title.is_empty() || body.is_empty() {
        return Err(ApiError::Request("Título e corpo obrigatórios".to_string()));
    }

    let mut notebook_id = None;
    let mut team_id = None;
    let mut recipients: Vec<Uuid> = Vec::new();

    match payload.target_kind.as_str() {
        "user" => recipients.push(payload.target_id),
        "team" => {
            team_id = Some(payload.target_id);
            let members =
                models::team::find_team_members_with_roles(&mut conn, payload.target_id).await?;
            recipients.extend(members.into_iter().map(|(m, _)| m.user_id));
        }
        "notebook" => {
            notebook_id = Some(payload.target_id);
            let notebook =
                models::notebook::find_notebook_by_id(&mut conn, &payload.target_id).await?;
            if let Some(owner) = notebook.user_id {
                recipients.push(owner);
            }
            if let Some(tid) = notebook.team_id {
                let members = models::team::find_team_members_with_roles(&mut conn, tid).await?;
                recipients.extend(members.into_iter().map(|(m, _)| m.user_id));
            }
        }
        _ => return Err(ApiError::Request("Tipo de alvo inválido".to_string())),
    }

    recipients.sort();
    recipients.dedup();

    spawn_deliver(
        state.clone(),
        recipients,
        NotificationInput {
            kind: "admin".to_string(),
            title,
            body,
            url: payload.url.filter(|u| !u.trim().is_empty()),
            notebook_id,
            team_id,
        },
    );

    Ok(StatusCode::OK)
}

#[utoipa::path(get, path = "/admin/notebooks", responses((status = OK, body = PaginatedResponse<AdminNotebookView>), (status = 401, body = ApiError)))]
pub async fn api_get_admin_notebooks(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PaginationQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<PaginatedResponse<AdminNotebookView>>), ApiError> {
    let mut conn = get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    check_admin_role(&mut conn, &headers).await?;

    let notebooks_data = get_paginated_notebooks(&mut conn, params.page, params.limit).await?;

    Ok((StatusCode::OK, Json(notebooks_data)))
}
