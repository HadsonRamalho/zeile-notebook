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
        permissions::{TargetCtx, require, require_team_permission},
        utils::get_conn,
    },
    models::{
        self,
        error::ApiError,
        folder::{Folder, FolderNameRequest, MoveFolderRequest, NewFolder},
        state::AppState,
    },
};

#[utoipa::path(get, path = "/notebook/folders", responses((status = OK, body = Vec<Folder>), (status = 401, body = ApiError)))]
pub async fn api_list_folders(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<Folder>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    let folders = models::folder::list_personal_folders(conn, user_id).await?;
    Ok((StatusCode::OK, Json(folders)))
}

#[utoipa::path(post, path = "/notebook/folders", request_body = FolderNameRequest, responses((status = CREATED, body = Folder), (status = 401, body = ApiError)))]
pub async fn api_create_folder(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<FolderNameRequest>,
) -> Result<(StatusCode, Json<Folder>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::Request("Nome da pasta vazio".to_string()));
    }
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    let folder = models::folder::create_folder(
        conn,
        &NewFolder {
            id: Uuid::new_v4(),
            name,
            user_id: Some(user_id),
            team_id: None,
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(folder)))
}

#[utoipa::path(patch, path = "/notebook/folders/{folder_id}", request_body = FolderNameRequest, responses((status = OK, body = Folder), (status = 401, body = ApiError)))]
pub async fn api_rename_folder(
    State(state): State<Arc<AppState>>,
    Path(folder_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<FolderNameRequest>,
) -> Result<(StatusCode, Json<Folder>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::Request("Nome da pasta vazio".to_string()));
    }
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    let folder = models::folder::get_folder(conn, folder_id).await?;
    if folder.user_id != Some(user_id) {
        return Err(ApiError::PermissionDenied("folder.manage".to_string()));
    }
    let updated = models::folder::rename_folder(conn, folder_id, &name).await?;
    Ok((StatusCode::OK, Json(updated)))
}

#[utoipa::path(patch, path = "/notebook/folders/{folder_id}/tags", request_body = crate::domain::notebook::UpdateTagsRequest, responses((status = OK, body = Folder), (status = 401, body = ApiError)))]
pub async fn api_update_folder_tags(
    State(state): State<Arc<AppState>>,
    Path(folder_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<crate::domain::notebook::UpdateTagsRequest>,
) -> Result<(StatusCode, Json<Folder>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let tags = crate::domain::notebook::normalize_tags(&payload.tags)?;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    let folder = models::folder::get_folder(conn, folder_id).await?;
    if folder.user_id != Some(user_id) {
        return Err(ApiError::PermissionDenied("folder.manage".to_string()));
    }
    let updated = models::folder::set_folder_tags(conn, folder_id, &tags).await?;
    Ok((StatusCode::OK, Json(updated)))
}

#[utoipa::path(delete, path = "/notebook/folders/{folder_id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_folder(
    State(state): State<Arc<AppState>>,
    Path(folder_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    let folder = models::folder::get_folder(conn, folder_id).await?;
    if folder.user_id != Some(user_id) {
        return Err(ApiError::PermissionDenied("folder.manage".to_string()));
    }
    models::folder::delete_folder(conn, folder_id).await?;
    Ok(StatusCode::OK)
}

#[utoipa::path(patch, path = "/notebook/{id}/folder", request_body = MoveFolderRequest, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_move_notebook_to_folder(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<MoveFolderRequest>,
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

    let notebook = crate::domain::notebook::find_notebook_by_id(conn, &notebook_id).await?;

    if let Some(folder_id) = payload.folder_id {
        let folder = models::folder::get_folder(conn, folder_id).await?;
        let same_scope = folder.user_id == notebook.user_id && folder.team_id == notebook.team_id;
        if !same_scope {
            return Err(ApiError::Request(
                "A pasta pertence a outro escopo".to_string(),
            ));
        }
    }

    models::folder::set_notebook_folder(conn, notebook_id, payload.folder_id).await?;
    Ok(StatusCode::OK)
}

#[utoipa::path(get, path = "/team/{id}/folders", responses((status = OK, body = Vec<Folder>), (status = 401, body = ApiError)))]
pub async fn api_list_team_folders(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<Folder>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    require_team_permission(conn, user_id, team_id, "notebook.view").await?;
    let folders = models::folder::list_team_folders(conn, team_id).await?;
    Ok((StatusCode::OK, Json(folders)))
}

#[utoipa::path(post, path = "/team/{id}/folders", request_body = FolderNameRequest, responses((status = CREATED, body = Folder), (status = 401, body = ApiError)))]
pub async fn api_create_team_folder(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<FolderNameRequest>,
) -> Result<(StatusCode, Json<Folder>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::Request("Nome da pasta vazio".to_string()));
    }
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    require_team_permission(conn, user_id, team_id, "notebook.pages.add").await?;
    let folder = models::folder::create_folder(
        conn,
        &NewFolder {
            id: Uuid::new_v4(),
            name,
            user_id: None,
            team_id: Some(team_id),
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(folder)))
}

#[utoipa::path(patch, path = "/team/{id}/folders/{folder_id}", request_body = FolderNameRequest, responses((status = OK, body = Folder), (status = 401, body = ApiError)))]
pub async fn api_rename_team_folder(
    State(state): State<Arc<AppState>>,
    Path((team_id, folder_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(payload): Json<FolderNameRequest>,
) -> Result<(StatusCode, Json<Folder>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::Request("Nome da pasta vazio".to_string()));
    }
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    require_team_permission(conn, user_id, team_id, "notebook.pages.add").await?;
    let folder = models::folder::get_folder(conn, folder_id).await?;
    if folder.team_id != Some(team_id) {
        return Err(ApiError::Request(
            "Pasta não pertence a este time".to_string(),
        ));
    }
    let updated = models::folder::rename_folder(conn, folder_id, &name).await?;
    Ok((StatusCode::OK, Json(updated)))
}

#[utoipa::path(patch, path = "/team/{id}/folders/{folder_id}/tags", request_body = crate::domain::notebook::UpdateTagsRequest, responses((status = OK, body = Folder), (status = 401, body = ApiError)))]
pub async fn api_update_team_folder_tags(
    State(state): State<Arc<AppState>>,
    Path((team_id, folder_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(payload): Json<crate::domain::notebook::UpdateTagsRequest>,
) -> Result<(StatusCode, Json<Folder>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let tags = crate::domain::notebook::normalize_tags(&payload.tags)?;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    require_team_permission(conn, user_id, team_id, "notebook.pages.add").await?;
    let folder = models::folder::get_folder(conn, folder_id).await?;
    if folder.team_id != Some(team_id) {
        return Err(ApiError::Request(
            "Pasta não pertence a este time".to_string(),
        ));
    }
    let updated = models::folder::set_folder_tags(conn, folder_id, &tags).await?;
    Ok((StatusCode::OK, Json(updated)))
}

#[utoipa::path(delete, path = "/team/{id}/folders/{folder_id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_team_folder(
    State(state): State<Arc<AppState>>,
    Path((team_id, folder_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
    require_team_permission(conn, user_id, team_id, "notebook.pages.add").await?;
    let folder = models::folder::get_folder(conn, folder_id).await?;
    if folder.team_id != Some(team_id) {
        return Err(ApiError::Request(
            "Pasta não pertence a este time".to_string(),
        ));
    }
    models::folder::delete_folder(conn, folder_id).await?;
    Ok(StatusCode::OK)
}
