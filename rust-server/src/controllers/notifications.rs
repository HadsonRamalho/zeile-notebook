use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    controllers::{jwt::extract_claims_from_header, push::send_push_to_user, utils::get_conn},
    models::{
        error::ApiError,
        notification::{
            self, NewNotification, Notification, create_notification, list_for_user,
            mark_all_read, mark_read, unread_count,
        },
        state::AppState,
    },
};

#[derive(Clone)]
pub struct NotificationInput {
    pub kind: String,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
    pub notebook_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
}

/// Entrega uma notificação a um usuário: grava a notificação interna e dispara o
/// push. Deve ser chamada dentro de uma task de fundo (nunca no caminho da
/// request) — os envios de push são sequenciais por assinatura.
pub async fn deliver_notification(
    state: &Arc<AppState>,
    user_id: Uuid,
    input: &NotificationInput,
) {
    if let Ok(mut conn) = get_conn(&state.pool).await {
        let row = NewNotification {
            id: Uuid::new_v4(),
            user_id,
            kind: input.kind.clone(),
            title: input.title.clone(),
            body: input.body.clone(),
            url: input.url.clone(),
            notebook_id: input.notebook_id,
            team_id: input.team_id,
        };
        let _ = create_notification(&mut conn, &row).await;
    }

    let url = input.url.as_deref().unwrap_or("/");
    send_push_to_user(state, user_id, &input.title, &input.body, url).await;
}

/// Faz o fan-out de uma notificação para vários usuários numa task de fundo,
/// para não bloquear a request que a originou.
pub fn spawn_deliver(state: Arc<AppState>, user_ids: Vec<Uuid>, input: NotificationInput) {
    if user_ids.is_empty() {
        return;
    }
    tokio::spawn(async move {
        for uid in user_ids {
            deliver_notification(&state, uid, &input).await;
        }
    });
}

#[derive(Serialize)]
pub struct NotificationsResponse {
    pub items: Vec<Notification>,
    #[serde(rename = "unreadCount")]
    pub unread_count: i64,
}

pub async fn api_list_notifications(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<NotificationsResponse>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let items = list_for_user(conn, user_id).await?;
    let unread = unread_count(conn, user_id).await?;

    Ok((
        StatusCode::OK,
        Json(NotificationsResponse {
            items,
            unread_count: unread,
        }),
    ))
}

pub async fn api_mark_notification_read(
    State(state): State<Arc<AppState>>,
    Path(notification_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    mark_read(conn, user_id, notification_id).await?;
    Ok(StatusCode::OK)
}

pub async fn api_mark_all_read(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    mark_all_read(conn, user_id).await?;
    Ok(StatusCode::OK)
}

pub async fn api_delete_notification(
    State(state): State<Arc<AppState>>,
    Path(notification_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    notification::delete_notification(conn, user_id, notification_id).await?;
    Ok(StatusCode::OK)
}
