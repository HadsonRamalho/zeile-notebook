use crate::schema::permission_grants;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::GrantSubjectKind"]
pub enum GrantSubjectKind {
    Role,
    User,
    Principal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize)]
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
