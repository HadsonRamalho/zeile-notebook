use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
};
use diesel_async::AsyncPgConnection;
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;

use crate::{
    controllers::{jwt::extract_claims_from_header, utils::get_conn},
    models::{
        self,
        error::ApiError,
        notebook::{
            NewBlock, NewNotebook, Notebook, NotebookResponse, PublicNotebookResponse, SearchQuery,
            SearchResult, SyncNotebookRequest, UpdateNotebookTitle, UpdateNotebookVisibility,
            delete_notebook, get_public_notebooks, update_notebook_title,
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

pub async fn is_notebook_owner(
    mut conn: &mut AsyncPgConnection,
    user_id: Option<Uuid>,
    notebook_id: &Uuid,
) -> Result<(), ApiError> {
    if user_id.is_none() {
        return Err(ApiError::InvalidAuthorizationToken);
    }
    let user_id = user_id.unwrap();
    match models::notebook::find_notebook_by_id(&mut conn, &notebook_id).await {
        Ok(notebook) => {
            if let Some(id) = notebook.user_id
                && id != user_id.clone()
            {
                return Err(ApiError::InvalidAuthorizationToken);
            }
            Ok(())
        }
        Err(e) => return Err(e),
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

    match models::notebook::find_notebook_by_id(conn, &notebook_id).await {
        Ok(notebook) => {
            if notebook.is_public {
                return Ok((StatusCode::OK, Json(notebook)));
            }
            if let Err(e) = is_notebook_owner(conn, id, &notebook_id).await
                && !notebook.is_public
            {
                return Err(e);
            }
            Ok((StatusCode::OK, Json(notebook)))
        }
        Err(e) => Err(e),
    }
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

    match models::notebook::get_notebook_with_blocks(conn, &notebook_id).await {
        Ok(notebook) => {
            if notebook.meta.is_public {
                return Ok((StatusCode::OK, Json(notebook)));
            }
            if let Err(e) = is_notebook_owner(conn, id, &notebook_id).await
                && !notebook.meta.is_public
            {
                return Err(e);
            }
            Ok((StatusCode::OK, Json(notebook)))
        }
        Err(e) => Err(ApiError::Database(e)),
    }
}

pub async fn api_save_notebook_content(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SyncNotebookRequest>,
) -> Result<StatusCode, ApiError> {
    let id = extract_claims_from_header(&headers).await?.1.id;

    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    if let Err(e) = is_notebook_owner(&mut conn, Some(id), &notebook_id).await {
        return Err(e);
    }

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

    let target_notebook = match models::notebook::find_notebook_by_id(conn, &notebook_id).await {
        Ok(notebook) => {
            if let Err(e) = is_notebook_owner(conn, Some(id), &notebook_id).await
                && !notebook.is_public
            {
                return Err(e);
            }
            notebook
        }
        Err(e) => return Err(e),
    };

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

pub async fn api_get_public_notebooks(
    State(state): State<Arc<AppState>>,
) -> Result<(StatusCode, Json<Vec<PublicNotebookResponse>>), ApiError> {
    let mut conn = state
        .pool
        .get()
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.to_string()))?;

    Ok((StatusCode::OK, Json(get_public_notebooks(&mut conn).await?)))
}
