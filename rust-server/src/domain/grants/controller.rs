use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::{Json, http::StatusCode};
use uuid::Uuid;

use crate::controllers::jwt::extract_claims_from_header;
use crate::controllers::permissions::{
    broadcast_capability_change, broadcast_capability_change_for_team, ensure_team_not_locked,
    require_team_permission,
};
use crate::controllers::utils::get_conn;
use crate::models::error::ApiError;
use crate::models::state::AppState;
use crate::sec::catalog::{Tier, catalog};

use super::dto::{CreateGrantRequest, PublicGrantRequest};
use super::entity::{GrantSubjectKind, GrantTargetKind, NewPermissionGrant, PermissionGrant};
use super::repository;
use super::service::{is_self_subject, require_notebook_owner, validate_grant};

const MANAGE_GRANTS_KEY: &str = "team.roles.edit_role_permissions";

#[utoipa::path(get, path = "/team/{id}/grants", responses((status = OK, body = Vec<PermissionGrant>), (status = 401, body = ApiError)))]
pub async fn api_list_team_grants(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<PermissionGrant>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, MANAGE_GRANTS_KEY).await?;

    let grants = repository::list_team_grants(conn, team_id).await?;

    Ok((StatusCode::OK, Json(grants)))
}

#[utoipa::path(post, path = "/team/{id}/grants", request_body = CreateGrantRequest, responses((status = CREATED, body = PermissionGrant), (status = 401, body = ApiError)))]
pub async fn api_create_team_grant(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<CreateGrantRequest>,
) -> Result<(StatusCode, Json<PermissionGrant>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, MANAGE_GRANTS_KEY).await?;

    validate_grant(&req)?;

    if is_self_subject(conn, team_id, user_id, req.subject_kind, req.subject_id).await {
        return Err(ApiError::PermissionDenied(
            "Você não pode gerenciar as suas próprias permissões".to_string(),
        ));
    }

    if req.subject_kind == GrantSubjectKind::Role {
        let role_id = req.subject_id.ok_or(ApiError::InvalidData)?;
        if !repository::role_belongs_to_team(conn, role_id, team_id).await {
            return Err(ApiError::Request(
                "O cargo não pertence a este time".to_string(),
            ));
        }
    }

    let grant = repository::create_grant(
        conn,
        NewPermissionGrant {
            subject_kind: req.subject_kind,
            subject_id: req.subject_id,
            subject_principal: None,
            scope_team_id: Some(team_id),
            permission_key: req.permission_key,
            target_kind: req.target_kind,
            target_id: req.target_id,
            target_value: req.target_value,
            effect: req.effect,
        },
    )
    .await?;

    if let Err(e) = ensure_team_not_locked(conn, team_id, None).await {
        repository::delete_grant_in_team(conn, grant.id, team_id).await?;
        return Err(e);
    }

    broadcast_capability_change_for_team(&state.pool, &state.presence_registry, team_id).await;

    Ok((StatusCode::CREATED, Json(grant)))
}

#[utoipa::path(delete, path = "/team/{id}/grants/{grant_id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_team_grant(
    State(state): State<Arc<AppState>>,
    Path((team_id, grant_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, MANAGE_GRANTS_KEY).await?;

    let grant = match repository::find_team_grant(conn, grant_id, team_id).await? {
        Some(g) => g,
        None => return Ok(StatusCode::OK),
    };

    if is_self_subject(conn, team_id, user_id, grant.subject_kind, grant.subject_id).await {
        return Err(ApiError::PermissionDenied(
            "Você não pode gerenciar as suas próprias permissões".to_string(),
        ));
    }

    repository::delete_grant_in_team(conn, grant_id, team_id).await?;

    if let Err(e) = ensure_team_not_locked(conn, team_id, None).await {
        repository::create_grant(
            conn,
            NewPermissionGrant {
                subject_kind: grant.subject_kind,
                subject_id: grant.subject_id,
                subject_principal: grant.subject_principal,
                scope_team_id: grant.scope_team_id,
                permission_key: grant.permission_key,
                target_kind: grant.target_kind,
                target_id: grant.target_id,
                target_value: grant.target_value,
                effect: grant.effect,
            },
        )
        .await?;
        return Err(e);
    }

    broadcast_capability_change_for_team(&state.pool, &state.presence_registry, team_id).await;

    Ok(StatusCode::OK)
}

#[utoipa::path(get, path = "/notebook/{id}/public-grants", responses((status = OK, body = Vec<PermissionGrant>), (status = 401, body = ApiError)))]
pub async fn api_list_public_grants(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<PermissionGrant>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_notebook_owner(conn, notebook_id, user_id).await?;

    let grants = repository::list_notebook_principal_grants(conn, notebook_id).await?;

    Ok((StatusCode::OK, Json(grants)))
}

#[utoipa::path(post, path = "/notebook/{id}/public-grants", request_body = PublicGrantRequest, responses((status = CREATED, body = PermissionGrant), (status = 401, body = ApiError)))]
pub async fn api_create_public_grant(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<PublicGrantRequest>,
) -> Result<(StatusCode, Json<PermissionGrant>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_notebook_owner(conn, notebook_id, user_id).await?;

    let permission = catalog().get(&req.permission_key).ok_or_else(|| {
        ApiError::Request(format!("Permissão desconhecida: {}", req.permission_key))
    })?;

    if permission.tier != Tier::General {
        return Err(ApiError::Request(
            "Notebooks públicos aceitam apenas permissões gerais".to_string(),
        ));
    }
    if req.permission_key == "notebook.delete" {
        return Err(ApiError::Request(
            "Exclusão não pode ser concedida em notebook público".to_string(),
        ));
    }

    let grant = repository::create_grant(
        conn,
        NewPermissionGrant {
            subject_kind: GrantSubjectKind::Principal,
            subject_id: None,
            subject_principal: Some("authenticated".to_string()),
            scope_team_id: None,
            permission_key: req.permission_key,
            target_kind: GrantTargetKind::Notebook,
            target_id: Some(notebook_id),
            target_value: None,
            effect: req.effect,
        },
    )
    .await?;

    broadcast_capability_change(&state.pool, &state.presence_registry, notebook_id).await;

    Ok((StatusCode::CREATED, Json(grant)))
}

#[utoipa::path(delete, path = "/notebook/{id}/public-grants/{grant_id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_public_grant(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, grant_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_notebook_owner(conn, notebook_id, user_id).await?;

    let deleted = repository::delete_notebook_grant(conn, grant_id, notebook_id).await?;

    if deleted > 0 {
        broadcast_capability_change(&state.pool, &state.presence_registry, notebook_id).await;
    }

    Ok(StatusCode::OK)
}
