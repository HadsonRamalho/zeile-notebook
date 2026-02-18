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
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn find_user_by_id(conn: &mut AsyncPgConnection, param: &Uuid) -> Result<User, ApiError> {
    match users.filter(id.eq(param)).get_result(conn).await {
        Ok(user) => Ok(user),
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

pub async fn update_user_provider(
    conn: &mut AsyncPgConnection,
    id_param: &Uuid,
    provider: AuthProvider,
    avatar: Option<String>,
) -> Result<(), ApiError> {
    let null_password: Option<String> = None;
    match diesel::update(users)
        .filter(id.eq(id_param))
        .set((
            password_hash.eq(null_password),
            primary_provider.eq(provider),
            avatar_url.eq(avatar),
        ))
        .execute(conn)
        .await
    {
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
        .set(password_hash.eq(new_password))
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
