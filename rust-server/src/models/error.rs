use axum::{
    Json,
    response::{IntoResponse, Response},
};
use hyper::StatusCode;
use serde::Serialize;
use serde_json::json;
use thiserror::Error;
use utoipa::ToSchema;

pub const INTERNAL_MESSAGE: &str = "Internal server error";

#[derive(Error, Debug, Serialize, ToSchema)]
pub enum ApiError {
    #[error("Error processing your request: {0}")]
    Request(String),

    #[error("Error while trying to connect to the database: {0}")]
    DatabaseConnection(String),

    #[error("Invalid authorization token")]
    InvalidAuthorizationToken,

    #[error("Multiple errors while validating the authorization token: {0:?}")]
    MultipleAuthorizationErrors(Vec<String>),

    #[error("A database error occurred: {0}")]
    Database(String),

    #[error("Failed to create token: {0}")]
    CreateToken(String),

    #[error("Missing fields in the request")]
    InvalidData,

    #[error("Invalid email provided")]
    InvalidEmail,

    #[error("Invalid email or password")]
    InvalidCredentials,

    #[error("Please log in with {0}")]
    WrongProvider(String),

    #[error("User is not active")]
    NotActiveUser,

    #[error("Invalid password")]
    InvalidPassword,

    #[error("Missing frontend URL")]
    FrontendUrl,

    #[error("User not found")]
    UserNotFound,

    #[error("Missing frontend URL")]
    MissingFrontendUrl,

    #[error("{0} is missing from env")]
    MissingEnv(String),

    #[error("The passwords do not match")]
    PasswordsDoNotMatch,

    #[error("Error sending the e-mail")]
    SendingEmail,

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("This is the last login method on the account")]
    LastLoginMethod,
}

pub const ALL_ERROR_CODES: &[&str] = &[
    "BAD_REQUEST",
    "DATABASE_CONNECTION_ERROR",
    "INVALID_AUTH_TOKEN",
    "MULTIPLE_AUTH_ERRORS",
    "DATABASE_ERROR",
    "TOKEN_CREATION_FAILED",
    "INVALID_DATA",
    "INVALID_EMAIL",
    "INVALID_CREDENTIALS",
    "WRONG_PROVIDER",
    "USER_NOT_ACTIVE",
    "INVALID_PASSWORD",
    "MISSING_FRONTEND_URL",
    "USER_NOT_FOUND",
    "MISSING_ENV_VAR",
    "PASSWORDS_DO_NOT_MATCH",
    "ERROR_SENDING_EMAIL",
    "PERMISSION_DENIED",
    "LAST_LOGIN_METHOD",
];

impl ApiError {
    fn error_code(&self) -> &'static str {
        match self {
            ApiError::Request(_) => "BAD_REQUEST",
            ApiError::DatabaseConnection(_) => "DATABASE_CONNECTION_ERROR",
            ApiError::InvalidAuthorizationToken => "INVALID_AUTH_TOKEN",
            ApiError::MultipleAuthorizationErrors(_) => "MULTIPLE_AUTH_ERRORS",
            ApiError::Database(_) => "DATABASE_ERROR",
            ApiError::CreateToken(_) => "TOKEN_CREATION_FAILED",
            ApiError::InvalidData => "INVALID_DATA",
            ApiError::InvalidEmail => "INVALID_EMAIL",
            ApiError::InvalidCredentials => "INVALID_CREDENTIALS",
            ApiError::WrongProvider(_) => "WRONG_PROVIDER",
            ApiError::NotActiveUser => "USER_NOT_ACTIVE",
            ApiError::InvalidPassword => "INVALID_PASSWORD",
            ApiError::FrontendUrl | ApiError::MissingFrontendUrl => "MISSING_FRONTEND_URL",
            ApiError::UserNotFound => "USER_NOT_FOUND",
            ApiError::MissingEnv(_) => "MISSING_ENV_VAR",
            ApiError::PasswordsDoNotMatch => "PASSWORDS_DO_NOT_MATCH",
            ApiError::SendingEmail => "ERROR_SENDING_EMAIL",
            ApiError::PermissionDenied(_) => "PERMISSION_DENIED",
            ApiError::LastLoginMethod => "LAST_LOGIN_METHOD",
        }
    }

    fn error_details(&self) -> serde_json::Value {
        match self {
            ApiError::WrongProvider(provider) => json!({ "provider": provider }),
            ApiError::MissingEnv(env) => json!({ "env_var": env }),
            ApiError::Request(detail) => json!({ "detail": detail }),
            _ => json!({}),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let details = self.error_details();
        let error_code = self.error_code();

        let (status, message) = match self {
            ApiError::Database(_)
            | ApiError::DatabaseConnection(_)
            | ApiError::CreateToken(_)
            | ApiError::SendingEmail => {
                tracing::error!(error_code, "falha de infraestrutura: {self}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    INTERNAL_MESSAGE.to_string(),
                )
            }

            ApiError::Request(_) | ApiError::InvalidData | ApiError::MissingFrontendUrl => {
                (StatusCode::BAD_REQUEST, self.to_string())
            }

            ApiError::InvalidAuthorizationToken
            | ApiError::InvalidPassword
            | ApiError::InvalidCredentials
            | ApiError::PasswordsDoNotMatch => (StatusCode::UNAUTHORIZED, self.to_string()),

            ApiError::NotActiveUser => (
                StatusCode::FORBIDDEN,
                "User account is inactive".to_string(),
            ),
            ApiError::PermissionDenied(_) => (StatusCode::FORBIDDEN, self.to_string()),
            ApiError::LastLoginMethod => (StatusCode::CONFLICT, self.to_string()),
            ApiError::WrongProvider(p) => {
                (StatusCode::BAD_REQUEST, format!("Please log in with {}", p))
            }

            ApiError::UserNotFound => (StatusCode::NOT_FOUND, self.to_string()),

            _ => {
                tracing::error!(error_code, "unclassified error: {self}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    INTERNAL_MESSAGE.to_string(),
                )
            }
        };

        let details = if status.is_server_error() {
            json!({})
        } else {
            details
        };

        let body = json!({
            "code": error_code,
            "message": message,
            "details": details
        });

        (status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one_of_each_variant() -> Vec<ApiError> {
        vec![
            ApiError::Request(String::new()),
            ApiError::DatabaseConnection(String::new()),
            ApiError::InvalidAuthorizationToken,
            ApiError::MultipleAuthorizationErrors(Vec::new()),
            ApiError::Database(String::new()),
            ApiError::CreateToken(String::new()),
            ApiError::InvalidData,
            ApiError::InvalidEmail,
            ApiError::InvalidCredentials,
            ApiError::WrongProvider(String::new()),
            ApiError::NotActiveUser,
            ApiError::InvalidPassword,
            ApiError::FrontendUrl,
            ApiError::UserNotFound,
            ApiError::MissingFrontendUrl,
            ApiError::MissingEnv(String::new()),
            ApiError::PasswordsDoNotMatch,
            ApiError::SendingEmail,
            ApiError::PermissionDenied(String::new()),
            ApiError::LastLoginMethod,
        ]
    }

    // exhaustive match with no wildcard: a new variant fails to compile here until
    // `one_of_each_variant` is updated, so the drift guard below can't go silently stale
    fn assert_exhaustive(e: &ApiError) {
        match e {
            ApiError::Request(_)
            | ApiError::DatabaseConnection(_)
            | ApiError::InvalidAuthorizationToken
            | ApiError::MultipleAuthorizationErrors(_)
            | ApiError::Database(_)
            | ApiError::CreateToken(_)
            | ApiError::InvalidData
            | ApiError::InvalidEmail
            | ApiError::InvalidCredentials
            | ApiError::WrongProvider(_)
            | ApiError::NotActiveUser
            | ApiError::InvalidPassword
            | ApiError::FrontendUrl
            | ApiError::UserNotFound
            | ApiError::MissingFrontendUrl
            | ApiError::MissingEnv(_)
            | ApiError::PasswordsDoNotMatch
            | ApiError::SendingEmail
            | ApiError::PermissionDenied(_)
            | ApiError::LastLoginMethod => {}
        }
    }

    #[test]
    fn all_error_codes_matches_every_variant() {
        let variants = one_of_each_variant();
        variants.iter().for_each(assert_exhaustive);
        let mut codes_from_variants: Vec<&'static str> =
            variants.iter().map(|e| e.error_code()).collect();
        codes_from_variants.sort_unstable();
        codes_from_variants.dedup();

        let mut declared: Vec<&'static str> = ALL_ERROR_CODES.to_vec();
        declared.sort_unstable();
        declared.dedup();

        assert_eq!(
            codes_from_variants, declared,
            "ALL_ERROR_CODES divergiu de ApiError::error_code() — atualize a constante"
        );
    }
}
