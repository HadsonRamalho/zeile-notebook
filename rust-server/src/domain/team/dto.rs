use chrono::NaiveDateTime;
use diesel::prelude::Queryable;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::entity::TeamRole;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RolePermissions {
    #[serde(alias = "can_read")]
    pub can_read: bool,
    #[serde(alias = "can_write")]
    pub can_write: bool,
    #[serde(alias = "can_manage_privacy")]
    pub can_manage_privacy: bool,
    #[serde(alias = "can_manage_clones")]
    pub can_manage_clones: bool,
    #[serde(alias = "can_invite_users")]
    pub can_invite_users: bool,
    #[serde(alias = "can_remove_users")]
    pub can_remove_users: bool,
    #[serde(alias = "can_manage_permissions")]
    pub can_manage_permissions: bool,
    #[serde(alias = "can_manage_team")]
    pub can_manage_team: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TeamRoleView {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub created_at: NaiveDateTime,
    #[serde(flatten)]
    pub permissions: RolePermissions,
}

impl TeamRoleView {
    pub fn new(role: &TeamRole, permissions: RolePermissions) -> Self {
        Self {
            id: role.id,
            team_id: role.team_id,
            name: role.name.clone(),
            created_at: role.created_at,
            permissions,
        }
    }

    pub fn synthetic(name: &str, permissions: RolePermissions) -> Self {
        Self {
            id: Uuid::new_v4(),
            team_id: Uuid::new_v4(),
            name: name.to_string(),
            created_at: chrono::Utc::now().naive_local(),
            permissions,
        }
    }

    pub fn view_only() -> Self {
        Self::synthetic(
            "Default Role Name - View Only",
            RolePermissions::view_only(),
        )
    }

    pub fn all_false() -> Self {
        Self::synthetic("Default Role Name - All False", RolePermissions::default())
    }
}

#[derive(Serialize, Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NewTeamRoleRequest {
    #[validate(length(min = 2, message = "Team role name is required"))]
    pub name: String,
    #[serde(flatten)]
    pub permissions: RolePermissions,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTeamRole {
    pub id: Uuid,
    #[validate(length(min = 2, message = "Team role name is required"))]
    pub name: Option<String>,
    #[serde(alias = "can_read")]
    pub can_read: Option<bool>,
    #[serde(alias = "can_write")]
    pub can_write: Option<bool>,
    #[serde(alias = "can_manage_privacy")]
    pub can_manage_privacy: Option<bool>,
    #[serde(alias = "can_manage_clones")]
    pub can_manage_clones: Option<bool>,
    #[serde(alias = "can_invite_users")]
    pub can_invite_users: Option<bool>,
    #[serde(alias = "can_remove_users")]
    pub can_remove_users: Option<bool>,
    #[serde(alias = "can_manage_permissions")]
    pub can_manage_permissions: Option<bool>,
    #[serde(alias = "can_manage_team")]
    pub can_manage_team: Option<bool>,
}

#[derive(Queryable, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberResponse {
    pub id: Uuid,
    pub team_id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,
    pub name: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub joined_at: NaiveDateTime,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemberRoleRequest {
    #[serde(alias = "user_id")]
    pub user_id: Uuid,
    #[serde(alias = "role_id")]
    pub role_id: Uuid,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    pub role_id: Uuid,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
pub struct AcceptInviteRequest {
    #[validate(length(min = 1, message = "Token is required"))]
    pub token: String,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTeamPageRequest {
    #[validate(length(
        min = 1,
        max = 300,
        message = "Title must be between 1 and 300 characters"
    ))]
    pub title: String,
}
