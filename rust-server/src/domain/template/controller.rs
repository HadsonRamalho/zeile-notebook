use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        jwt::extract_claims_from_header, permissions::require_team_permission, utils::get_conn,
    },
    models::{error::ApiError, state::AppState},
};

use super::dto::{
    CreateTemplateRequest, MyTemplatesQuery, PublicQuery, PublicTemplateResponse,
    PublishVersionRequest, ResolvedTemplate, VersionQuery, VisibilityRequest,
};
use super::entity::{NewTemplate, Template, TemplateVersion};
use super::repository;
use super::service::{ALLOWED_KINDS, authorize_manage, authorize_use};

#[utoipa::path(post, path = "/template/", request_body = CreateTemplateRequest, responses((status = CREATED, body = Template), (status = 401, body = ApiError)))]
pub async fn api_create_template(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<CreateTemplateRequest>,
) -> Result<(StatusCode, Json<Template>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let kind = payload.kind.trim().to_lowercase();
    if !ALLOWED_KINDS.contains(&kind.as_str()) {
        return Err(ApiError::Request(format!(
            "Unsupported template type: '{kind}'"
        )));
    }
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::Request("Nome do template vazio".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let (owner_user_id, team_id) = match payload.team_id {
        Some(team_id) => {
            require_team_permission(conn, user_id, team_id, "notebook.edit").await?;
            (None, Some(team_id))
        }
        None => (Some(user_id), None),
    };

    let template = repository::create_template(
        conn,
        &NewTemplate {
            kind,
            name,
            user_id: owner_user_id,
            team_id,
            source_notebook_id: payload.source_notebook_id,
        },
    )
    .await?;

    Ok((StatusCode::CREATED, Json(template)))
}

#[utoipa::path(post, path = "/template/{id}/versions", request_body = PublishVersionRequest, responses((status = CREATED, body = TemplateVersion), (status = 401, body = ApiError)))]
pub async fn api_publish_version(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<PublishVersionRequest>,
) -> Result<(StatusCode, Json<TemplateVersion>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let sources = payload
        .named_sources
        .as_object()
        .ok_or_else(|| ApiError::Request("namedSources deve ser um objeto".to_string()))?;
    if sources.is_empty() {
        return Err(ApiError::Request(
            "O template precisa de ao menos um bloco".to_string(),
        ));
    }
    if sources.values().any(|v| !v.is_string()) {
        return Err(ApiError::Request(
            "Cada fonte do template deve ser uma string".to_string(),
        ));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let template = repository::get_template(conn, template_id).await?;
    authorize_manage(conn, &template, user_id).await?;

    let note = payload
        .note
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());

    let version =
        repository::publish_version(conn, template_id, payload.named_sources, note).await?;

    Ok((StatusCode::CREATED, Json(version)))
}

#[utoipa::path(get, path = "/template/{id}", responses((status = OK, body = ResolvedTemplate), (status = 401, body = ApiError)))]
pub async fn api_get_template(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<Uuid>,
    Query(query): Query<VersionQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<ResolvedTemplate>), ApiError> {
    let user_id = extract_claims_from_header(&headers)
        .await
        .ok()
        .map(|c| c.1.id);

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let template = repository::get_template(conn, template_id).await?;
    authorize_use(conn, &template, user_id).await?;

    let version = match query.version {
        Some(v) => repository::get_version(conn, template_id, v).await?,
        None => repository::get_latest_version(conn, template_id).await?,
    };

    Ok((StatusCode::OK, Json(ResolvedTemplate { template, version })))
}

#[utoipa::path(get, path = "/template/all", responses((status = OK, body = Vec<Template>), (status = 401, body = ApiError)))]
pub async fn api_list_my_templates(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MyTemplatesQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<Template>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let templates = match query.team_id {
        Some(team_id) => {
            require_team_permission(conn, user_id, team_id, "notebook.view").await?;
            repository::list_team_templates(conn, team_id).await?
        }
        None => repository::list_personal_templates(conn, user_id).await?,
    };

    Ok((StatusCode::OK, Json(templates)))
}

#[utoipa::path(get, path = "/template/all/public", responses((status = OK, body = Vec<PublicTemplateResponse>), (status = 401, body = ApiError)))]
pub async fn api_list_public_templates(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PublicQuery>,
) -> Result<(StatusCode, Json<Vec<PublicTemplateResponse>>), ApiError> {
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let kind = query
        .kind
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let q = query.q.as_deref().map(str::trim).filter(|s| !s.is_empty());

    let templates = repository::list_public_templates(conn, kind, q).await?;
    Ok((StatusCode::OK, Json(templates)))
}

#[utoipa::path(patch, path = "/template/{id}/visibility", request_body = VisibilityRequest, responses((status = OK, body = Template), (status = 401, body = ApiError)))]
pub async fn api_update_template_visibility(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<VisibilityRequest>,
) -> Result<(StatusCode, Json<Template>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let template = repository::get_template(conn, template_id).await?;
    authorize_manage(conn, &template, user_id).await?;

    let updated =
        repository::update_template_visibility(conn, template_id, payload.is_public).await?;
    Ok((StatusCode::OK, Json(updated)))
}

#[utoipa::path(delete, path = "/template/{id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_template(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let template = repository::get_template(conn, template_id).await?;
    authorize_manage(conn, &template, user_id).await?;

    repository::delete_template(conn, template_id).await?;
    Ok(StatusCode::OK)
}
