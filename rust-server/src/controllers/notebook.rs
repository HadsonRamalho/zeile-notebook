use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;

use crate::{
    controllers::{jwt::extract_claims_from_header, utils::get_conn},
    models::{
        self,
        error::ApiError,
        notebook::{
            NewBlock, NewNotebook, Notebook, NotebookResponse, PublicNotebookDoc,
            PublicNotebookResponse, PublicSearchQuery, RankedSearchItem, RankedSearchQuery,
            BlockRequest, SearchQuery, SearchResult, SyncNotebookRequest, UpdateNotebookTitle,
            UpdateNotebookVisibility, delete_notebook, get_public_notebooks,
            update_notebook_title,
        },
        state::AppState,
    },
};

#[utoipa::path(post, path = "/notebook/create", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_create_notebook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Uuid>), ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let notebook_id = Uuid::new_v4();

    let new_notebook = NewNotebook {
        id: notebook_id.clone(),
        user_id: Some(id),
        team_id: None,
        title: "Nova Página".to_string(),
    };

    let new_block = NewBlock {
        id: Uuid::new_v4(),
        title: "Novo Bloco".to_string(),
        notebook_id,
        block_type: models::notebook::BlockType::Text,
        language: None,
        content: "# Notas\nComece a editar...".to_string(),
        metadata: None,
        position: 0,
    };

    match models::notebook::create_notebook(conn, &new_notebook).await {
        Ok(_) => {}
        Err(e) => return Err(ApiError::Database(e)),
    }

    let _ = models::notebook::create_block(conn, &new_block).await;

    Ok((StatusCode::OK, Json(notebook_id)))
}

pub async fn api_get_notebooks(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<Notebook>>), ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    match models::notebook::get_all_notebooks(conn, &id).await {
        Ok(notebooks) => Ok((StatusCode::OK, Json(notebooks))),
        Err(e) => Err(ApiError::Database(e)),
    }
}

pub async fn api_get_single_notebook(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Notebook>), ApiError> {
    let id: Option<Uuid> = match extract_claims_from_header(&headers).await {
        Ok(data) => Some(data.1.id),
        Err(_) => None,
    };

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let notebook = models::notebook::find_notebook_by_id(conn, &notebook_id).await?;

    crate::controllers::permissions::require(
        &state.pool,
        id,
        notebook_id,
        "notebook.view",
        &crate::controllers::permissions::TargetCtx::default(),
    )
    .await?;

    Ok((StatusCode::OK, Json(notebook)))
}

pub async fn api_rename_notebook(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateNotebookTitle>,
) -> Result<StatusCode, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    crate::controllers::permissions::require(
        &state.pool,
        Some(id),
        notebook_id,
        "notebook.edit_name",
        &crate::controllers::permissions::TargetCtx::default(),
    )
    .await?;

    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    match update_notebook_title(&mut conn, notebook_id, payload.title).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(ApiError::Database(e)),
    }
}

pub async fn api_update_notebook_tags(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<models::notebook::UpdateTagsRequest>,
) -> Result<StatusCode, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    crate::controllers::permissions::require(
        &state.pool,
        Some(id),
        notebook_id,
        "notebook.tags.edit",
        &crate::controllers::permissions::TargetCtx::default(),
    )
    .await?;

    let tags = models::notebook::normalize_tags(&payload.tags)?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    models::notebook::set_notebook_tags(conn, notebook_id, &tags).await?;
    Ok(StatusCode::OK)
}

pub async fn api_update_notebook_visibility(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateNotebookVisibility>,
) -> Result<StatusCode, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    crate::controllers::permissions::require(
        &state.pool,
        Some(id),
        notebook_id,
        "notebook.manage_privacy",
        &crate::controllers::permissions::TargetCtx::default(),
    )
    .await?;

    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    match models::notebook::update_notebook_visibility(&mut conn, notebook_id, payload.is_visible)
        .await
    {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(ApiError::Database(e)),
    }
}

pub async fn api_delete_notebook(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    crate::controllers::permissions::require(
        &state.pool,
        Some(id),
        notebook_id,
        "notebook.delete",
        &crate::controllers::permissions::TargetCtx::default(),
    )
    .await?;

    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    match delete_notebook(&mut conn, &notebook_id).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(ApiError::Database(e)),
    }
}

pub async fn api_get_single_notebook_with_blocks(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<NotebookResponse>), ApiError> {
    let id: Option<Uuid> = match extract_claims_from_header(&headers).await {
        Ok(data) => Some(data.1.id),
        Err(_) => None,
    };

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let notebook = models::notebook::get_notebook_with_blocks(conn, &notebook_id)
        .await
        .map_err(ApiError::Database)?;

    crate::controllers::permissions::require(
        &state.pool,
        id,
        notebook_id,
        "notebook.view",
        &crate::controllers::permissions::TargetCtx::default(),
    )
    .await?;

    Ok((StatusCode::OK, Json(notebook)))
}

pub const MAX_BLOCKS: usize = 1000;

pub const MAX_BYTES_PER_BLOCK: usize = 512 * 1024;

pub const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;

fn block_weight(block: &BlockRequest) -> usize {
    let metadata = block
        .metadata
        .as_ref()
        .and_then(|m| serde_json::to_vec(m).ok())
        .map(|v| v.len())
        .unwrap_or(0);

    block.title.len() + block.content.len() + metadata
}

/// The route's body ceiling blocks a giant payload, but doesn't distinguish a
/// thousand small blocks from one huge block, and doesn't even look at
/// metadata — which is client-supplied Jsonb and would be a side door to the
/// same abuse.
pub fn validate_content(payload: &SyncNotebookRequest) -> Result<(), ApiError> {
    if payload.blocks.len() > MAX_BLOCKS {
        return Err(ApiError::Request(format!(
            "Notebook acima do limite de {} blocos (recebidos {}).",
            MAX_BLOCKS,
            payload.blocks.len()
        )));
    }

    let mut total = payload.title.len();

    for (index, block) in payload.blocks.iter().enumerate() {
        let weight = block_weight(block);

        if weight > MAX_BYTES_PER_BLOCK {
            return Err(ApiError::Request(format!(
                "Bloco {} acima do limite de {} KB.",
                index + 1,
                MAX_BYTES_PER_BLOCK / 1024
            )));
        }

        total += weight;

        if total > MAX_TOTAL_BYTES {
            return Err(ApiError::Request(format!(
                "Conteúdo do notebook acima do limite de {} MB.",
                MAX_TOTAL_BYTES / (1024 * 1024)
            )));
        }
    }

    Ok(())
}

pub async fn api_save_notebook_content(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SyncNotebookRequest>,
) -> Result<StatusCode, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    validate_content(&payload)?;

    crate::controllers::permissions::require(
        &state.pool,
        Some(id),
        notebook_id,
        "notebook.edit",
        &crate::controllers::permissions::TargetCtx::default(),
    )
    .await?;

    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

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

    match models::notebook::sync_notebook_content(
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
pub async fn api_clone_notebook(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Uuid>), ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let target_notebook = models::notebook::find_notebook_by_id(conn, &notebook_id).await?;

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
        id: new_notebook_id.clone(),
        user_id: Some(id),
        team_id: None,
        title: "Nova Página".to_string(),
    };

    match models::notebook::create_notebook(conn, &new_notebook).await {
        Ok(_) => {}
        Err(e) => return Err(ApiError::Database(e)),
    }

    let _ = models::notebook::clone_notebook(
        conn,
        &target_notebook.id,
        &new_notebook_id,
        &new_notebook_title,
    )
    .await?;

    Ok((StatusCode::CREATED, Json(new_notebook_id)))
}

pub async fn api_search_notebooks(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<SearchResult>>), ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    if params.q.trim().is_empty() {
        return Ok((StatusCode::OK, Json(Vec::<SearchResult>::new())));
    }

    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.to_string()))?;

    let search_term = format!("%{}%", params.q);

    let results = models::notebook::search_user_blocks(&mut conn, id, &search_term).await?;

    Ok((StatusCode::OK, Json(results)))
}

pub async fn api_search_notebooks_ranked(
    State(state): State<Arc<AppState>>,
    Query(params): Query<RankedSearchQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<RankedSearchItem>>), ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let term = params.q.trim();
    if term.is_empty() {
        return Ok((StatusCode::OK, Json(Vec::<RankedSearchItem>::new())));
    }

    let limit = params.limit.unwrap_or(16).clamp(1, 50);

    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.to_string()))?;

    let results = models::notebook::search_notebooks_ranked(&mut conn, id, term, limit).await?;

    Ok((StatusCode::OK, Json(results)))
}

pub async fn api_get_public_notebook_by_slug(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
) -> Result<(StatusCode, Json<PublicNotebookDoc>), ApiError> {
    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.to_string()))?;

    let doc = models::notebook::get_public_notebook_by_slug(&mut conn, &slug).await?;
    Ok((StatusCode::OK, Json(doc)))
}

pub async fn api_get_public_notebooks(
    State(state): State<Arc<AppState>>,
    Query(params): Query<PublicSearchQuery>,
) -> Result<(StatusCode, Json<Vec<PublicNotebookResponse>>), ApiError> {
    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.to_string()))?;

    let q = params
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    Ok((
        StatusCode::OK,
        Json(get_public_notebooks(&mut conn, q).await?),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use models::notebook::{BlockType, SyncNotebookRequest};

    fn block(content: &str) -> BlockRequest {
        BlockRequest {
            id: Uuid::new_v4(),
            title: "block".to_string(),
            block_type: BlockType::Text,
            content: content.to_string(),
            language: None,
            metadata: None,
        }
    }

    fn request(blocks: Vec<BlockRequest>) -> SyncNotebookRequest {
        SyncNotebookRequest {
            title: "notebook".to_string(),
            blocks,
            is_public: false,
        }
    }

    #[test]
    fn an_ordinary_notebook_passes() {
        let blocks = (0..50).map(|i| block(&format!("content {i}"))).collect();

        assert!(validate_content(&request(blocks)).is_ok());
    }

    #[test]
    fn blocks_a_single_giant_block() {
        let fat = "x".repeat(MAX_BYTES_PER_BLOCK + 1);

        let error = validate_content(&request(vec![block(&fat)]))
            .expect_err("block above the ceiling should be refused");

        assert!(error.to_string().contains("Bloco 1"), "{error}");
    }

    #[test]
    fn blocks_too_many_blocks() {
        let blocks = (0..MAX_BLOCKS + 1).map(|_| block("hi")).collect();

        let error = validate_content(&request(blocks)).expect_err("excess of blocks got through");

        assert!(error.to_string().contains("blocos"), "{error}");
    }

    #[test]
    fn blocks_the_sum_of_small_blocks() {
        let chunk = "y".repeat(MAX_BYTES_PER_BLOCK / 2);
        let how_many = MAX_TOTAL_BYTES / chunk.len() + 2;
        let blocks = (0..how_many).map(|_| block(&chunk)).collect();

        let error = validate_content(&request(blocks))
            .expect_err("many valid blocks summing above the total should be refused");

        assert!(error.to_string().contains("MB"), "{error}");
    }

    #[test]
    fn metadata_is_not_a_side_door() {
        let mut b = block("small");
        b.metadata = serde_json::from_str(&format!(
            "{{\"type\":\"generic\",\"junk\":\"{}\"}}",
            "z".repeat(MAX_BYTES_PER_BLOCK)
        ))
        .ok();

        assert!(
            b.metadata.is_some(),
            "the test needs metadata filled in to be meaningful"
        );

        let error = validate_content(&request(vec![b]))
            .expect_err("giant metadata should count toward the block's weight");

        assert!(error.to_string().contains("Bloco 1"), "{error}");
    }
}
