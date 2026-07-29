use std::env;

use crate::models::{error::ApiError, jwt::Claims, user::UserAuthInfo};
use axum::{body::Body, extract::Request, middleware::Next, response::Response};
use dotenvy::dotenv;
use hyper::{HeaderMap, StatusCode};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode};
use serde::{Deserialize, Serialize};

const JWT_EXP_HOURS: i64 = 24 * 7;

#[derive(Debug, Serialize, Deserialize)]
pub struct ResetClaims {
    pub sub: uuid::Uuid,
    pub exp: usize,
}

pub async fn jwt_auth(req: Request<Body>, next: Next) -> Result<Response, ApiError> {
    let _ = extract_claims_from_header(req.headers()).await?;
    Ok(next.run(req).await)
}

pub async fn extract_claims_from_header(headers: &HeaderMap) -> Result<(String, Claims), ApiError> {
    let auth_header = headers
        .get("Authorization")
        .and_then(|value| value.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            Some(header.trim_start_matches("Bearer ").trim())
        }
        _ => None,
    };

    let token = match token {
        Some(t) => t,
        None => {
            return Err(ApiError::InvalidAuthorizationToken);
        }
    };

    let secret = get_jwt_secret_from_env()?;

    let decoded = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    );

    let claims = match decoded {
        Ok(data) => (token.to_string(), data.claims),
        Err(_) => {
            return Err(ApiError::InvalidAuthorizationToken);
        }
    };

    let _ = validate_claims(&claims.1).await?;

    Ok(claims)
}

pub async fn validate_claims(claims: &Claims) -> Result<StatusCode, ApiError> {
    let mut errors = vec![];

    if claims.id.to_string().trim().is_empty() {
        errors.push("Invalid ID".to_string())
    }
    if claims.public_id.to_string().is_empty() {
        errors.push("Invalid Public ID".to_string())
    }
    if claims.email.is_empty() {
        errors.push("Invalid E-mail".to_string())
    }
    if claims.exp == 0 {
        errors.push("Invalid expiration date".to_string())
    }

    let now = chrono::Utc::now().timestamp() as usize;
    if claims.exp < now {
        errors.push("Expired token".to_string())
    }

    if errors.is_empty() {
        return Ok(StatusCode::OK);
    }

    Err(ApiError::MultipleAuthorizationErrors(errors))
}

pub fn get_jwt_secret_from_env() -> Result<String, ApiError> {
    dotenv().ok();

    match env::var("JWT_SECRET") {
        Ok(secret) => Ok(secret),
        Err(_) => Err(ApiError::MissingEnv("JWT_SECRET".to_string())),
    }
}

pub fn generate_jwt(input: UserAuthInfo) -> Result<String, ApiError> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(JWT_EXP_HOURS))
        .expect("Invalid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        id: input.id,
        email: input.email.to_string(),
        exp: expiration,
        public_id: input.public_id,
        role: input.role,
    };

    let secret = get_jwt_secret_from_env()?;

    match jsonwebtoken::encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    ) {
        Ok(token) => Ok(token),
        Err(e) => Err(ApiError::CreateToken(e.to_string())),
    }
}

pub fn extract_token_from_ws(headers: &HeaderMap) -> Option<String> {
    headers
        .get("sec-websocket-protocol")
        .and_then(|val| val.to_str().ok())
        .and_then(|s| {
            let parts: Vec<&str> = s.split(',').map(|p| p.trim()).collect();
            parts.get(1).map(|&t| t.to_string())
        })
}

pub async fn extract_claims_from_ws_headers(
    headers: &HeaderMap,
) -> Result<(String, Claims), ApiError> {
    let token = extract_token_from_ws(headers).ok_or(ApiError::InvalidAuthorizationToken)?;

    let secret = get_jwt_secret_from_env()?;

    let decoded = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| ApiError::InvalidAuthorizationToken)?;

    validate_claims(&decoded.claims).await?;

    Ok((token, decoded.claims))
}

pub fn generate_reset_token(user_id: uuid::Uuid) -> Result<String, ApiError> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(1))
        .expect("Invalid timestamp")
        .timestamp() as usize;

    let claims = ResetClaims {
        sub: user_id,
        exp: expiration,
    };

    let secret = get_jwt_secret_from_env()?;

    match jsonwebtoken::encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    ) {
        Ok(token) => Ok(token),
        Err(e) => Err(ApiError::CreateToken(e.to_string())),
    }
}

pub fn verify_reset_token(token: &str) -> Result<uuid::Uuid, ApiError> {
    let secret = get_jwt_secret_from_env()?;

    let decoded = decode::<ResetClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| ApiError::InvalidAuthorizationToken)?;

    let now = chrono::Utc::now().timestamp() as usize;
    if decoded.claims.exp < now {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    Ok(decoded.claims.sub)
}
