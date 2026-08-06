use std::sync::Arc;

use axum::{Json, extract::State};
use hyper::{HeaderMap, StatusCode};
use validator::Validate;

use crate::{
    controllers::{jwt::extract_claims_from_header, utils::get_conn},
    models::{error::ApiError, state::AppState},
};

use super::dto::{PushSubscriptionRequest, PushUnsubscribeRequest};
use super::repository;

#[utoipa::path(post, path = "/notebook/push/subscribe", request_body = PushSubscriptionRequest, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_subscribe_push(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<PushSubscriptionRequest>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    repository::upsert_push_subscription(conn, user_id, &payload).await?;

    Ok(StatusCode::OK)
}

#[utoipa::path(delete, path = "/notebook/push/subscribe", request_body = PushUnsubscribeRequest, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_unsubscribe_push(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<PushUnsubscribeRequest>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    extract_claims_from_header(&headers).await?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    repository::delete_push_subscription(conn, &payload.endpoint).await?;

    Ok(StatusCode::OK)
}
