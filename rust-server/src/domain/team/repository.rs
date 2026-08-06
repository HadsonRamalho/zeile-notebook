use std::collections::HashMap;

use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::domain::grants::{grant_keys_by_role, replace_team_role_grants};
use crate::models::error::ApiError;
use crate::schema::{team_members, team_roles, teams};

use crate::schema::team_invitations;

use super::dto::{RolePermissions, TeamMemberResponse, TeamRoleView, UpdateTeamRole};
use super::entity::{
    NewTeam, NewTeamInvitation, NewTeamMember, NewTeamRole, Team, TeamInvitation, TeamMember,
    TeamRole,
};

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
    data: &super::entity::UpdateTeam,
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

pub async fn create_invitation(
    conn: &mut AsyncPgConnection,
    data: &NewTeamInvitation,
) -> Result<TeamInvitation, String> {
    match diesel::insert_into(team_invitations::table)
        .values(data)
        .get_result(conn)
        .await
    {
        Ok(inv) => Ok(inv),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn find_invitation_by_token(
    conn: &mut AsyncPgConnection,
    token_param: &str,
) -> Result<TeamInvitation, String> {
    match team_invitations::table
        .filter(team_invitations::token.eq(token_param))
        .select(TeamInvitation::as_select())
        .first(conn)
        .await
    {
        Ok(inv) => Ok(inv),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn delete_invitation(conn: &mut AsyncPgConnection, id_param: Uuid) -> Result<(), String> {
    match diesel::delete(team_invitations::table.filter(team_invitations::id.eq(id_param)))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
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

    /// Real team and role: foreign keys reject a loose UUID.
    async fn team_with_role(conn: &mut AsyncPgConnection) -> (Uuid, Uuid) {
        let team_id = Uuid::new_v4();
        let role_id = Uuid::new_v4();

        diesel::sql_query(format!(
            "INSERT INTO teams (id, name) VALUES ('{team_id}', 'Test team')"
        ))
        .execute(conn)
        .await
        .expect("create team");

        diesel::sql_query(format!(
            "INSERT INTO team_roles (id, team_id, name) VALUES ('{role_id}', '{team_id}', 'Member')"
        ))
        .execute(conn)
        .await
        .expect("create role");

        (team_id, role_id)
    }

    async fn invitation(conn: &mut AsyncPgConnection, email: &str, days: i64) -> TeamInvitation {
        let (team_id, role_id) = team_with_role(conn).await;

        let data = NewTeamInvitation {
            team_id,
            role_id,
            email: email.to_string(),
            token: Uuid::new_v4().to_string(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(days)).naive_utc(),
        };

        create_invitation(conn, &data)
            .await
            .expect("create invitation")
    }

    #[tokio::test]
    async fn finding_does_not_consume_the_invitation() {
        let Some(mut conn) = connection().await else {
            eprintln!("TEST_MIGRATION_DATABASE_URL missing; test skipped");
            return;
        };

        let created = invitation(&mut conn, "invited@example.test", 7).await;

        let first = find_invitation_by_token(&mut conn, &created.token)
            .await
            .expect("first lookup");
        let second = find_invitation_by_token(&mut conn, &created.token)
            .await
            .expect("the invitation must survive a lookup");

        assert_eq!(first.id, second.id);
        assert_eq!(second.email, "invited@example.test");
    }

    #[tokio::test]
    async fn deleting_consumes_the_invitation() {
        let Some(mut conn) = connection().await else {
            return;
        };

        let created = invitation(&mut conn, "invited@example.test", 7).await;

        delete_invitation(&mut conn, created.id)
            .await
            .expect("delete");

        assert!(
            find_invitation_by_token(&mut conn, &created.token)
                .await
                .is_err(),
            "a consumed invitation cannot be reused"
        );
    }

    #[tokio::test]
    async fn unknown_token_finds_no_invitation() {
        let Some(mut conn) = connection().await else {
            return;
        };

        assert!(
            find_invitation_by_token(&mut conn, &Uuid::new_v4().to_string())
                .await
                .is_err()
        );
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
