use crate::schema::team_invitations;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct InviteRequest {
    pub email: String,
    #[serde(rename = "roleId")]
    pub role_id: Uuid,
}

#[derive(Deserialize)]
pub struct AcceptInviteRequest {
    pub token: String,
}

#[derive(Queryable, Selectable, Insertable, Serialize, Deserialize, Debug)]
#[diesel(table_name = team_invitations)]
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
#[diesel(table_name = team_invitations)]
pub struct NewTeamInvitation {
    pub team_id: Uuid,
    pub role_id: Uuid,
    pub email: String,
    pub token: String,
    pub expires_at: NaiveDateTime,
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

pub async fn delete_invitation(
    conn: &mut AsyncPgConnection,
    id_param: Uuid,
) -> Result<(), String> {
    match diesel::delete(team_invitations::table.filter(team_invitations::id.eq(id_param)))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The invite is addressed to an email. Without this comparison, any
/// authenticated account that gets hold of the link would join the team with
/// the granted role — and the link travels through forwarded email, push,
/// and browser history.
pub fn email_matches(invited: &str, user: &str) -> bool {
    invited.trim().eq_ignore_ascii_case(user.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_email_matches() {
        assert!(email_matches("person@example.test", "person@example.test"));
    }

    #[test]
    fn case_and_whitespace_do_not_prevent_a_match() {
        assert!(email_matches("Person@Example.Test", "person@example.test"));
        assert!(email_matches("  person@example.test  ", "person@example.test"));
        assert!(email_matches("person@example.test", " PERSON@example.TEST "));
    }

    #[test]
    fn a_different_email_does_not_match() {
        assert!(!email_matches("invited@example.test", "intruder@example.test"));
    }

    #[test]
    fn a_prefix_does_not_count_as_a_match() {
        assert!(!email_matches("person@example.test", "person@example.test.br"));
        assert!(!email_matches("person@example.test", "person"));
        assert!(!email_matches("", "person@example.test"));
    }
}

/// Accept flow against a real Postgres. Without TEST_MIGRATION_DATABASE_URL
/// the test is skipped, like the others that need a database.
#[cfg(test)]
mod tests_with_database {
    use super::*;
    use diesel_async::AsyncConnection;

    async fn connection() -> Option<AsyncPgConnection> {
        let url = std::env::var("TEST_MIGRATION_DATABASE_URL").ok()?;
        AsyncPgConnection::establish(&url).await.ok()
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
}
