use std::collections::{HashMap, HashSet};

use crate::models::error::ApiError;
use crate::models::permission_grant::{grant_keys_by_role, replace_team_role_grants};
use crate::schema::{team_members, team_roles, teams};
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Queryable, Selectable, Identifiable, Debug, Serialize, Deserialize, utoipa::ToSchema)]
#[diesel(table_name = teams)]
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
#[diesel(table_name = teams)]
#[serde(rename_all = "camelCase")]
pub struct NewTeam {
    #[validate(length(min = 2, message = "Team name is required"))]
    pub name: String,
    pub description: Option<String>,
    #[serde(alias = "image_url")]
    pub image_url: Option<String>,
}

#[derive(AsChangeset, Deserialize, Validate, utoipa::ToSchema)]
#[diesel(table_name = teams)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTeam {
    #[validate(length(min = 2, message = "Team name is required"))]
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(alias = "image_url")]
    pub image_url: Option<String>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = team_roles)]
pub struct TeamRole {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub created_at: NaiveDateTime,
}

// os oito bools do contrato publico; a fonte de verdade e permission_grants
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

impl RolePermissions {
    pub fn all() -> Self {
        Self {
            can_read: true,
            can_write: true,
            can_manage_privacy: true,
            can_manage_clones: true,
            can_invite_users: true,
            can_remove_users: true,
            can_manage_permissions: true,
            can_manage_team: true,
        }
    }

    pub fn view_only() -> Self {
        Self {
            can_read: true,
            ..Self::default()
        }
    }

    pub fn grant_keys(&self) -> Vec<&'static str> {
        let mut keys = Vec::new();
        if self.can_read {
            keys.extend(["notebook.view", "chat.view"]);
        }
        if self.can_write {
            keys.extend([
                "notebook.edit",
                "notebook.blocks.execute",
                "chat.messages.send",
            ]);
        }
        if self.can_manage_privacy {
            keys.push("notebook.manage_privacy");
        }
        if self.can_manage_clones {
            keys.push("notebook.manage_clones");
        }
        if self.can_invite_users {
            keys.push("team.invite_users");
        }
        if self.can_remove_users {
            keys.push("team.remove_users");
        }
        if self.can_manage_permissions {
            keys.extend([
                "team.roles.edit_role_permissions",
                "team.roles.create_role",
                "team.roles.edit_role_name",
            ]);
        }
        if self.can_manage_team {
            keys.push("team.manage");
            keys.push("chat.messages.delete_any");
        }
        keys
    }

    // inverso de grant_keys: le a chave representativa de cada bool
    pub fn from_grant_keys(keys: &HashSet<String>) -> Self {
        let has = |key: &str| keys.contains(key);
        Self {
            can_read: has("notebook.view"),
            can_write: has("notebook.edit"),
            can_manage_privacy: has("notebook.manage_privacy"),
            can_manage_clones: has("notebook.manage_clones"),
            can_invite_users: has("team.invite_users"),
            can_remove_users: has("team.remove_users"),
            can_manage_permissions: has("team.roles.edit_role_permissions"),
            can_manage_team: has("team.manage"),
        }
    }
}

// mantem o formato plano que o frontend consome (`TeamRole` em lib/types/team-types.ts)
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

    // roles sinteticos: dono do notebook, notebook publico, sem acesso
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

#[derive(Insertable, Deserialize)]
#[diesel(table_name = team_roles)]
#[serde(rename_all = "camelCase")]
pub struct NewTeamRole {
    pub team_id: Uuid,
    pub name: String,
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

impl UpdateTeamRole {
    // aplica so os campos enviados sobre as permissoes vigentes
    pub fn apply(&self, current: RolePermissions) -> RolePermissions {
        RolePermissions {
            can_read: self.can_read.unwrap_or(current.can_read),
            can_write: self.can_write.unwrap_or(current.can_write),
            can_manage_privacy: self
                .can_manage_privacy
                .unwrap_or(current.can_manage_privacy),
            can_manage_clones: self.can_manage_clones.unwrap_or(current.can_manage_clones),
            can_invite_users: self.can_invite_users.unwrap_or(current.can_invite_users),
            can_remove_users: self.can_remove_users.unwrap_or(current.can_remove_users),
            can_manage_permissions: self
                .can_manage_permissions
                .unwrap_or(current.can_manage_permissions),
            can_manage_team: self.can_manage_team.unwrap_or(current.can_manage_team),
        }
    }
}

#[derive(Queryable, Selectable, Identifiable, Debug, Serialize, Deserialize)]
#[diesel(table_name = team_members)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub id: Uuid,
    pub team_id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,
    pub joined_at: NaiveDateTime,
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

#[derive(Insertable, Deserialize)]
#[diesel(table_name = team_members)]
#[serde(rename_all = "camelCase")]
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
        Err(e) => Err(ApiError::from(e)),
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
        Err(e) => Err(ApiError::from(e)),
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
        Err(e) => Err(ApiError::from(e)),
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
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn create_team_role(
    conn: &mut AsyncPgConnection,
    data: &NewTeamRole,
    permissions: RolePermissions,
) -> Result<TeamRole, ApiError> {
    let role: TeamRole = diesel::insert_into(team_roles::table)
        .values(data)
        .get_result(conn)
        .await
        .map_err(ApiError::from)?;

    replace_team_role_grants(conn, role.id, role.team_id, &permissions.grant_keys()).await?;

    Ok(role)
}

// resolve os bools de cada role a partir dos grants, numa consulta so
pub async fn load_role_permissions(
    conn: &mut AsyncPgConnection,
    role_ids: &[Uuid],
) -> Result<HashMap<Uuid, RolePermissions>, ApiError> {
    let keys_by_role = grant_keys_by_role(conn, role_ids).await?;

    Ok(role_ids
        .iter()
        .map(|role_id| {
            let permissions = match keys_by_role.get(role_id) {
                Some(keys) => RolePermissions::from_grant_keys(keys),
                None => RolePermissions::default(),
            };
            (*role_id, permissions)
        })
        .collect())
}

pub async fn build_role_views(
    conn: &mut AsyncPgConnection,
    roles: &[TeamRole],
) -> Result<Vec<TeamRoleView>, ApiError> {
    let role_ids: Vec<Uuid> = roles.iter().map(|role| role.id).collect();
    let permissions = load_role_permissions(conn, &role_ids).await?;

    Ok(roles
        .iter()
        .map(|role| TeamRoleView::new(role, permissions.get(&role.id).copied().unwrap_or_default()))
        .collect())
}

pub async fn build_role_view(
    conn: &mut AsyncPgConnection,
    role: &TeamRole,
) -> Result<TeamRoleView, ApiError> {
    let permissions = load_role_permissions(conn, &[role.id]).await?;
    Ok(TeamRoleView::new(
        role,
        permissions.get(&role.id).copied().unwrap_or_default(),
    ))
}

pub async fn find_roles_by_team(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
) -> Result<Vec<TeamRoleView>, ApiError> {
    let roles = team_roles::table
        .filter(team_roles::team_id.eq(team_id_param))
        .load::<TeamRole>(conn)
        .await
        .map_err(ApiError::from)?;

    build_role_views(conn, &roles).await
}

pub async fn update_team_role(
    conn: &mut AsyncPgConnection,
    role_id_param: Uuid,
    data: &UpdateTeamRole,
) -> Result<TeamRoleView, ApiError> {
    let role: TeamRole = match &data.name {
        Some(new_name) => diesel::update(team_roles::table)
            .filter(team_roles::id.eq(role_id_param))
            .set(team_roles::name.eq(new_name))
            .get_result(conn)
            .await
            .map_err(ApiError::from)?,
        None => team_roles::table
            .filter(team_roles::id.eq(role_id_param))
            .get_result(conn)
            .await
            .map_err(ApiError::from)?,
    };

    let current = load_role_permissions(conn, &[role.id])
        .await?
        .get(&role.id)
        .copied()
        .unwrap_or_default();
    let updated = data.apply(current);

    if updated != current {
        replace_team_role_grants(conn, role.id, role.team_id, &updated.grant_keys()).await?;
    }

    Ok(TeamRoleView::new(&role, updated))
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
        Err(e) => Err(ApiError::from(e)),
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
        Err(e) => Err(ApiError::from(e)),
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
        .map_err(ApiError::from)
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
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn find_team_members_with_roles(
    conn: &mut AsyncPgConnection,
    team_id_param: Uuid,
) -> Result<Vec<(TeamMemberResponse, TeamRoleView)>, ApiError> {
    let rows = find_team_members_with_role_rows(conn, team_id_param).await?;
    let roles: Vec<TeamRole> = rows.iter().map(|(_, role)| role.clone()).collect();
    let views = build_role_views(conn, &roles).await?;

    Ok(rows
        .into_iter()
        .map(|(member, _)| member)
        .zip(views)
        .collect())
}

pub async fn find_team_members_with_role_rows(
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
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn find_user_teams(
    conn: &mut AsyncPgConnection,
    user_id_param: Uuid,
) -> Result<Vec<(Team, TeamRoleView)>, ApiError> {
    let rows = team_members::table
        .inner_join(team_roles::table)
        .inner_join(teams::table)
        .filter(team_members::user_id.eq(user_id_param))
        .select((teams::all_columns, team_roles::all_columns))
        .load::<(Team, TeamRole)>(conn)
        .await
        .map_err(ApiError::from)?;

    let roles: Vec<TeamRole> = rows.iter().map(|(_, role)| role.clone()).collect();
    let views = build_role_views(conn, &roles).await?;

    Ok(rows.into_iter().map(|(team, _)| team).zip(views).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys_of(permissions: RolePermissions) -> HashSet<String> {
        permissions
            .grant_keys()
            .into_iter()
            .map(|key| key.to_string())
            .collect()
    }

    #[test]
    fn the_bools_survive_a_round_trip_through_the_grants() {
        let cases = [
            RolePermissions::default(),
            RolePermissions::view_only(),
            RolePermissions::all(),
            RolePermissions {
                can_read: true,
                can_write: true,
                can_remove_users: true,
                ..RolePermissions::default()
            },
        ];

        for case in cases {
            assert_eq!(RolePermissions::from_grant_keys(&keys_of(case)), case);
        }
    }

    #[test]
    fn the_role_json_keeps_the_eight_bools_at_the_top_level() {
        let role = TeamRoleView::synthetic("Owner", RolePermissions::view_only());
        let json = serde_json::to_value(&role).expect("serialize");

        assert_eq!(json["name"], "Owner");
        assert_eq!(json["canRead"], true);
        for key in [
            "canWrite",
            "canManagePrivacy",
            "canManageClones",
            "canInviteUsers",
            "canRemoveUsers",
            "canManagePermissions",
            "canManageTeam",
        ] {
            assert_eq!(json[key], false, "{key} should come back as false");
        }
    }

    #[test]
    fn role_permissions_accept_the_legacy_snake_case_alias() {
        let camel: RolePermissions = serde_json::from_str(
            r#"{"canRead":true,"canWrite":false,"canManagePrivacy":false,"canManageClones":false,"canInviteUsers":false,"canRemoveUsers":false,"canManagePermissions":false,"canManageTeam":false}"#,
        )
        .unwrap();
        let snake: RolePermissions = serde_json::from_str(
            r#"{"can_read":true,"can_write":false,"can_manage_privacy":false,"can_manage_clones":false,"can_invite_users":false,"can_remove_users":false,"can_manage_permissions":false,"can_manage_team":false}"#,
        )
        .unwrap();

        assert_eq!(camel, snake);
    }

    #[test]
    fn a_partial_edit_preserves_what_was_not_sent() {
        let current = RolePermissions::all();
        let payload = UpdateTeamRole {
            id: Uuid::new_v4(),
            name: None,
            can_read: None,
            can_write: Some(false),
            can_manage_privacy: None,
            can_manage_clones: None,
            can_invite_users: None,
            can_remove_users: None,
            can_manage_permissions: None,
            can_manage_team: None,
        };

        let result = payload.apply(current);

        assert!(!result.can_write);
        assert!(result.can_read);
        assert!(result.can_manage_team);
    }
}

#[cfg(test)]
mod tests_with_database {
    use super::*;
    use diesel_async::AsyncConnection;

    async fn connection() -> Option<AsyncPgConnection> {
        let url = std::env::var("TEST_MIGRATION_DATABASE_URL").ok()?;
        crate::db_migrations::ensure_test_database_migrated(&url);
        AsyncPgConnection::establish(&url).await.ok()
    }

    async fn team(conn: &mut AsyncPgConnection) -> Uuid {
        let team_id = Uuid::new_v4();
        diesel::sql_query(format!(
            "INSERT INTO teams (id, name) VALUES ('{team_id}', 'Test team')"
        ))
        .execute(conn)
        .await
        .expect("create team");
        team_id
    }

    async fn cleanup(conn: &mut AsyncPgConnection, team_id: Uuid) {
        diesel::sql_query(format!("DELETE FROM teams WHERE id = '{team_id}'"))
            .execute(conn)
            .await
            .expect("remove team");
    }

    #[tokio::test]
    async fn the_created_role_reads_back_the_bools_it_requested() {
        let Some(mut conn) = connection().await else {
            eprintln!("TEST_MIGRATION_DATABASE_URL missing; test skipped");
            return;
        };

        let team_id = team(&mut conn).await;
        let requested = RolePermissions {
            can_read: true,
            can_write: true,
            can_remove_users: true,
            ..RolePermissions::default()
        };

        create_team_role(
            &mut conn,
            &NewTeamRole {
                team_id,
                name: "Editor".to_string(),
            },
            requested,
        )
        .await
        .expect("create role");

        let roles = find_roles_by_team(&mut conn, team_id)
            .await
            .expect("list roles");

        assert_eq!(roles.len(), 1);
        assert_eq!(roles[0].permissions, requested);

        cleanup(&mut conn, team_id).await;
    }

    #[tokio::test]
    async fn editing_the_role_moves_the_grants_and_not_just_the_response() {
        let Some(mut conn) = connection().await else {
            return;
        };

        let team_id = team(&mut conn).await;
        let role = create_team_role(
            &mut conn,
            &NewTeamRole {
                team_id,
                name: "Reader".to_string(),
            },
            RolePermissions::view_only(),
        )
        .await
        .expect("create role");

        let updated = update_team_role(
            &mut conn,
            role.id,
            &UpdateTeamRole {
                id: role.id,
                name: None,
                can_read: None,
                can_write: Some(true),
                can_manage_privacy: None,
                can_manage_clones: None,
                can_invite_users: None,
                can_remove_users: None,
                can_manage_permissions: None,
                can_manage_team: None,
            },
        )
        .await
        .expect("edit role");

        assert!(updated.permissions.can_write);

        let keys = grant_keys_by_role(&mut conn, &[role.id])
            .await
            .expect("read grants");
        let keys = keys.get(&role.id).expect("role grants");

        assert!(keys.contains("notebook.edit"));
        assert!(keys.contains("notebook.view"));

        cleanup(&mut conn, team_id).await;
    }
}
