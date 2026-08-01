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

pub const MAX_BLOCOS: usize = 1000;

pub const MAX_BYTES_POR_BLOCO: usize = 512 * 1024;

pub const MAX_BYTES_TOTAIS: usize = 8 * 1024 * 1024;

fn peso_do_bloco(bloco: &BlockRequest) -> usize {
    let metadata = bloco
        .metadata
        .as_ref()
        .and_then(|m| serde_json::to_vec(m).ok())
        .map(|v| v.len())
        .unwrap_or(0);

    bloco.title.len() + bloco.content.len() + metadata
}

/// O teto de corpo da rota barra um payload gigante, mas não distingue mil
/// blocos pequenos de um bloco enorme, e nem sequer olha metadata — que é Jsonb
/// vindo do cliente e serviria de porta lateral para o mesmo abuso.
pub fn validar_conteudo(payload: &SyncNotebookRequest) -> Result<(), ApiError> {
    if payload.blocks.len() > MAX_BLOCOS {
        return Err(ApiError::Request(format!(
            "Notebook acima do limite de {} blocos (recebidos {}).",
            MAX_BLOCOS,
            payload.blocks.len()
        )));
    }

    let mut total = payload.title.len();

    for (indice, bloco) in payload.blocks.iter().enumerate() {
        let peso = peso_do_bloco(bloco);

        if peso > MAX_BYTES_POR_BLOCO {
            return Err(ApiError::Request(format!(
                "Bloco {} acima do limite de {} KB.",
                indice + 1,
                MAX_BYTES_POR_BLOCO / 1024
            )));
        }

        total += peso;

        if total > MAX_BYTES_TOTAIS {
            return Err(ApiError::Request(format!(
                "Conteúdo do notebook acima do limite de {} MB.",
                MAX_BYTES_TOTAIS / (1024 * 1024)
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

    validar_conteudo(&payload)?;

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

    fn bloco(conteudo: &str) -> BlockRequest {
        BlockRequest {
            id: Uuid::new_v4(),
            title: "bloco".to_string(),
            block_type: BlockType::Text,
            content: conteudo.to_string(),
            language: None,
            metadata: None,
        }
    }

    fn pedido(blocos: Vec<BlockRequest>) -> SyncNotebookRequest {
        SyncNotebookRequest {
            title: "notebook".to_string(),
            blocks: blocos,
            is_public: false,
        }
    }

    #[test]
    fn um_notebook_comum_passa() {
        let blocos = (0..50).map(|i| bloco(&format!("conteúdo {i}"))).collect();

        assert!(validar_conteudo(&pedido(blocos)).is_ok());
    }

    #[test]
    fn barra_bloco_unico_gigante() {
        let gordo = "x".repeat(MAX_BYTES_POR_BLOCO + 1);

        let erro = validar_conteudo(&pedido(vec![bloco(&gordo)]))
            .expect_err("bloco acima do teto deveria ser recusado");

        assert!(erro.to_string().contains("Bloco 1"), "{erro}");
    }

    #[test]
    fn barra_excesso_de_blocos() {
        let blocos = (0..MAX_BLOCOS + 1).map(|_| bloco("oi")).collect();

        let erro = validar_conteudo(&pedido(blocos)).expect_err("excesso de blocos passou");

        assert!(erro.to_string().contains("blocos"), "{erro}");
    }

    #[test]
    fn barra_soma_de_blocos_pequenos() {
        let pedaco = "y".repeat(MAX_BYTES_POR_BLOCO / 2);
        let quantos = MAX_BYTES_TOTAIS / pedaco.len() + 2;
        let blocos = (0..quantos).map(|_| bloco(&pedaco)).collect();

        let erro = validar_conteudo(&pedido(blocos))
            .expect_err("muitos blocos válidos somando acima do total deveriam ser recusados");

        assert!(erro.to_string().contains("MB"), "{erro}");
    }

    #[test]
    fn metadata_nao_e_porta_lateral() {
        let mut b = bloco("pequeno");
        b.metadata = serde_json::from_str(&format!(
            "{{\"type\":\"generic\",\"lixo\":\"{}\"}}",
            "z".repeat(MAX_BYTES_POR_BLOCO)
        ))
        .ok();

        assert!(
            b.metadata.is_some(),
            "o teste precisa de metadata preenchido para valer"
        );

        let erro = validar_conteudo(&pedido(vec![b]))
            .expect_err("metadata gigante deveria contar no peso do bloco");

        assert!(erro.to_string().contains("Bloco 1"), "{erro}");
    }
}
