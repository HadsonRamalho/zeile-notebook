use crate::models::error::ApiError;
use crate::schema::{team_members, team_roles, teams};
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Queryable, Selectable, Identifiable, Debug, Serialize, Deserialize)]
#[diesel(table_name = teams)]
pub struct Team {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, Deserialize, Validate)]
#[diesel(table_name = teams)]
pub struct NewTeam {
    #[validate(length(min = 2, message = "Team name is required"))]
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
}

#[derive(AsChangeset, Deserialize, Validate)]
#[diesel(table_name = teams)]
pub struct UpdateTeam {
    #[validate(length(min = 2, message = "Team name is required"))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Serialize, Deserialize, Clone)]
#[diesel(table_name = team_roles)]
pub struct TeamRole {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub can_read: bool,
    pub can_write: bool,
    pub can_manage_privacy: bool,
    pub can_manage_clones: bool,
    pub can_invite_users: bool,
    pub can_remove_users: bool,
    pub can_manage_permissions: bool,
    pub created_at: NaiveDateTime,
    pub can_manage_team: bool,
}

impl TeamRole {
    pub fn get_view_only() -> Self {
        Self {
            id: Uuid::new_v4(),
            team_id: Uuid::new_v4(),
            name: "Default Role Name - View Only".to_string(),
            can_read: true,
            can_write: false,
            can_manage_privacy: false,
            can_manage_clones: false,
            can_invite_users: false,
            can_remove_users: false,
            can_manage_permissions: false,
            created_at: chrono::Utc::now().naive_local(),
            can_manage_team: false,
        }
    }

    pub fn get_all_false() -> Self {
        Self {
            id: Uuid::new_v4(),
            team_id: Uuid::new_v4(),
            name: "Default Role Name - All False".to_string(),
            can_read: false,
            can_write: false,
            can_manage_privacy: false,
            can_manage_clones: false,
            can_invite_users: false,
            can_remove_users: false,
            can_manage_permissions: false,
            created_at: chrono::Utc::now().naive_local(),
            can_manage_team: false,
        }
    }
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = team_roles)]
pub struct NewTeamRole {
    pub team_id: Uuid,
    pub name: String,
    pub can_read: bool,
    pub can_write: bool,
    pub can_manage_privacy: bool,
    pub can_manage_clones: bool,
    pub can_invite_users: bool,
    pub can_remove_users: bool,
    pub can_manage_permissions: bool,
    pub can_manage_team: bool,
}

#[derive(Serialize, Deserialize, Validate)]
pub struct NewTeamRoleRequest {
    #[validate(length(min = 2, message = "Team role name is required"))]
    pub name: String,
    pub can_read: bool,
    pub can_write: bool,
    pub can_manage_privacy: bool,
    pub can_manage_clones: bool,
    pub can_invite_users: bool,
    pub can_remove_users: bool,
    pub can_manage_permissions: bool,
    pub can_manage_team: bool,
}

impl NewTeamRole {
    pub fn from_request(team_id: Uuid, r: NewTeamRoleRequest) -> Self {
        Self {
            team_id,
            name: r.name,
            can_read: r.can_read,
            can_write: r.can_write,
            can_manage_privacy: r.can_manage_privacy,
            can_manage_clones: r.can_manage_clones,
            can_invite_users: r.can_invite_users,
            can_remove_users: r.can_remove_users,
            can_manage_permissions: r.can_manage_permissions,
            can_manage_team: r.can_manage_team,
        }
    }
}

#[derive(AsChangeset, Deserialize)]
#[diesel(table_name = team_roles)]
pub struct UpdateTeamRole {
    pub id: Uuid,
    pub name: Option<String>,
    pub can_read: Option<bool>,
    pub can_write: Option<bool>,
    pub can_manage_privacy: Option<bool>,
    pub can_manage_clones: Option<bool>,
    pub can_invite_users: Option<bool>,
    pub can_remove_users: Option<bool>,
    pub can_manage_permissions: Option<bool>,
}

#[derive(Validate)]
pub struct UpdateTeamRoleRequest {
    pub id: String,
    #[validate(length(min = 2, message = "Team role name is required"))]
    pub name: Option<String>,
    pub can_read: Option<bool>,
    pub can_write: Option<bool>,
    pub can_manage_privacy: Option<bool>,
    pub can_manage_clones: Option<bool>,
    pub can_invite_users: Option<bool>,
    pub can_remove_users: Option<bool>,
    pub can_manage_permissions: Option<bool>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Serialize, Deserialize)]
#[diesel(table_name = team_members)]
pub struct TeamMember {
    pub id: Uuid,
    pub team_id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,
    pub joined_at: NaiveDateTime,
}

#[derive(Queryable, Serialize, Deserialize, Debug)]
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

#[derive(Deserialize)]
pub struct UpdateMemberRoleRequest {
    pub user_id: Uuid,
    pub role_id: Uuid,
}

#[derive(Insertable, Deserialize)]
#[diesel(table_name = team_members)]
pub struct NewTeamMember {
    pub team_id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,
}

pub async fn create_team(conn: &mut AsyncPgConnection, data: &NewTeam) -> Result<Team, ApiError> {
    match diesel::insert_into(teams::table)
        .values(data)
        .get_result(conn)
        .await
    {
        Ok(team) => Ok(team),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn find_team_by_id(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
) -> Result<Team, ApiError> {
    match teams::table
        .filter(teams::id.eq(team_id_param))
        .get_result(conn)
        .await
    {
        Ok(team) => Ok(team),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn update_team_data(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
    data: &UpdateTeam,
) -> Result<Team, ApiError> {
    match diesel::update(teams::table)
        .filter(teams::id.eq(team_id_param))
        .set(data)
        .get_result(conn)
        .await
    {
        Ok(team) => Ok(team),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn delete_team(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
) -> Result<(), ApiError> {
    match diesel::delete(teams::table)
        .filter(teams::id.eq(team_id_param))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

fn default_grant_keys(role: &NewTeamRole) -> Vec<&'static str> {
    let mut keys = Vec::new();
    if role.can_read {
        keys.extend(["notebook.view", "chat.view"]);
    }
    if role.can_write {
        keys.extend([
            "notebook.edit",
            "notebook.blocks.execute",
            "chat.messages.send",
        ]);
    }
    if role.can_manage_privacy {
        keys.push("notebook.manage_privacy");
    }
    if role.can_manage_clones {
        keys.push("notebook.manage_clones");
    }
    if role.can_invite_users {
        keys.push("team.invite_users");
    }
    if role.can_remove_users {
        keys.push("team.remove_users");
    }
    if role.can_manage_permissions {
        keys.extend([
            "team.roles.edit_role_permissions",
            "team.roles.create_role",
            "team.roles.edit_role_name",
        ]);
    }
    if role.can_manage_team {
        keys.push("team.manage");
    }
    keys
}

pub async fn create_team_role(
    conn: &mut AsyncPgConnection,
    data: &NewTeamRole,
) -> Result<TeamRole, ApiError> {
    let role: TeamRole = diesel::insert_into(team_roles::table)
        .values(data)
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    crate::models::permission_grant::seed_team_role_grants(
        conn,
        role.id,
        role.team_id,
        &default_grant_keys(data),
    )
    .await?;

    Ok(role)
}

pub async fn find_roles_by_team(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
) -> Result<Vec<TeamRole>, ApiError> {
    match team_roles::table
        .filter(team_roles::team_id.eq(team_id_param))
        .load::<TeamRole>(conn)
        .await
    {
        Ok(roles) => Ok(roles),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn update_team_role(
    conn: &mut AsyncPgConnection,
    role_id_param: Uuid,
    data: &UpdateTeamRole,
) -> Result<TeamRole, ApiError> {
    match diesel::update(team_roles::table)
        .filter(team_roles::id.eq(role_id_param))
        .set(data)
        .get_result(conn)
        .await
    {
        Ok(role) => Ok(role),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn add_user_to_team(
    conn: &mut AsyncPgConnection,
    data: &NewTeamMember,
) -> Result<TeamMember, ApiError> {
    match diesel::insert_into(team_members::table)
        .values(data)
        .get_result(conn)
        .await
    {
        Ok(member) => Ok(member),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn remove_user_from_team(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
    user_id_param: Uuid,
) -> Result<(), ApiError> {
    match diesel::delete(team_members::table)
        .filter(team_members::team_id.eq(team_id_param))
        .filter(team_members::user_id.eq(user_id_param))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn update_member_role(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
    user_id_param: Uuid,
    role_id_param: Uuid,
) -> Result<(), ApiError> {
    diesel::update(team_members::table)
        .filter(team_members::team_id.eq(team_id_param))
        .filter(team_members::user_id.eq(user_id_param))
        .set(team_members::role_id.eq(role_id_param))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn find_team_member_with_role(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
    user_id_param: Uuid,
) -> Result<(TeamMember, TeamRole), ApiError> {
    match team_members::table
        .inner_join(team_roles::table)
        .filter(
            team_members::team_id
                .eq(team_id_param)
                .and(team_members::user_id.eq(user_id_param)),
        )
        .select((team_members::all_columns, team_roles::all_columns))
        .get_result::<(TeamMember, TeamRole)>(conn)
        .await
    {
        Ok(results) => Ok(results),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn find_team_members_with_roles(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
) -> Result<Vec<(TeamMemberResponse, TeamRole)>, ApiError> {
    use crate::schema::users;

    match team_members::table
        .inner_join(team_roles::table)
        .inner_join(users::table.on(team_members::user_id.eq(users::id)))
        .filter(team_members::team_id.eq(team_id_param))
        .select((
            (
                team_members::id,
                team_members::team_id,
                team_members::user_id,
                team_members::role_id,
                users::name,
                users::email,
                users::avatar_url,
                team_members::joined_at,
            ),
            team_roles::all_columns,
        ))
        .load::<(TeamMemberResponse, TeamRole)>(conn)
        .await
    {
        Ok(results) => Ok(results),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn find_user_teams(
    conn: &mut AsyncPgConnection,
    user_id_param: Uuid,
) -> Result<Vec<(Team, TeamRole)>, ApiError> {
    match team_members::table
        .inner_join(team_roles::table)
        .inner_join(teams::table)
        .filter(team_members::user_id.eq(user_id_param))
        .select((teams::all_columns, team_roles::all_columns))
        .load::<(Team, TeamRole)>(conn)
        .await
    {
        Ok(results) => Ok(results),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}
