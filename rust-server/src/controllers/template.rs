use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, Query, State},
};
use hyper::{HeaderMap, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        jwt::extract_claims_from_header, permissions::require_team_permission, utils::get_conn,
    },
    models::{
        self,
        error::ApiError,
        state::AppState,
        team::find_team_member_with_role,
        template::{NewTemplate, PublicTemplateResponse, Template, TemplateVersion},
    },
};

const ALLOWED_KINDS: &[&str] = &["typst"];

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTemplateRequest {
    pub kind: String,
    #[validate(length(max = 300, message = "Name must be at most 300 characters"))]
    pub name: String,
    pub team_id: Option<Uuid>,
    pub source_notebook_id: Option<Uuid>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublishVersionRequest {
    pub named_sources: Value,
    pub note: Option<String>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VisibilityRequest {
    pub is_public: bool,
}

#[derive(Deserialize)]
pub struct VersionQuery {
    pub version: Option<i32>,
}

#[derive(Deserialize)]
pub struct PublicQuery {
    pub kind: Option<String>,
    pub q: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyTemplatesQuery {
    pub team_id: Option<Uuid>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ResolvedTemplate {
    #[serde(flatten)]
    pub template: Template,
    pub version: Option<TemplateVersion>,
}

async fn authorize_manage(
    conn: &mut diesel_async::AsyncPgConnection,
    template: &Template,
    user_id: Uuid,
) -> Result<(), ApiError> {
    if template.user_id == Some(user_id) {
        return Ok(());
    }
    if let Some(team_id) = template.team_id {
        return require_team_permission(conn, user_id, team_id, "notebook.edit").await;
    }
    Err(ApiError::PermissionDenied("template.manage".to_string()))
}

async fn authorize_use(
    conn: &mut diesel_async::AsyncPgConnection,
    template: &Template,
    user_id: Option<Uuid>,
) -> Result<(), ApiError> {
    if template.is_public {
        return Ok(());
    }
    if let (Some(owner), Some(uid)) = (template.user_id, user_id)
        && owner == uid
    {
        return Ok(());
    }
    if let (Some(team_id), Some(uid)) = (template.team_id, user_id)
        && find_team_member_with_role(conn, team_id, uid).await.is_ok()
    {
        return Ok(());
    }
    Err(ApiError::PermissionDenied("template.use".to_string()))
}

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

    let template = models::template::create_template(
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

    let template = models::template::get_template(conn, template_id).await?;
    authorize_manage(conn, &template, user_id).await?;

    let note = payload
        .note
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());

    let version =
        models::template::publish_version(conn, template_id, payload.named_sources, note).await?;

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

    let template = models::template::get_template(conn, template_id).await?;
    authorize_use(conn, &template, user_id).await?;

    let version = match query.version {
        Some(v) => models::template::get_version(conn, template_id, v).await?,
        None => models::template::get_latest_version(conn, template_id).await?,
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
            models::template::list_team_templates(conn, team_id).await?
        }
        None => models::template::list_personal_templates(conn, user_id).await?,
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

    let templates = models::template::list_public_templates(conn, kind, q).await?;
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

    let template = models::template::get_template(conn, template_id).await?;
    authorize_manage(conn, &template, user_id).await?;

    let updated =
        models::template::update_template_visibility(conn, template_id, payload.is_public).await?;
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

    let template = models::template::get_template(conn, template_id).await?;
    authorize_manage(conn, &template, user_id).await?;

    models::template::delete_template(conn, template_id).await?;
    Ok(StatusCode::OK)
}
