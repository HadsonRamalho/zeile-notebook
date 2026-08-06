use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Queryable, Selectable, Identifiable, Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::teams)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, Deserialize, Validate, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::teams)]
#[serde(rename_all = "camelCase")]
pub struct NewTeam {
    #[validate(length(min = 2, message = "Team name is required"))]
    pub name: String,
    pub description: Option<String>,
    #[serde(alias = "image_url")]
    pub image_url: Option<String>,
}

#[derive(AsChangeset, Deserialize, Validate, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::teams)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTeam {
    #[validate(length(min = 2, message = "Team name is required"))]
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(alias = "image_url")]
    pub image_url: Option<String>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = crate::schema::team_roles)]
pub struct TeamRole {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = crate::schema::team_roles)]
#[serde(rename_all = "camelCase")]
pub struct NewTeamRole {
    pub team_id: Uuid,
    pub name: String,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Serialize, Deserialize)]
#[diesel(table_name = crate::schema::team_members)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub id: Uuid,
    pub team_id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,
    pub joined_at: NaiveDateTime,
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = crate::schema::team_members)]
#[serde(rename_all = "camelCase")]
pub struct NewTeamMember {
    pub team_id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,
}

#[derive(Queryable, Selectable, Insertable, Serialize, Deserialize, Debug)]
#[diesel(table_name = crate::schema::team_invitations)]
#[serde(rename_all = "camelCase")]
pub struct TeamInvitation {
    pub id: Uuid,
    pub team_id: Uuid,
    pub role_id: Uuid,
    pub email: String,
    pub token: String,
    pub expires_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::team_invitations)]
pub struct NewTeamInvitation {
    pub team_id: Uuid,
    pub role_id: Uuid,
    pub email: String,
    pub token: String,
    pub expires_at: NaiveDateTime,
}
