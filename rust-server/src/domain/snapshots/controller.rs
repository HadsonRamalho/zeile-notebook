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
        jwt::extract_claims_from_header,
        permissions::{TargetCtx, require},
        utils::get_conn,
        websocket::restore_notebook_doc,
    },
    domain::activity::controller::spawn_record,
    models::{error::ApiError, state::AppState},
};

use super::dto::CreateSnapshotRequest;
use super::entity::SnapshotMeta;
use super::repository;

async fn actor_name(conn: &mut diesel_async::AsyncPgConnection, user_id: Uuid) -> String {
    crate::domain::user::find_user_by_id(conn, &user_id)
        .await
        .map(|u| u.name)
        .unwrap_or_else(|_| "Usuário".to_string())
}

#[utoipa::path(get, path = "/notebook/{id}/snapshots", responses((status = OK, body = Vec<SnapshotMeta>), (status = 401, body = ApiError)))]
pub async fn api_list_snapshots(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<SnapshotMeta>>), ApiError> {
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

    let snapshots = repository::list_snapshots(conn, notebook_id).await?;
    Ok((StatusCode::OK, Json(snapshots)))
}

#[utoipa::path(post, path = "/notebook/{id}/snapshots", request_body = CreateSnapshotRequest, responses((status = CREATED, body = SnapshotMeta), (status = 401, body = ApiError)))]
pub async fn api_create_snapshot(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<CreateSnapshotRequest>,
) -> Result<(StatusCode, Json<SnapshotMeta>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let label = payload.label.trim().to_string();
    if label.is_empty() {
        return Err(ApiError::Request("Rótulo vazio".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let snapshot = repository::create_snapshot(
        conn,
        notebook_id,
        &label,
        payload.note,
        "manual",
        Some(user_id),
    )
    .await?;

    let name = actor_name(conn, user_id).await;
    spawn_record(
        &state,
        notebook_id,
        Some(user_id),
        name,
        "snapshot".to_string(),
        None,
        Some(label),
    );

    Ok((StatusCode::CREATED, Json(snapshot)))
}

#[utoipa::path(post, path = "/notebook/{id}/snapshots/{snapshot_id}/restore", responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_restore_snapshot(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, snapshot_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
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

    let (snapshot_notebook, bytes) = repository::get_snapshot(conn, snapshot_id).await?;
    if snapshot_notebook != notebook_id {
        return Err(ApiError::Request("Versão inválida".to_string()));
    }

    repository::create_snapshot(
        conn,
        notebook_id,
        "Antes de restaurar",
        None,
        "auto_pre_restore",
        Some(user_id),
    )
    .await?;

    let name = actor_name(conn, user_id).await;

    restore_notebook_doc(&state, notebook_id, bytes).await;

    spawn_record(
        &state,
        notebook_id,
        Some(user_id),
        name,
        "snapshot".to_string(),
        None,
        Some("restaurou uma versão".to_string()),
    );

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(delete, path = "/notebook/{id}/snapshots/{snapshot_id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_snapshot(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, snapshot_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
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

    let (snapshot_notebook, _bytes) = repository::get_snapshot(conn, snapshot_id).await?;
    if snapshot_notebook != notebook_id {
        return Err(ApiError::Request("Versão inválida".to_string()));
    }

    repository::delete_snapshot(conn, snapshot_id).await?;

    Ok(StatusCode::NO_CONTENT)
}
