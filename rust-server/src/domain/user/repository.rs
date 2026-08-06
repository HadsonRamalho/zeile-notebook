use crate::models::error::ApiError;
use crate::schema::users::dsl::*;
use chrono::{DateTime, Duration, Utc};
use diesel::{ExpressionMethods, QueryDsl, SelectableHelper, prelude::Insertable};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use rand::RngCore;
use uuid::Uuid;

use super::dto::UpdateUser;
use super::entity::{AuthProvider, NewUser, RefreshToken, User};

pub async fn register_user(conn: &mut AsyncPgConnection, user: &NewUser) -> Result<User, String> {
    match diesel::insert_into(users)
        .values(user)
        .get_result(conn)
        .await
    {
        Ok(user) => Ok(user),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn find_user_by_email(
    conn: &mut AsyncPgConnection,
    param: &str,
) -> Result<User, ApiError> {
    match users.filter(email.eq(param)).get_result(conn).await {
        Ok(user) => Ok(user),
        Err(diesel::result::Error::NotFound) => Err(ApiError::UserNotFound),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn find_user_by_id(conn: &mut AsyncPgConnection, param: &Uuid) -> Result<User, ApiError> {
    match users.filter(id.eq(param)).get_result(conn).await {
        Ok(user) => Ok(user),
        Err(diesel::result::Error::NotFound) => Err(ApiError::UserNotFound),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn find_user_by_public_id(
    conn: &mut AsyncPgConnection,
    param: i32,
) -> Result<User, String> {
    match users.filter(public_id.eq(param)).get_result(conn).await {
        Ok(user) => Ok(user),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn update_user_data(
    conn: &mut AsyncPgConnection,
    id_param: &Uuid,
    data: &UpdateUser,
) -> Result<(), ApiError> {
    match diesel::update(users)
        .filter(id.eq(id_param))
        .set((name.eq(&data.name), email.eq(&data.email)))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn find_user_by_provider_id(
    conn: &mut AsyncPgConnection,
    provider: AuthProvider,
    external_id: &str,
) -> Result<User, ApiError> {
    let resultado = match provider {
        AuthProvider::Github => {
            users
                .filter(github_id.eq(external_id))
                .get_result(conn)
                .await
        }
        AuthProvider::Google => {
            users
                .filter(google_id.eq(external_id))
                .get_result(conn)
                .await
        }
        AuthProvider::Email => return Err(ApiError::UserNotFound),
    };

    match resultado {
        Ok(user) => Ok(user),
        Err(diesel::result::Error::NotFound) => Err(ApiError::UserNotFound),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn link_provider_account(
    conn: &mut AsyncPgConnection,
    id_param: &Uuid,
    provider: AuthProvider,
    external_id: &str,
    avatar: Option<String>,
) -> Result<(), ApiError> {
    let resultado = match provider {
        AuthProvider::Github => {
            diesel::update(users)
                .filter(id.eq(id_param))
                .set(github_id.eq(external_id))
                .execute(conn)
                .await
        }
        AuthProvider::Google => {
            diesel::update(users)
                .filter(id.eq(id_param))
                .set(google_id.eq(external_id))
                .execute(conn)
                .await
        }
        AuthProvider::Email => return Err(ApiError::InvalidData),
    };

    if let Err(e) = resultado {
        return Err(ApiError::from(e));
    }

    if let Some(avatar) = avatar {
        diesel::update(users)
            .filter(id.eq(id_param))
            .filter(avatar_url.is_null())
            .set(avatar_url.eq(avatar))
            .execute(conn)
            .await
            .ok();
    }

    Ok(())
}

pub async fn unlink_provider_account(
    conn: &mut AsyncPgConnection,
    id_param: &Uuid,
    provider: AuthProvider,
) -> Result<(), ApiError> {
    let vazio: Option<String> = None;

    let resultado = match provider {
        AuthProvider::Github => {
            diesel::update(users)
                .filter(id.eq(id_param))
                .set(github_id.eq(&vazio))
                .execute(conn)
                .await
        }
        AuthProvider::Google => {
            diesel::update(users)
                .filter(id.eq(id_param))
                .set(google_id.eq(&vazio))
                .execute(conn)
                .await
        }
        AuthProvider::Email => return Err(ApiError::InvalidData),
    };

    match resultado {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn update_user_password(
    conn: &mut AsyncPgConnection,
    id_param: &Uuid,
    new_password: String,
) -> Result<(), ApiError> {
    match diesel::update(users)
        .filter(id.eq(id_param))
        .set((
            password_hash.eq(new_password),
            password_changed_at.eq(chrono::Utc::now()),
        ))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn rehash_user_password(
    conn: &mut AsyncPgConnection,
    id_param: &Uuid,
    new_hash: String,
) -> Result<(), ApiError> {
    match diesel::update(users)
        .filter(id.eq(id_param))
        .set(password_hash.eq(new_hash))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub async fn delete_user(conn: &mut AsyncPgConnection, id_param: &Uuid) -> Result<(), ApiError> {
    match diesel::delete(users)
        .filter(id.eq(id_param))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::from(e)),
    }
}

pub const REFRESH_TOKEN_VALIDITY_DAYS: i64 = 30;

const TOKEN_BYTES: usize = 32;

#[derive(Insertable)]
#[diesel(table_name = crate::schema::refresh_tokens)]
struct NewRefreshToken {
    id: Uuid,
    user_id: Uuid,
    token_hash: String,
    expires_at: DateTime<Utc>,
}

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

pub async fn issue(conn: &mut AsyncPgConnection, user: Uuid) -> Result<(Uuid, String), ApiError> {
    let token = generate_token();
    let token_id = Uuid::new_v4();

    let new_token = NewRefreshToken {
        id: token_id,
        user_id: user,
        token_hash: token_hash(&token),
        expires_at: Utc::now() + Duration::days(REFRESH_TOKEN_VALIDITY_DAYS),
    };

    diesel::insert_into(crate::schema::refresh_tokens::table)
        .values(&new_token)
        .execute(conn)
        .await
        .map_err(ApiError::from)?;

    Ok((token_id, token))
}

pub async fn find_by_token(
    conn: &mut AsyncPgConnection,
    token: &str,
) -> Result<RefreshToken, ApiError> {
    use crate::schema::refresh_tokens::dsl as rt;

    rt::refresh_tokens
        .filter(rt::token_hash.eq(token_hash(token)))
        .select(RefreshToken::as_select())
        .first(conn)
        .await
        .map_err(|_| ApiError::InvalidAuthorizationToken)
}

pub async fn revoke(conn: &mut AsyncPgConnection, token_id: Uuid) -> Result<(), ApiError> {
    use crate::schema::refresh_tokens::dsl as rt;

    diesel::update(rt::refresh_tokens.filter(rt::id.eq(token_id)))
        .set(rt::revoked_at.eq(Utc::now()))
        .execute(conn)
        .await
        .map_err(ApiError::from)?;

    Ok(())
}

pub async fn rotate(
    conn: &mut AsyncPgConnection,
    previous: &RefreshToken,
) -> Result<(Uuid, String), ApiError> {
    use crate::schema::refresh_tokens::dsl as rt;

    let (new_id, token) = issue(conn, previous.user_id).await?;

    diesel::update(rt::refresh_tokens.filter(rt::id.eq(previous.id)))
        .set((
            rt::revoked_at.eq(Utc::now()),
            rt::replaced_by.eq(Some(new_id)),
        ))
        .execute(conn)
        .await
        .map_err(ApiError::from)?;

    Ok((new_id, token))
}

pub async fn revoke_for_user(conn: &mut AsyncPgConnection, user: Uuid) -> Result<usize, ApiError> {
    use crate::schema::refresh_tokens::dsl as rt;

    diesel::update(
        rt::refresh_tokens
            .filter(rt::user_id.eq(user))
            .filter(rt::revoked_at.is_null()),
    )
    .set(rt::revoked_at.eq(Utc::now()))
    .execute(conn)
    .await
    .map_err(ApiError::from)
}

pub async fn delete_expired_refresh_tokens(
    conn: &mut AsyncPgConnection,
) -> Result<usize, ApiError> {
    use crate::schema::refresh_tokens::dsl as rt;

    diesel::delete(rt::refresh_tokens.filter(rt::expires_at.lt(Utc::now())))
        .execute(conn)
        .await
        .map_err(ApiError::from)
}

#[cfg(test)]
mod refresh_token_tests {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_serializes_multi_word_fields_as_camel_case() {
        let u = user(true, false, false);
        let json = serde_json::to_value(&u).unwrap();

        assert!(json.get("publicId").is_some());
        assert!(json.get("avatarUrl").is_some());
        assert!(json.get("primaryProvider").is_some());
        assert!(json.get("isActive").is_some());
        assert!(json.get("createdAt").is_some());
        assert!(json.get("updatedAt").is_some());
        assert!(json.get("deletedAt").is_some());
        assert!(json.get("public_id").is_none());
        assert!(json.get("avatar_url").is_none());
    }

    #[test]
    fn new_user_accepts_camel_case_and_the_legacy_snake_case_alias() {
        let camel = r#"{
            "name": "Zeile",
            "email": "z@zeile.dev",
            "passwordHash": "hash",
            "primaryProvider": "Email",
            "githubId": null,
            "googleId": null,
            "avatarUrl": null
        }"#;
        let snake = r#"{
            "name": "Zeile",
            "email": "z@zeile.dev",
            "password_hash": "hash",
            "primary_provider": "Email",
            "github_id": null,
            "google_id": null,
            "avatar_url": null
        }"#;

        let from_camel: NewUser = serde_json::from_str(camel).unwrap();
        let from_snake: NewUser = serde_json::from_str(snake).unwrap();

        assert_eq!(from_camel.password_hash, from_snake.password_hash);
    }

    #[test]
    fn reset_password_payload_accepts_camel_case_and_the_legacy_snake_case_alias() {
        use super::super::dto::ResetPasswordPayload;

        let camel: ResetPasswordPayload =
            serde_json::from_str(r#"{"token":"t","newPassword":"p"}"#).unwrap();
        let snake: ResetPasswordPayload =
            serde_json::from_str(r#"{"token":"t","new_password":"p"}"#).unwrap();

        assert_eq!(camel.new_password, snake.new_password);
    }

    fn user(password: bool, github: bool, google: bool) -> User {
        User {
            id: Uuid::new_v4(),
            public_id: 1,
            name: "Zeile".to_string(),
            email: "zeile@example.com".to_string(),
            avatar_url: None,
            password_hash: password.then(|| "hash".to_string()),
            primary_provider: AuthProvider::Email,
            github_id: github.then(|| "1".to_string()),
            google_id: google.then(|| "2".to_string()),
            role: super::super::entity::UserRole::User,
            is_active: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
            password_changed_at: Utc::now(),
        }
    }

    #[test]
    fn account_with_password_and_google_can_unlink_google() {
        let u = user(true, false, true);

        assert_eq!(u.login_methods(), 2);
        assert!(u.can_unlink(AuthProvider::Google));
    }

    #[test]
    fn the_last_method_cannot_be_removed() {
        let google_only = user(false, false, true);
        let password_only = user(true, false, false);

        assert!(!google_only.can_unlink(AuthProvider::Google));
        assert!(!password_only.can_unlink(AuthProvider::Email));
    }

    #[test]
    fn a_provider_that_is_not_linked_cannot_be_unlinked() {
        let u = user(true, true, false);

        assert!(!u.can_unlink(AuthProvider::Google));
        assert!(u.can_unlink(AuthProvider::Github));
    }

    #[test]
    fn account_with_two_providers_and_no_password_can_still_unlink_one() {
        let u = user(false, true, true);

        assert!(u.can_unlink(AuthProvider::Github));
        assert!(u.can_unlink(AuthProvider::Google));
    }
}

#[cfg(test)]
mod refresh_token_tests_with_database {
    use super::*;
    use diesel_async::AsyncConnection;

    async fn connection() -> Option<AsyncPgConnection> {
        let url = std::env::var("TEST_MIGRATION_DATABASE_URL").ok()?;
        crate::db_migrations::ensure_test_database_migrated(&url);

        AsyncPgConnection::establish(&url).await.ok()
    }

    async fn test_user(conn: &mut AsyncPgConnection) -> Uuid {
        let user_id = Uuid::new_v4();

        diesel::sql_query(format!(
            "INSERT INTO users (id, public_id, name, email, primary_provider, role, is_active) \
             VALUES ('{user_id}', {}, 'Test', 'test_{user_id}@example.test', 'email', 'user', true)",
            rand::random::<u16>() as i32 + 1_000_000
        ))
        .execute(conn)
        .await
        .expect("insert test user");

        user_id
    }

    #[tokio::test]
    async fn issue_finds_the_token_by_its_secret() {
        let Some(mut conn) = connection().await else {
            eprintln!("TEST_MIGRATION_DATABASE_URL missing; test skipped");
            return;
        };

        let user = test_user(&mut conn).await;
        let (token_id, token) = issue(&mut conn, user).await.expect("issue");

        let found = find_by_token(&mut conn, &token).await.expect("find");

        assert_eq!(found.id, token_id);
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

        assert!(
            !spent.usable(Utc::now()),
            "the previous token should be spent"
        );
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
        assert!(
            !find_by_token(&mut conn, &a)
                .await
                .unwrap()
                .usable(Utc::now())
        );
        assert!(
            !find_by_token(&mut conn, &b)
                .await
                .unwrap()
                .usable(Utc::now())
        );
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
