use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;

use crate::{
    controllers::{jwt::extract_claims_from_header, utils::get_conn},
    models::{error::ApiError, state::AppState},
};

use super::dto::{NotificationsResponse, UpsertPreferenceRequest};
use super::entity::NotificationPreference;
use super::repository;

#[utoipa::path(get, path = "/notifications/", responses((status = OK, body = NotificationsResponse), (status = 401, body = ApiError)))]
pub async fn api_list_notifications(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<NotificationsResponse>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let items = repository::list_for_user(conn, user_id).await?;
    let unread = repository::unread_count(conn, user_id).await?;

    Ok((
        StatusCode::OK,
        Json(NotificationsResponse {
            items,
            unread_count: unread,
        }),
    ))
}

#[utoipa::path(post, path = "/notifications/{id}/read", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_mark_notification_read(
    State(state): State<Arc<AppState>>,
    Path(notification_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    repository::mark_read(conn, user_id, notification_id).await?;
    Ok(StatusCode::OK)
}

#[utoipa::path(post, path = "/notifications/read-all", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_mark_all_read(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    repository::mark_all_read(conn, user_id).await?;
    Ok(StatusCode::OK)
}

#[utoipa::path(delete, path = "/notifications/{id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_notification(
    State(state): State<Arc<AppState>>,
    Path(notification_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    repository::delete_notification(conn, user_id, notification_id).await?;
    Ok(StatusCode::OK)
}

#[utoipa::path(get, path = "/notifications/preferences", responses((status = OK, body = Vec<NotificationPreference>), (status = 401, body = ApiError)))]
pub async fn api_list_preferences(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<NotificationPreference>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let prefs = repository::list_prefs_for_user(conn, user_id).await?;
    Ok((StatusCode::OK, Json(prefs)))
}

#[utoipa::path(put, path = "/notifications/preferences", request_body = UpsertPreferenceRequest, responses((status = OK, body = NotificationPreference), (status = 401, body = ApiError)))]
pub async fn api_upsert_preference(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<UpsertPreferenceRequest>,
) -> Result<(StatusCode, Json<NotificationPreference>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    if !matches!(payload.scope_kind.as_str(), "global" | "notebook" | "team") {
        return Err(ApiError::Request("Invalid scope".to_string()));
    }
    let scope_id = if payload.scope_kind == "global" {
        None
    } else {
        payload.scope_id
    };

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let pref = repository::upsert_preference(
        conn,
        user_id,
        &payload.scope_kind,
        scope_id,
        payload.push_enabled,
        payload.inapp_enabled,
        payload.chat_enabled,
    )
    .await?;

    Ok((StatusCode::OK, Json(pref)))
}
