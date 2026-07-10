use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::{Json, http::StatusCode};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::controllers::jwt::extract_claims_from_header;
use crate::controllers::permissions::{broadcast_capability_change_for_team, require_team_permission};
use crate::controllers::utils::get_conn;
use crate::models::error::ApiError;
use crate::models::permission_grant::{
    CreateGrantRequest, GrantSubjectKind, GrantTargetKind, NewPermissionGrant, PermissionGrant,
    create_grant, delete_grant_in_team, list_team_grants,
};
use crate::models::state::AppState;
use crate::schema::team_roles;
use crate::sec::catalog::{TargetKind, catalog};

const MANAGE_GRANTS_KEY: &str = "team.roles.edit_role_permissions";

fn to_catalog_target(kind: GrantTargetKind) -> TargetKind {
    match kind {
        GrantTargetKind::Team => TargetKind::Team,
        GrantTargetKind::Notebook => TargetKind::Notebook,
        GrantTargetKind::Block => TargetKind::Block,
        GrantTargetKind::BlockType => TargetKind::BlockType,
        GrantTargetKind::Chat => TargetKind::Chat,
        GrantTargetKind::Global => TargetKind::Global,
    }
}

fn validate_grant(req: &CreateGrantRequest) -> Result<(), ApiError> {
    let permission = catalog()
        .get(&req.permission_key)
        .ok_or_else(|| ApiError::Request(format!("Permissão desconhecida: {}", req.permission_key)))?;

    let target = to_catalog_target(req.target_kind);
    let broad = matches!(target, TargetKind::Team | TargetKind::Global);
    if !broad && !permission.targets.contains(&target) {
        return Err(ApiError::Request(format!(
            "Alvo inválido para a permissão {}",
            req.permission_key
        )));
    }

    match req.target_kind {
        GrantTargetKind::BlockType => {
            if req.target_value.is_none() || req.target_id.is_some() {
                return Err(ApiError::Request(
                    "block_type exige target_value e não aceita target_id".to_string(),
                ));
            }
        }
        GrantTargetKind::Notebook | GrantTargetKind::Block | GrantTargetKind::Chat => {
            if req.target_id.is_none() {
                return Err(ApiError::Request("target_id é obrigatório".to_string()));
            }
        }
        GrantTargetKind::Team | GrantTargetKind::Global => {
            if req.target_id.is_some() || req.target_value.is_some() {
                return Err(ApiError::Request(
                    "target team/global não aceita target_id nem target_value".to_string(),
                ));
            }
        }
    }

    match req.subject_kind {
        GrantSubjectKind::Role | GrantSubjectKind::User => {
            if req.subject_id.is_none() {
                return Err(ApiError::Request("subject_id é obrigatório".to_string()));
            }
        }
        GrantSubjectKind::Principal => {
            return Err(ApiError::Request(
                "grants de time aceitam apenas subject role ou user".to_string(),
            ));
        }
    }

    Ok(())
}

async fn role_belongs_to_team(
    conn: &mut AsyncPgConnection,
    role_id: Uuid,
    team_id: Uuid,
) -> bool {
    team_roles::table
        .filter(team_roles::id.eq(role_id))
        .filter(team_roles::team_id.eq(team_id))
        .select(team_roles::id)
        .first::<Uuid>(conn)
        .await
        .is_ok()
}

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

    let grants = list_team_grants(conn, team_id).await?;

    Ok((StatusCode::OK, Json(grants)))
}

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

    if req.subject_kind == GrantSubjectKind::Role {
        let role_id = req.subject_id.ok_or(ApiError::InvalidData)?;
        if !role_belongs_to_team(conn, role_id, team_id).await {
            return Err(ApiError::Request(
                "O cargo não pertence a este time".to_string(),
            ));
        }
    }

    let grant = create_grant(
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

    broadcast_capability_change_for_team(&state.pool, &state.presence_registry, team_id).await;

    Ok((StatusCode::CREATED, Json(grant)))
}

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

    let deleted = delete_grant_in_team(conn, grant_id, team_id).await?;

    if deleted > 0 {
        broadcast_capability_change_for_team(&state.pool, &state.presence_registry, team_id).await;
    }

    Ok(StatusCode::OK)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(
        key: &str,
        target_kind: GrantTargetKind,
        target_id: Option<Uuid>,
        target_value: Option<&str>,
    ) -> CreateGrantRequest {
        CreateGrantRequest {
            subject_kind: GrantSubjectKind::Role,
            subject_id: Some(Uuid::nil()),
            permission_key: key.to_string(),
            target_kind,
            target_id,
            target_value: target_value.map(|v| v.to_string()),
            effect: crate::models::permission_grant::GrantEffect::Allow,
        }
    }

    #[test]
    fn accepts_team_scoped_notebook_permission() {
        assert!(validate_grant(&req("notebook.view", GrantTargetKind::Team, None, None)).is_ok());
    }

    #[test]
    fn accepts_block_type_target_for_block_permission() {
        assert!(
            validate_grant(&req(
                "notebook.blocks.rust.execute",
                GrantTargetKind::BlockType,
                None,
                Some("rust"),
            ))
            .is_ok()
        );
    }

    #[test]
    fn rejects_unknown_permission_key() {
        assert!(validate_grant(&req("notebook.telepathy", GrantTargetKind::Team, None, None)).is_err());
    }

    #[test]
    fn rejects_block_type_without_value() {
        assert!(
            validate_grant(&req(
                "notebook.blocks.rust.execute",
                GrantTargetKind::BlockType,
                None,
                None,
            ))
            .is_err()
        );
    }

    #[test]
    fn rejects_invalid_target_for_permission() {
        assert!(
            validate_grant(&req("team.manage", GrantTargetKind::Block, Some(Uuid::nil()), None))
                .is_err()
        );
    }

    #[test]
    fn rejects_principal_subject_in_team_scope() {
        let mut r = req("notebook.view", GrantTargetKind::Team, None, None);
        r.subject_kind = GrantSubjectKind::Principal;
        r.subject_id = None;
        assert!(validate_grant(&r).is_err());
    }
}
