use diesel_async::AsyncPgConnection;
use uuid::Uuid;

use crate::controllers::permissions::{
    NotebookCtx, TargetCtx, caller_role_in_team, resolve_capabilities,
};
use crate::models::error::ApiError;
use crate::sec::catalog::{TargetKind, catalog};

use super::dto::CreateGrantRequest;
use super::entity::{GrantSubjectKind, GrantTargetKind};

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

pub fn validate_grant(req: &CreateGrantRequest) -> Result<(), ApiError> {
    let permission = catalog().get(&req.permission_key).ok_or_else(|| {
        ApiError::Request(format!("Permissão desconhecida: {}", req.permission_key))
    })?;

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

pub async fn is_self_subject(
    conn: &mut AsyncPgConnection,
    team_id: Uuid,
    caller_id: Uuid,
    subject_kind: GrantSubjectKind,
    subject_id: Option<Uuid>,
) -> bool {
    match subject_kind {
        GrantSubjectKind::User => subject_id == Some(caller_id),
        GrantSubjectKind::Role => {
            subject_id.is_some()
                && caller_role_in_team(conn, team_id, caller_id).await == subject_id
        }
        GrantSubjectKind::Principal => false,
    }
}

pub async fn require_notebook_owner(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let notebook = crate::domain::notebook::find_notebook_by_id(conn, &notebook_id).await?;
    let ctx = NotebookCtx {
        notebook_id,
        team_id: notebook.team_id,
        owner_user_id: notebook.user_id,
        is_public: notebook.is_public,
    };
    let caps = resolve_capabilities(conn, ctx, Some(user_id)).await?;
    if caps.can("notebook.manage_public", &TargetCtx::default()) {
        Ok(())
    } else {
        Err(ApiError::PermissionDenied(
            "notebook.manage_public".to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

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
            effect: super::super::entity::GrantEffect::Allow,
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
        assert!(
            validate_grant(&req(
                "notebook.telepathy",
                GrantTargetKind::Team,
                None,
                None
            ))
            .is_err()
        );
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
            validate_grant(&req(
                "team.manage",
                GrantTargetKind::Block,
                Some(Uuid::nil()),
                None
            ))
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
