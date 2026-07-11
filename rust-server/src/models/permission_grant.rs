use crate::models::error::ApiError;
use crate::schema::permission_grants;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[ExistingTypePath = "crate::schema::sql_types::GrantSubjectKind"]
pub enum GrantSubjectKind {
    Role,
    User,
    Principal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[ExistingTypePath = "crate::schema::sql_types::GrantTargetKind"]
pub enum GrantTargetKind {
    Team,
    Notebook,
    Block,
    BlockType,
    Chat,
    Global,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[ExistingTypePath = "crate::schema::sql_types::GrantEffect"]
pub enum GrantEffect {
    Allow,
    Deny,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = permission_grants)]
pub struct PermissionGrant {
    pub id: Uuid,
    pub subject_kind: GrantSubjectKind,
    pub subject_id: Option<Uuid>,
    pub subject_principal: Option<String>,
    pub scope_team_id: Option<Uuid>,
    pub permission_key: String,
    pub target_kind: GrantTargetKind,
    pub target_id: Option<Uuid>,
    pub target_value: Option<String>,
    pub effect: GrantEffect,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = permission_grants)]
pub struct NewPermissionGrant {
    pub subject_kind: GrantSubjectKind,
    pub subject_id: Option<Uuid>,
    pub subject_principal: Option<String>,
    pub scope_team_id: Option<Uuid>,
    pub permission_key: String,
    pub target_kind: GrantTargetKind,
    pub target_id: Option<Uuid>,
    pub target_value: Option<String>,
    pub effect: GrantEffect,
}

#[derive(Deserialize)]
pub struct PublicGrantRequest {
    pub permission_key: String,
    pub effect: GrantEffect,
}

#[derive(Deserialize)]
pub struct CreateGrantRequest {
    pub subject_kind: GrantSubjectKind,
    pub subject_id: Option<Uuid>,
    pub permission_key: String,
    pub target_kind: GrantTargetKind,
    pub target_id: Option<Uuid>,
    pub target_value: Option<String>,
    pub effect: GrantEffect,
}

pub async fn create_grant(
    conn: &mut AsyncPgConnection,
    grant: NewPermissionGrant,
) -> Result<PermissionGrant, ApiError> {
    diesel::insert_into(permission_grants::table)
        .values(&grant)
        .returning(PermissionGrant::as_returning())
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn delete_grant_in_team(
    conn: &mut AsyncPgConnection,
    grant_id: Uuid,
    team_id: Uuid,
) -> Result<usize, ApiError> {
    diesel::delete(
        permission_grants::table
            .filter(permission_grants::id.eq(grant_id))
            .filter(permission_grants::scope_team_id.eq(team_id)),
    )
    .execute(conn)
    .await
    .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn seed_team_role_grants(
    conn: &mut AsyncPgConnection,
    role_id: Uuid,
    team_id: Uuid,
    keys: &[&str],
) -> Result<(), ApiError> {
    if keys.is_empty() {
        return Ok(());
    }

    let rows: Vec<NewPermissionGrant> = keys
        .iter()
        .map(|key| NewPermissionGrant {
            subject_kind: GrantSubjectKind::Role,
            subject_id: Some(role_id),
            subject_principal: None,
            scope_team_id: Some(team_id),
            permission_key: key.to_string(),
            target_kind: GrantTargetKind::Team,
            target_id: None,
            target_value: None,
            effect: GrantEffect::Allow,
        })
        .collect();

    diesel::insert_into(permission_grants::table)
        .values(&rows)
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok(())
}

pub async fn list_notebook_principal_grants(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
) -> Result<Vec<PermissionGrant>, ApiError> {
    permission_grants::table
        .filter(permission_grants::subject_kind.eq(GrantSubjectKind::Principal))
        .filter(permission_grants::subject_principal.eq("authenticated"))
        .filter(permission_grants::target_kind.eq(GrantTargetKind::Notebook))
        .filter(permission_grants::target_id.eq(notebook_id))
        .select(PermissionGrant::as_select())
        .load(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn delete_notebook_grant(
    conn: &mut AsyncPgConnection,
    grant_id: Uuid,
    notebook_id: Uuid,
) -> Result<usize, ApiError> {
    diesel::delete(
        permission_grants::table
            .filter(permission_grants::id.eq(grant_id))
            .filter(permission_grants::target_id.eq(notebook_id))
            .filter(permission_grants::subject_kind.eq(GrantSubjectKind::Principal)),
    )
    .execute(conn)
    .await
    .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn find_team_grant(
    conn: &mut AsyncPgConnection,
    grant_id: Uuid,
    team_id: Uuid,
) -> Result<Option<PermissionGrant>, ApiError> {
    permission_grants::table
        .filter(permission_grants::id.eq(grant_id))
        .filter(permission_grants::scope_team_id.eq(team_id))
        .select(PermissionGrant::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_team_grants(
    conn: &mut AsyncPgConnection,
    team_id: Uuid,
) -> Result<Vec<PermissionGrant>, ApiError> {
    permission_grants::table
        .filter(permission_grants::scope_team_id.eq(team_id))
        .select(PermissionGrant::as_select())
        .load(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}
