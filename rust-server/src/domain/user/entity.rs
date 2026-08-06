use chrono::{DateTime, Utc};
use diesel::prelude::{AsChangeset, Identifiable, Insertable, Queryable, Selectable};
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

#[derive(
    Queryable, Insertable, AsChangeset, Serialize, Deserialize, Debug, Clone, utoipa::ToSchema,
)]
#[diesel(table_name = crate::schema::users)]
#[serde(rename_all = "camelCase")]
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

#[derive(Insertable, Validate, Debug, ToSchema, Deserialize)]
#[diesel(table_name = crate::schema::users)]
#[serde(rename_all = "camelCase")]
pub struct NewUser {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,

    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[serde(alias = "password_hash")]
    pub password_hash: Option<String>,

    #[serde(alias = "primary_provider")]
    pub primary_provider: AuthProvider,
    #[serde(alias = "github_id")]
    pub github_id: Option<String>,
    #[serde(alias = "google_id")]
    pub google_id: Option<String>,
    #[serde(alias = "avatar_url")]
    pub avatar_url: Option<String>,
}

impl crate::controllers::utils::Sanitize for NewUser {
    fn sanitize(&mut self) {
        self.name = self.name.trim().to_string();
        self.email = self.email.trim().to_lowercase();
    }
}

#[derive(Debug, Queryable, Selectable, Identifiable)]
#[diesel(table_name = crate::schema::refresh_tokens)]
pub struct RefreshToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub replaced_by: Option<Uuid>,
}

impl RefreshToken {
    pub fn usable(&self, now: DateTime<Utc>) -> bool {
        self.revoked_at.is_none() && self.expires_at > now
    }
}
