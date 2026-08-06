use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::controllers::utils::Sanitize;

use super::entity::{AuthProvider, User};

#[derive(Clone)]
pub struct UserAuthInfo {
    pub id: Uuid,
    pub public_id: i32,
    pub email: String,
    pub role: super::entity::UserRole,
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

#[derive(Deserialize, Validate, Debug, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoginUser {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

impl Sanitize for LoginUser {
    fn sanitize(&mut self) {
        self.email = self.email.trim().to_lowercase();
    }
}

#[derive(Deserialize, Validate, diesel::AsChangeset, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::users)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUser {
    #[validate(length(min = 1))]
    pub name: String,

    #[validate(email)]
    pub email: String,
}

impl Sanitize for UpdateUser {
    fn sanitize(&mut self) {
        self.email = self.email.trim().to_lowercase();
        self.name = self.name.trim().to_string();
    }
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserPassword {
    #[validate(length(min = 1, message = "The current password is required"))]
    pub current_password: String,
    #[validate(length(min = 1, message = "The new password is required"))]
    pub new_password: String,
    #[validate(length(min = 1, message = "The confirmation password is required"))]
    pub confirm_password: String,
}

#[derive(Validate, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserEmail {
    #[validate(email)]
    pub email: String,
}

impl Sanitize for UserEmail {
    fn sanitize(&mut self) {
        self.email = self.email.trim().to_lowercase();
    }
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResetPasswordPayload {
    #[validate(length(min = 1, message = "Token is required"))]
    pub token: String,
    #[serde(alias = "new_password")]
    #[validate(length(min = 1, message = "The new password is required"))]
    pub new_password: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in_secs: i64,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RefreshPayload {
    pub refresh_token: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthMethodsResponse {
    pub password: bool,
    pub providers: Vec<&'static str>,
    pub primary_provider: AuthProvider,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersResponse {
    pub providers: Vec<&'static str>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkStartResponse {
    pub url: String,
}
