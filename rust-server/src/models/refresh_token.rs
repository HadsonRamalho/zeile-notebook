//! Persisted refresh tokens. The token itself is never stored: we keep its
//! SHA-256, so a database dump doesn't become a pile of live sessions.

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use rand::RngCore;
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::refresh_tokens;
use crate::schema::refresh_tokens::dsl;

pub const VALIDITY_DAYS: i64 = 30;

const TOKEN_BYTES: usize = 32;

#[derive(Debug, Queryable, Selectable, Identifiable)]
#[diesel(table_name = refresh_tokens)]
pub struct RefreshToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub replaced_by: Option<Uuid>,
}

#[derive(Insertable)]
#[diesel(table_name = refresh_tokens)]
struct NewRefreshToken {
    id: Uuid,
    user_id: Uuid,
    token_hash: String,
    expires_at: DateTime<Utc>,
}

impl RefreshToken {
    pub fn usable(&self, now: DateTime<Utc>) -> bool {
        self.revoked_at.is_none() && self.expires_at > now
    }
}

/// Opaque 32-byte secret. It's not a JWT on purpose: whoever validates it
/// must query the database, which is where revocation lives.
pub fn generate_token() -> String {
    let mut bytes = [0u8; TOKEN_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn token_hash(token: &str) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub async fn issue(
    conn: &mut AsyncPgConnection,
    user: Uuid,
) -> Result<(Uuid, String), ApiError> {
    let token = generate_token();
    let id = Uuid::new_v4();

    let new_token = NewRefreshToken {
        id,
        user_id: user,
        token_hash: token_hash(&token),
        expires_at: Utc::now() + Duration::days(VALIDITY_DAYS),
    };

    diesel::insert_into(refresh_tokens::table)
        .values(&new_token)
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok((id, token))
}

pub async fn find_by_token(
    conn: &mut AsyncPgConnection,
    token: &str,
) -> Result<RefreshToken, ApiError> {
    dsl::refresh_tokens
        .filter(dsl::token_hash.eq(token_hash(token)))
        .select(RefreshToken::as_select())
        .first(conn)
        .await
        .map_err(|_| ApiError::InvalidAuthorizationToken)
}

pub async fn revoke(conn: &mut AsyncPgConnection, token_id: Uuid) -> Result<(), ApiError> {
    diesel::update(dsl::refresh_tokens.filter(dsl::id.eq(token_id)))
        .set(dsl::revoked_at.eq(Utc::now()))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok(())
}

/// Rotation: the used token is revoked and points to the one that replaced
/// it, so reuse of an already-rotated token is detectable.
pub async fn rotate(
    conn: &mut AsyncPgConnection,
    previous: &RefreshToken,
) -> Result<(Uuid, String), ApiError> {
    let (new_id, token) = issue(conn, previous.user_id).await?;

    diesel::update(dsl::refresh_tokens.filter(dsl::id.eq(previous.id)))
        .set((
            dsl::revoked_at.eq(Utc::now()),
            dsl::replaced_by.eq(Some(new_id)),
        ))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok((new_id, token))
}

pub async fn revoke_for_user(
    conn: &mut AsyncPgConnection,
    user: Uuid,
) -> Result<usize, ApiError> {
    diesel::update(
        dsl::refresh_tokens
            .filter(dsl::user_id.eq(user))
            .filter(dsl::revoked_at.is_null()),
    )
    .set(dsl::revoked_at.eq(Utc::now()))
    .execute(conn)
    .await
    .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn delete_expired(conn: &mut AsyncPgConnection) -> Result<usize, ApiError> {
    diesel::delete(dsl::refresh_tokens.filter(dsl::expires_at.lt(Utc::now())))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_has_32_bytes_of_entropy_in_hex() {
        let token = generate_token();

        assert_eq!(token.len(), TOKEN_BYTES * 2);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn two_tokens_never_come_out_equal() {
        let a = generate_token();
        let b = generate_token();

        assert_ne!(a, b);
    }

    #[test]
    fn hash_is_stable_and_does_not_return_the_token() {
        let token = generate_token();
        let hash = token_hash(&token);

        assert_eq!(hash, token_hash(&token), "hash must be deterministic");
        assert_ne!(hash, token, "the database cannot store the plain secret");
        assert_eq!(hash.len(), 64);
        assert!(!hash.contains(&token[..8]));
    }

    fn test_token(revoked_at: Option<DateTime<Utc>>, expires_in: Duration) -> RefreshToken {
        RefreshToken {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            token_hash: "hash".to_string(),
            expires_at: Utc::now() + expires_in,
            created_at: Utc::now(),
            revoked_at,
            replaced_by: None,
        }
    }

    #[test]
    fn valid_token_is_usable() {
        let token = test_token(None, Duration::days(1));

        assert!(token.usable(Utc::now()));
    }

    #[test]
    fn revoked_token_is_not_usable() {
        let token = test_token(Some(Utc::now()), Duration::days(1));

        assert!(!token.usable(Utc::now()));
    }

    #[test]
    fn expired_token_is_not_usable() {
        let token = test_token(None, Duration::days(-1));

        assert!(!token.usable(Utc::now()));
    }
}

/// Exercises rotation and reuse detection against a real Postgres. Without
/// TEST_MIGRATION_DATABASE_URL the test is skipped, like the others that need a database.
#[cfg(test)]
mod tests_with_database {
    use super::*;
    use diesel_async::AsyncConnection;

    async fn connection() -> Option<AsyncPgConnection> {
        let url = std::env::var("TEST_MIGRATION_DATABASE_URL").ok()?;

        AsyncPgConnection::establish(&url).await.ok()
    }

    async fn test_user(conn: &mut AsyncPgConnection) -> Uuid {
        let id = Uuid::new_v4();

        diesel::sql_query(format!(
            "INSERT INTO users (id, public_id, name, email, primary_provider, role, is_active) \
             VALUES ('{id}', {}, 'Test', 'test_{id}@example.test', 'email', 'user', true)",
            rand::random::<u16>() as i32 + 1_000_000
        ))
        .execute(conn)
        .await
        .expect("insert test user");

        id
    }

    #[tokio::test]
    async fn issue_finds_the_token_by_its_secret() {
        let Some(mut conn) = connection().await else {
            eprintln!("TEST_MIGRATION_DATABASE_URL missing; test skipped");
            return;
        };

        let user = test_user(&mut conn).await;
        let (id, token) = issue(&mut conn, user).await.expect("issue");

        let found = find_by_token(&mut conn, &token).await.expect("find");

        assert_eq!(found.id, id);
        assert_eq!(found.user_id, user);
        assert!(found.usable(Utc::now()));
        assert_ne!(
            found.token_hash, token,
            "the database stored the plain secret"
        );
    }

    #[tokio::test]
    async fn rotate_revokes_the_previous_token_and_points_to_the_replacement() {
        let Some(mut conn) = connection().await else {
            return;
        };

        let user = test_user(&mut conn).await;
        let (old_id, old) = issue(&mut conn, user).await.expect("issue");
        let current = find_by_token(&mut conn, &old).await.expect("find");

        let (new_id, new_token) = rotate(&mut conn, &current).await.expect("rotate");

        let spent = find_by_token(&mut conn, &old).await.expect("find");

        assert!(!spent.usable(Utc::now()), "the previous token should be spent");
        assert_eq!(spent.replaced_by, Some(new_id));
        assert_ne!(old_id, new_id);

        let current = find_by_token(&mut conn, &new_token).await.expect("find");
        assert!(current.usable(Utc::now()));
    }

    #[tokio::test]
    async fn revoke_for_user_drops_all_sessions() {
        let Some(mut conn) = connection().await else {
            return;
        };

        let user = test_user(&mut conn).await;
        let (_, a) = issue(&mut conn, user).await.expect("issue a");
        let (_, b) = issue(&mut conn, user).await.expect("issue b");

        let other = test_user(&mut conn).await;
        let (_, unrelated) = issue(&mut conn, other).await.expect("issue unrelated");

        let count = revoke_for_user(&mut conn, user).await.expect("revoke");

        assert_eq!(count, 2);
        assert!(!find_by_token(&mut conn, &a).await.unwrap().usable(Utc::now()));
        assert!(!find_by_token(&mut conn, &b).await.unwrap().usable(Utc::now()));
        assert!(
            find_by_token(&mut conn, &unrelated)
                .await
                .unwrap()
                .usable(Utc::now()),
            "revoking one user cannot drop another user's session"
        );
    }

    #[tokio::test]
    async fn unknown_token_is_not_found() {
        let Some(mut conn) = connection().await else {
            return;
        };

        assert!(find_by_token(&mut conn, &generate_token()).await.is_err());
    }
}
