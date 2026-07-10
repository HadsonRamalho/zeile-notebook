use std::collections::HashSet;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::{Json, http::HeaderMap};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl, pooled_connection::deadpool::Pool};
use hyper::StatusCode;
use serde::Serialize;
use uuid::Uuid;

use crate::controllers::jwt::extract_claims_from_header;
use crate::controllers::sync::PresenceRegistry;
use crate::controllers::utils::get_conn;
use crate::schema::notebooks;
use crate::models::error::ApiError;
use crate::models::permission_grant::{
    GrantEffect, GrantSubjectKind, GrantTargetKind, PermissionGrant,
};
use crate::models::state::AppState;
use crate::models::team::find_team_member_with_role;
use crate::schema::permission_grants;
use crate::sec::catalog::catalog;

#[derive(Debug, Clone)]
pub struct NotebookCtx {
    pub notebook_id: Uuid,
    pub team_id: Option<Uuid>,
    pub owner_user_id: Option<Uuid>,
    pub is_public: bool,
}

#[derive(Debug, Clone, Default)]
pub struct TargetCtx {
    pub block_id: Option<Uuid>,
    pub block_type: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CapabilitySet {
    all: bool,
    grants: Vec<PermissionGrant>,
    ctx: NotebookCtx,
}

fn effective_keys(key: &str) -> HashSet<String> {
    let cat = catalog();
    let mut out = HashSet::new();
    let mut stack = vec![key.to_string()];
    while let Some(k) = stack.pop() {
        if out.insert(k.clone()) {
            for parent in cat.implied_by(&k) {
                stack.push(parent.clone());
            }
        }
    }
    out
}

impl CapabilitySet {
    pub fn ctx(&self) -> &NotebookCtx {
        &self.ctx
    }

    pub fn is_owner_or_admin(&self) -> bool {
        self.all
    }

    pub fn can(&self, key: &str, target: &TargetCtx) -> bool {
        if self.all {
            return true;
        }
        self.evaluate(key, target)
    }

    fn evaluate(&self, key: &str, target: &TargetCtx) -> bool {
        let keys = effective_keys(key);

        let mut best_level: i32 = -1;
        let mut deny_at_best = false;
        let mut allow_at_best = false;

        for grant in &self.grants {
            if !keys.contains(grant.permission_key.as_str()) {
                continue;
            }
            let level = match self.target_level(grant, target) {
                Some(level) => level as i32,
                None => continue,
            };
            if level > best_level {
                best_level = level;
                deny_at_best = grant.effect == GrantEffect::Deny;
                allow_at_best = grant.effect == GrantEffect::Allow;
            } else if level == best_level {
                match grant.effect {
                    GrantEffect::Deny => deny_at_best = true,
                    GrantEffect::Allow => allow_at_best = true,
                }
            }
        }

        if best_level < 0 {
            return false;
        }
        if deny_at_best {
            return false;
        }
        allow_at_best
    }

    fn target_level(&self, grant: &PermissionGrant, target: &TargetCtx) -> Option<u8> {
        match grant.target_kind {
            GrantTargetKind::Global => Some(0),
            GrantTargetKind::Team => Some(1),
            GrantTargetKind::Notebook => {
                if grant.target_id == Some(self.ctx.notebook_id) {
                    Some(2)
                } else {
                    None
                }
            }
            GrantTargetKind::BlockType => match (&grant.target_value, &target.block_type) {
                (Some(value), Some(kind)) if value == kind => Some(3),
                _ => None,
            },
            GrantTargetKind::Block => match (grant.target_id, target.block_id) {
                (Some(a), Some(b)) if a == b => Some(4),
                _ => None,
            },
            GrantTargetKind::Chat => None,
        }
    }
}

pub async fn resolve_capabilities(
    conn: &mut AsyncPgConnection,
    ctx: NotebookCtx,
    user_id: Option<Uuid>,
) -> Result<CapabilitySet, ApiError> {
    let owner = matches!(
        (ctx.owner_user_id, user_id),
        (Some(owner), Some(uid)) if owner == uid
    );

    let mut grants: Vec<PermissionGrant> = Vec::new();

    if let (Some(team_id), Some(uid)) = (ctx.team_id, user_id) {
        if let Ok((_, role)) = find_team_member_with_role(conn, team_id, uid).await {
            let team_grants = permission_grants::table
                .filter(permission_grants::scope_team_id.eq(team_id))
                .filter(
                    permission_grants::subject_kind
                        .eq(GrantSubjectKind::Role)
                        .and(permission_grants::subject_id.eq(role.id))
                        .or(permission_grants::subject_kind
                            .eq(GrantSubjectKind::User)
                            .and(permission_grants::subject_id.eq(uid))),
                )
                .select(PermissionGrant::as_select())
                .load(conn)
                .await
                .map_err(|e| ApiError::Database(e.to_string()))?;
            grants.extend(team_grants);
        }
    }

    if ctx.is_public {
        grants.push(PermissionGrant {
            id: Uuid::nil(),
            subject_kind: GrantSubjectKind::Principal,
            subject_id: None,
            subject_principal: Some("public_baseline".to_string()),
            scope_team_id: None,
            permission_key: "notebook.view".to_string(),
            target_kind: GrantTargetKind::Notebook,
            target_id: Some(ctx.notebook_id),
            target_value: None,
            effect: GrantEffect::Allow,
            created_at: chrono::Utc::now().naive_utc(),
        });

        let principal = match user_id {
            Some(_) => "authenticated",
            None => "anonymous",
        };
        let principal_grants = permission_grants::table
            .filter(permission_grants::subject_kind.eq(GrantSubjectKind::Principal))
            .filter(permission_grants::subject_principal.eq(principal))
            .filter(permission_grants::target_kind.eq(GrantTargetKind::Notebook))
            .filter(permission_grants::target_id.eq(ctx.notebook_id))
            .select(PermissionGrant::as_select())
            .load(conn)
            .await
            .map_err(|e| ApiError::Database(e.to_string()))?;
        grants.extend(principal_grants);
    }

    let mut caps = CapabilitySet {
        all: owner,
        grants,
        ctx,
    };

    if !caps.all && caps.evaluate("team.manage", &TargetCtx::default()) {
        caps.all = true;
    }

    Ok(caps)
}

#[derive(Debug, Serialize)]
pub struct GrantView {
    pub permission_key: String,
    pub effect: GrantEffect,
    pub target_kind: GrantTargetKind,
    pub target_id: Option<Uuid>,
    pub target_value: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CapabilitySnapshot {
    pub all: bool,
    pub grants: Vec<GrantView>,
}

impl CapabilitySet {
    pub fn snapshot(&self) -> CapabilitySnapshot {
        CapabilitySnapshot {
            all: self.all,
            grants: self
                .grants
                .iter()
                .map(|g| GrantView {
                    permission_key: g.permission_key.clone(),
                    effect: g.effect,
                    target_kind: g.target_kind,
                    target_id: g.target_id,
                    target_value: g.target_value.clone(),
                })
                .collect(),
        }
    }
}

pub async fn require(
    pool: &Pool<AsyncPgConnection>,
    user_id: Option<Uuid>,
    notebook_id: Uuid,
    key: &str,
    target: &TargetCtx,
) -> Result<CapabilitySet, ApiError> {
    let caps = capabilities(pool, user_id, notebook_id).await?;
    if caps.can(key, target) {
        Ok(caps)
    } else {
        Err(ApiError::PermissionDenied(key.to_string()))
    }
}

pub async fn require_team_permission(
    conn: &mut AsyncPgConnection,
    user_id: Uuid,
    team_id: Uuid,
    key: &str,
) -> Result<(), ApiError> {
    let ctx = NotebookCtx {
        notebook_id: Uuid::nil(),
        team_id: Some(team_id),
        owner_user_id: None,
        is_public: false,
    };
    let caps = resolve_capabilities(conn, ctx, Some(user_id)).await?;
    if caps.can(key, &TargetCtx::default()) {
        Ok(())
    } else {
        Err(ApiError::PermissionDenied(key.to_string()))
    }
}

pub async fn capabilities(
    pool: &Pool<AsyncPgConnection>,
    user_id: Option<Uuid>,
    notebook_id: Uuid,
) -> Result<CapabilitySet, ApiError> {
    let conn = &mut get_conn(pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let notebook = crate::models::notebook::find_notebook_by_id(conn, &notebook_id).await?;

    let ctx = NotebookCtx {
        notebook_id,
        team_id: notebook.team_id,
        owner_user_id: notebook.user_id,
        is_public: notebook.is_public,
    };

    resolve_capabilities(conn, ctx, user_id).await
}

pub const CAPABILITIES_UPDATED_SIGNAL: &str = r#"{"type":"capabilities_updated"}"#;

pub async fn broadcast_capability_change(presence: &PresenceRegistry, notebook_id: Uuid) {
    let room = {
        let map = presence.read().await;
        map.get(&notebook_id).cloned()
    };

    if let Some(room) = room {
        let room = room.read().await;
        for member in room.subscribers.values() {
            let _ = member.tx.send(CAPABILITIES_UPDATED_SIGNAL.to_string());
        }
    }
}

pub async fn broadcast_capability_change_for_team(
    pool: &Pool<AsyncPgConnection>,
    presence: &PresenceRegistry,
    team_id: Uuid,
) {
    let conn = &mut match get_conn(pool).await {
        Ok(conn) => conn,
        Err(_) => return,
    };

    let ids: Vec<Uuid> = notebooks::table
        .filter(notebooks::team_id.eq(team_id))
        .select(notebooks::id)
        .load(conn)
        .await
        .unwrap_or_default();

    for id in ids {
        broadcast_capability_change(presence, id).await;
    }
}

pub async fn api_get_permission_catalog()
-> (StatusCode, Json<&'static crate::sec::catalog::Catalog>) {
    (StatusCode::OK, Json(catalog()))
}

pub async fn api_get_notebook_capabilities(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<CapabilitySnapshot>), ApiError> {
    let user_id = match extract_claims_from_header(&headers).await {
        Ok(data) => Some(data.1.id),
        Err(_) => None,
    };

    let caps = capabilities(&state.pool, user_id, notebook_id).await?;

    Ok((StatusCode::OK, Json(caps.snapshot())))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> NotebookCtx {
        NotebookCtx {
            notebook_id: Uuid::nil(),
            team_id: Some(Uuid::nil()),
            owner_user_id: None,
            is_public: false,
        }
    }

    fn grant(key: &str, effect: GrantEffect, kind: GrantTargetKind, value: Option<&str>) -> PermissionGrant {
        PermissionGrant {
            id: Uuid::new_v4(),
            subject_kind: GrantSubjectKind::Role,
            subject_id: Some(Uuid::nil()),
            subject_principal: None,
            scope_team_id: Some(Uuid::nil()),
            permission_key: key.to_string(),
            target_kind: kind,
            target_id: match kind {
                GrantTargetKind::Notebook => Some(Uuid::nil()),
                _ => None,
            },
            target_value: value.map(|v| v.to_string()),
            effect,
            created_at: chrono::Utc::now().naive_utc(),
        }
    }

    fn caps(grants: Vec<PermissionGrant>) -> CapabilitySet {
        CapabilitySet {
            all: false,
            grants,
            ctx: ctx(),
        }
    }

    #[test]
    fn default_deny_when_no_grants() {
        let c = caps(vec![]);
        assert!(!c.can("notebook.view", &TargetCtx::default()));
    }

    #[test]
    fn general_grant_implies_granular() {
        let c = caps(vec![grant(
            "notebook.blocks.execute",
            GrantEffect::Allow,
            GrantTargetKind::Team,
            None,
        )]);
        assert!(c.can("notebook.blocks.rust.execute", &TargetCtx::default()));
    }

    #[test]
    fn deny_beats_allow_at_same_level() {
        let c = caps(vec![
            grant("notebook.view", GrantEffect::Allow, GrantTargetKind::Team, None),
            grant("notebook.view", GrantEffect::Deny, GrantTargetKind::Team, None),
        ]);
        assert!(!c.can("notebook.view", &TargetCtx::default()));
    }

    #[test]
    fn more_specific_allow_overrides_broader_deny() {
        let c = caps(vec![
            grant("notebook.blocks.view", GrantEffect::Deny, GrantTargetKind::Team, None),
            grant(
                "notebook.blocks.rust.view",
                GrantEffect::Allow,
                GrantTargetKind::BlockType,
                Some("rust"),
            ),
        ]);
        let target = TargetCtx {
            block_id: None,
            block_type: Some("rust".to_string()),
        };
        assert!(c.can("notebook.blocks.rust.view", &target));
    }

    #[test]
    fn block_type_deny_hides_only_that_type() {
        let c = caps(vec![
            grant("notebook.blocks.view", GrantEffect::Allow, GrantTargetKind::Team, None),
            grant(
                "notebook.blocks.go.view",
                GrantEffect::Deny,
                GrantTargetKind::BlockType,
                Some("go"),
            ),
        ]);
        let go = TargetCtx {
            block_id: None,
            block_type: Some("go".to_string()),
        };
        let rust = TargetCtx {
            block_id: None,
            block_type: Some("rust".to_string()),
        };
        assert!(!c.can("notebook.blocks.go.view", &go));
        assert!(c.can("notebook.blocks.rust.view", &rust));
    }

    #[test]
    fn public_baseline_allows_view_not_edit() {
        let c = caps(vec![grant(
            "notebook.view",
            GrantEffect::Allow,
            GrantTargetKind::Notebook,
            None,
        )]);
        assert!(c.can("notebook.view", &TargetCtx::default()));
        assert!(!c.can("notebook.edit", &TargetCtx::default()));
    }

    #[test]
    fn owner_can_everything() {
        let mut c = caps(vec![]);
        c.all = true;
        assert!(c.can("notebook.delete", &TargetCtx::default()));
    }
}
