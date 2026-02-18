use axum::{
    Json,
    extract::{Query, State},
};
use diesel_async::AsyncPgConnection;
use hyper::{HeaderMap, StatusCode};
use std::sync::Arc;

use crate::{
    controllers::{jwt::extract_claims_from_header, utils::get_conn},
    models::{
        self,
        admin::{
            AdminNotebookView, AdminSystemStats, AdminTeamView, AdminUserView, PaginatedResponse,
            PaginationQuery, get_detailed_system_stats, get_paginated_notebooks,
            get_paginated_teams, get_paginated_users,
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
