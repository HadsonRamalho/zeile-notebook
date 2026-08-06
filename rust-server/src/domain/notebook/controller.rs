use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{jwt::extract_claims_from_header, utils::get_conn},
    extractors::{AuthUser, DbConn},
    models::{error::ApiError, state::AppState},
};

use super::dto::{
    NotebookDto, NotebookResponse, PublicNotebookDoc, PublicNotebookResponse, PublicSearchQuery,
    RankedSearchItem, RankedSearchQuery, SearchQuery, SearchResult, SyncNotebookRequest,
    UpdateNotebookTitle, UpdateNotebookVisibility, UpdateTagsRequest,
};
use super::entity::{BlockType, NewBlock, NewNotebook};
use super::{repository, service};

#[utoipa::path(post, path = "/notebook/create", responses((status = OK, body = Uuid), (status = 401, body = ApiError)))]
pub async fn api_create_notebook(
    AuthUser(id): AuthUser,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<Uuid>), ApiError> {
    let conn = &mut conn;

    let notebook_id = Uuid::new_v4();

    let new_notebook = NewNotebook {
        id: notebook_id,
        user_id: Some(id),
        team_id: None,
        title: "Nova Página".to_string(),
    };

    let new_block = NewBlock {
        id: Uuid::new_v4(),
        title: "Novo Bloco".to_string(),
        notebook_id,
        block_type: BlockType::Text,
        language: None,
        content: "# Notas\nComece a editar...".to_string(),
        metadata: None,
        position: 0,
    };

    match repository::create_notebook(conn, &new_notebook).await {
        Ok(_) => {}
        Err(e) => return Err(ApiError::Database(e)),
    }

    repository::create_block(conn, &new_block)
        .await
        .map_err(ApiError::Database)?;

    Ok((StatusCode::OK, Json(notebook_id)))
}

#[utoipa::path(get, path = "/notebook/all", responses((status = OK, body = Vec<NotebookDto>), (status = 401, body = ApiError)))]
pub async fn api_get_notebooks(
    AuthUser(id): AuthUser,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<Vec<NotebookDto>>), ApiError> {
    match repository::get_all_notebooks(&mut conn, &id).await {
        Ok(notebooks) => Ok((
            StatusCode::OK,
            Json(notebooks.into_iter().map(NotebookDto::from).collect()),
        )),
        Err(e) => Err(ApiError::Database(e)),
    }
}

#[utoipa::path(get, path = "/notebook/{id}", responses((status = OK, body = NotebookDto), (status = 401, body = ApiError)))]
pub async fn api_get_single_notebook(
    Path(notebook_id): Path<Uuid>,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<NotebookDto>), ApiError> {
    let notebook = repository::find_notebook_by_id(&mut conn, &notebook_id).await?;

    Ok((StatusCode::OK, Json(NotebookDto::from(notebook))))
}

#[utoipa::path(patch, path = "/notebook/{id}/title", request_body = UpdateNotebookTitle, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_rename_notebook(
    Path(notebook_id): Path<Uuid>,
    DbConn(mut conn): DbConn,
    Json(payload): Json<UpdateNotebookTitle>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    match repository::update_notebook_title(&mut conn, notebook_id, payload.title).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(ApiError::Database(e)),
    }
}

#[utoipa::path(patch, path = "/notebook/{id}/tags", request_body = UpdateTagsRequest, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_update_notebook_tags(
    Path(notebook_id): Path<Uuid>,
    DbConn(mut conn): DbConn,
    Json(payload): Json<UpdateTagsRequest>,
) -> Result<StatusCode, ApiError> {
    let tags = service::normalize_tags(&payload.tags)?;

    repository::set_notebook_tags(&mut conn, notebook_id, &tags).await?;
    Ok(StatusCode::OK)
}

#[utoipa::path(patch, path = "/notebook/{id}/visibility", request_body = UpdateNotebookVisibility, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_update_notebook_visibility(
    Path(notebook_id): Path<Uuid>,
    DbConn(mut conn): DbConn,
    Json(payload): Json<UpdateNotebookVisibility>,
) -> Result<StatusCode, ApiError> {
    match repository::update_notebook_visibility(&mut conn, notebook_id, payload.is_visible).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(ApiError::Database(e)),
    }
}

#[utoipa::path(delete, path = "/notebook/{id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_notebook(
    Path(notebook_id): Path<Uuid>,
    DbConn(mut conn): DbConn,
) -> Result<StatusCode, ApiError> {
    match repository::delete_notebook(&mut conn, &notebook_id).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(ApiError::Database(e)),
    }
}

#[utoipa::path(get, path = "/notebook/{id}/full", responses((status = OK, body = NotebookResponse), (status = 401, body = ApiError)))]
pub async fn api_get_single_notebook_with_blocks(
    Path(notebook_id): Path<Uuid>,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<NotebookResponse>), ApiError> {
    let notebook = repository::get_notebook_with_blocks(&mut conn, &notebook_id)
        .await
        .map_err(ApiError::Database)?;

    Ok((StatusCode::OK, Json(notebook)))
}

#[utoipa::path(put, path = "/notebook/{id}/content", request_body = SyncNotebookRequest, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_save_notebook_content(
    Path(notebook_id): Path<Uuid>,
    DbConn(mut conn): DbConn,
    Json(payload): Json<SyncNotebookRequest>,
) -> Result<StatusCode, ApiError> {
    service::validate_content(&payload)?;

    let blocks_to_insert: Vec<NewBlock> = payload
        .blocks
        .into_iter()
        .enumerate()
        .map(|(index, b)| {
            let meta_json = b.metadata.and_then(|m| serde_json::to_value(m).ok());

            NewBlock {
                id: b.id,
                notebook_id,
                block_type: b.block_type,
                language: b.language,
                content: b.content,
                metadata: meta_json,
                position: index as i32,
                title: b.title,
            }
        })
        .collect();

    match repository::sync_notebook_content(
        &mut conn,
        notebook_id,
        payload.title,
        blocks_to_insert,
        payload.is_public,
    )
    .await
    {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(ApiError::Database(e)),
    }
}

#[utoipa::path(post, path = "/notebook/{id}/clone", responses((status = CREATED, body = Uuid), (status = 401, body = ApiError)))]
pub async fn api_clone_notebook(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Uuid>), ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let target_notebook = repository::find_notebook_by_id(conn, &notebook_id).await?;

    if !target_notebook.is_public {
        crate::controllers::permissions::require(
            &state.pool,
            Some(id),
            notebook_id,
            "notebook.manage_clones",
            &crate::controllers::permissions::TargetCtx::default(),
        )
        .await?;
    }

    let new_notebook_id = Uuid::new_v4();
    let new_notebook_title = format!("Cópia de \"{}\"", target_notebook.title);

    let new_notebook = NewNotebook {
        id: new_notebook_id,
        user_id: Some(id),
        team_id: None,
        title: "Nova Página".to_string(),
    };

    match repository::create_notebook(conn, &new_notebook).await {
        Ok(_) => {}
        Err(e) => return Err(ApiError::Database(e)),
    }

    repository::clone_notebook(
        conn,
        &target_notebook.id,
        &new_notebook_id,
        &new_notebook_title,
    )
    .await?;

    Ok((StatusCode::CREATED, Json(new_notebook_id)))
}

#[utoipa::path(get, path = "/notebook/search/", responses((status = OK, body = Vec<SearchResult>), (status = 401, body = ApiError)))]
pub async fn api_search_notebooks(
    AuthUser(id): AuthUser,
    Query(params): Query<SearchQuery>,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<Vec<SearchResult>>), ApiError> {
    if params.q.trim().is_empty() {
        return Ok((StatusCode::OK, Json(Vec::<SearchResult>::new())));
    }

    let search_term = format!("%{}%", params.q);

    let results = repository::search_user_blocks(&mut conn, id, &search_term).await?;

    Ok((StatusCode::OK, Json(results)))
}

#[utoipa::path(get, path = "/notebook/search/ranked/", responses((status = OK, body = Vec<RankedSearchItem>), (status = 401, body = ApiError)))]
pub async fn api_search_notebooks_ranked(
    AuthUser(id): AuthUser,
    Query(params): Query<RankedSearchQuery>,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<Vec<RankedSearchItem>>), ApiError> {
    let term = params.q.trim();
    if term.is_empty() {
        return Ok((StatusCode::OK, Json(Vec::<RankedSearchItem>::new())));
    }

    let limit = params.limit.unwrap_or(16).clamp(1, 50);

    let results = repository::search_notebooks_ranked(&mut conn, id, term, limit).await?;

    Ok((StatusCode::OK, Json(results)))
}

#[utoipa::path(get, path = "/notebook/public/{slug}", responses((status = OK, body = PublicNotebookDoc), (status = 401, body = ApiError)))]
pub async fn api_get_public_notebook_by_slug(
    Path(slug): Path<String>,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<PublicNotebookDoc>), ApiError> {
    let doc = repository::get_public_notebook_by_slug(&mut conn, &slug).await?;
    Ok((StatusCode::OK, Json(doc)))
}

#[utoipa::path(get, path = "/notebook/all/public", responses((status = OK, body = Vec<PublicNotebookResponse>), (status = 401, body = ApiError)))]
pub async fn api_get_public_notebooks(
    Query(params): Query<PublicSearchQuery>,
    DbConn(mut conn): DbConn,
) -> Result<(StatusCode, Json<Vec<PublicNotebookResponse>>), ApiError> {
    let q = params.q.as_deref().map(str::trim).filter(|s| !s.is_empty());

    Ok((
        StatusCode::OK,
        Json(repository::get_public_notebooks(&mut conn, q).await?),
    ))
}
