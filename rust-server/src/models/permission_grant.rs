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
