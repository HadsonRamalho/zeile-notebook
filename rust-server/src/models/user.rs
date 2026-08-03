use crate::schema::users::dsl::*;
use crate::{controllers::utils::Sanitize, models::error::ApiError, schema::users};
use chrono::{DateTime, Utc};
use diesel::{
    ExpressionMethods, QueryDsl,
    prelude::{AsChangeset, Insertable, Queryable},
};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, ToSchema)]
#[ExistingTypePath = "crate::schema::sql_types::UserRole"]
pub enum UserRole {
    Admin,
    User,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, ToSchema)]
#[ExistingTypePath = "crate::schema::sql_types::AuthProvider"]
pub enum AuthProvider {
    Email,
    Google,
    Github,
}

#[derive(Queryable, Insertable, AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = users)]
pub struct User {
    pub id: Uuid,
    pub public_id: i32,
    pub name: String,
    pub email: String,
    pub avatar_url: Option<String>,
    #[serde(skip_serializing)]
    pub password_hash: Option<String>,
    pub primary_provider: AuthProvider,
    #[serde(skip_serializing)]
    pub github_id: Option<String>,
    #[serde(skip_serializing)]
    pub google_id: Option<String>,
    pub role: UserRole,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing)]
    pub password_changed_at: DateTime<Utc>,
}

impl User {
    pub fn provider_linked(&self, provider: AuthProvider) -> bool {
        match provider {
            AuthProvider::Github => self.github_id.is_some(),
            AuthProvider::Google => self.google_id.is_some(),
            AuthProvider::Email => self.password_hash.is_some(),
        }
    }

    pub fn login_methods(&self) -> usize {
        [
            self.password_hash.is_some(),
            self.github_id.is_some(),
            self.google_id.is_some(),
        ]
        .iter()
        .filter(|has| **has)
        .count()
    }

    pub fn can_unlink(&self, provider: AuthProvider) -> bool {
        self.provider_linked(provider) && self.login_methods() > 1
    }
}

#[derive(Clone)]
pub struct UserAuthInfo {
    pub id: Uuid,
    pub public_id: i32,
    pub email: String,
    pub role: UserRole,
}

impl From<User> for UserAuthInfo {
    fn from(input: User) -> Self {
        Self {
            id: input.id,
            public_id: input.public_id,
            email: input.email,
            role: input.role,
        }
    }
}

#[derive(Insertable, Validate, Debug, ToSchema, Deserialize)]
#[diesel(table_name = users)]
pub struct NewUser {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,

    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    pub password_hash: Option<String>,

    pub primary_provider: AuthProvider,
    pub github_id: Option<String>,
    pub google_id: Option<String>,
    pub avatar_url: Option<String>,
}

impl Sanitize for LoginUser {
    fn sanitize(&mut self) {
        self.email = self.email.trim().to_lowercase();
    }
}

impl Sanitize for NewUser {
    fn sanitize(&mut self) {
        self.name = self.name.trim().to_string();
        self.email = self.email.trim().to_lowercase();
    }
}

#[derive(Deserialize, Validate, Debug, ToSchema)]
pub struct LoginUser {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

#[derive(Deserialize, Validate, AsChangeset)]
#[diesel(table_name = users)]
pub struct UpdateUser {
    #[validate(length(min = 1))]
    pub name: String,

    #[validate(email)]
    pub email: String,
}

#[derive(Deserialize, Validate)]
pub struct UpdateUserPassword {
    #[validate(length(min = 1, message = "The current password is required"))]
    #[serde(rename = "currentPassword")]
    pub current_password: String,
    #[validate(length(min = 1, message = "The new password is required"))]
    #[serde(rename = "newPassword")]
    pub new_password: String,
    #[validate(length(min = 1, message = "The confirmation password is required"))]
    #[serde(rename = "confirmPassword")]
    pub confirm_password: String,
}

impl Sanitize for UpdateUser {
    fn sanitize(&mut self) {
        self.email = self.email.trim().to_lowercase();
        self.name = self.name.trim().to_string();
    }
}

#[derive(Validate, Serialize, Deserialize)]
pub struct UserEmail {
    #[validate(email)]
    pub email: String,
}

impl Sanitize for UserEmail {
    fn sanitize(&mut self) {
        self.email = self.email.trim().to_lowercase();
    }
}

#[derive(Deserialize)]
pub struct ResetPasswordPayload {
    pub token: String,
    pub new_password: String,
}

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
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn find_user_by_id(conn: &mut AsyncPgConnection, param: &Uuid) -> Result<User, ApiError> {
    match users.filter(id.eq(param)).get_result(conn).await {
        Ok(user) => Ok(user),
        Err(diesel::result::Error::NotFound) => Err(ApiError::UserNotFound),
        Err(e) => Err(ApiError::Database(e.to_string())),
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
        Err(e) => Err(ApiError::Database(e.to_string())),
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
        Err(e) => Err(ApiError::Database(e.to_string())),
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
        return Err(ApiError::Database(e.to_string()));
    }

    if let Some(avatar) = avatar {
        let _ = diesel::update(users)
            .filter(id.eq(id_param))
            .filter(avatar_url.is_null())
            .set(avatar_url.eq(avatar))
            .execute(conn)
            .await;
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
        Err(e) => Err(ApiError::Database(e.to_string())),
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
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

/// Rewrites only the hash, without touching `password_changed_at`. The
/// password didn't change — this is the algorithm migration on login — so
/// the user's pending reset links must not be invalidated by it.
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
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn delete_user(conn: &mut AsyncPgConnection, id_param: &Uuid) -> Result<(), ApiError> {
    match diesel::delete(users)
        .filter(id.eq(id_param))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
            role: UserRole::User,
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
