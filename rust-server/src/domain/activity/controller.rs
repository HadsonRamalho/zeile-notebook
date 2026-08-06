use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::StatusCode;
use uuid::Uuid;

use crate::{
    controllers::permissions::{TargetCtx, require},
    extractors::{AuthUser, DbConn, OptionalAuthUser},
    models::{error::ApiError, state::AppState},
};

use super::dto::RecordEditRequest;
use super::entity::Activity;
use super::repository;

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
        let Ok(mut conn) = crate::controllers::utils::get_conn(&state.pool).await else {
            return;
        };
        repository::record_activity(
            &mut conn,
            notebook_id,
            actor_id,
            &actor_name,
            &kind,
            block_id,
            summary,
        )
        .await
        .ok();
    });
}

#[utoipa::path(get, path = "/notebook/{id}/activity", responses((status = OK, body = Vec<Activity>), (status = 401, body = ApiError)))]
pub async fn api_list_activity(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    OptionalAuthUser(user_id): OptionalAuthUser,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<Vec<Activity>>), ApiError> {
    require(
        &state.pool,
        user_id,
        notebook_id,
        "notebook.view",
        &TargetCtx::default(),
    )
    .await?;

    let items = repository::list_activity(&mut conn, notebook_id, 50).await?;
    Ok((StatusCode::OK, Json(items)))
}

#[utoipa::path(post, path = "/notebook/{id}/activity", request_body = RecordEditRequest, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_record_edit(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    AuthUser(user_id): AuthUser,
    DbConn(mut conn): DbConn,
    Json(payload): Json<RecordEditRequest>,
) -> Result<StatusCode, ApiError> {
    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let name = crate::models::user::find_user_by_id(&mut conn, &user_id)
        .await
        .map(|u| u.name)
        .unwrap_or_else(|_| "Usuário".to_string());

    repository::record_activity(
        &mut conn,
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
