use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    controllers::{
        jwt::extract_claims_from_header,
        permissions::{TargetCtx, require},
        utils::get_conn,
    },
    models::{self, activity::Activity, error::ApiError, state::AppState},
};

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecordEditRequest {
    pub block_id: Option<String>,
}

pub fn spawn_record(
    state: &Arc<AppState>,
    notebook_id: Uuid,
    actor_id: Option<Uuid>,
    actor_name: String,
    kind: String,
    block_id: Option<String>,
    summary: Option<String>,
) {
    let state = state.clone();
    tokio::spawn(async move {
        let Ok(mut conn) = get_conn(&state.pool).await else {
            return;
        };
        let _ = models::activity::record_activity(
            &mut conn,
            notebook_id,
            actor_id,
            &actor_name,
            &kind,
            block_id,
            summary,
        )
        .await;
    });
}

#[utoipa::path(get, path = "/notebook/{id}/activity", responses((status = OK, body = Vec<Activity>), (status = 401, body = ApiError)))]
pub async fn api_list_activity(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<Activity>>), ApiError> {
    let user_id = extract_claims_from_header(&headers)
        .await
        .ok()
        .map(|c| c.1.id);

    require(
        &state.pool,
        user_id,
        notebook_id,
        "notebook.view",
        &TargetCtx::default(),
    )
    .await?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let items = models::activity::list_activity(conn, notebook_id, 50).await?;
    Ok((StatusCode::OK, Json(items)))
}

#[utoipa::path(post, path = "/notebook/{id}/activity", request_body = RecordEditRequest, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_record_edit(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<RecordEditRequest>,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let name = models::user::find_user_by_id(conn, &user_id)
        .await
        .map(|u| u.name)
        .unwrap_or_else(|_| "Usuário".to_string());

    models::activity::record_activity(
        conn,
        notebook_id,
        Some(user_id),
        &name,
        "edit",
        payload.block_id,
        None,
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}
