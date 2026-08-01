use std::env;

use crate::models::{error::ApiError, jwt::Claims, user::UserAuthInfo};
use axum::{body::Body, extract::Request, middleware::Next, response::Response};
use dotenvy::dotenv;
use hyper::{HeaderMap, StatusCode};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode};
use serde::{Deserialize, Serialize};

/// Validade do access token. Curta de propósito: a revogação de verdade mora no
/// refresh token, que é conferido no banco a cada rotação. Com sete dias, um
/// token vazado valia uma semana e não havia como cortar.
const JWT_EXP_MINUTES: i64 = 15;

#[derive(Debug, Serialize, Deserialize)]
pub struct ResetClaims {
    pub sub: uuid::Uuid,
    pub exp: usize,
    /// Instante de emissão. É comparado com `users.password_changed_at` para que
    /// o link deixe de valer assim que a senha muda — o que inclui a própria
    /// troca feita por ele, tornando-o de uso único.
    pub iat: i64,
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

pub fn access_token_ttl_secs() -> i64 {
    JWT_EXP_MINUTES * 60
}

pub fn generate_jwt(input: UserAuthInfo) -> Result<String, ApiError> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::minutes(JWT_EXP_MINUTES))
        .expect("Invalid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        id: input.id,
        email: input.email.to_string(),
        exp: expiration,
        public_id: input.public_id,
        role: input.role,
        iat: Some(chrono::Utc::now().timestamp()),
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
        iat: chrono::Utc::now().timestamp(),
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

pub fn verify_reset_token(token: &str) -> Result<ResetClaims, ApiError> {
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

    Ok(decoded.claims)
}

/// Um link emitido antes da última troca de senha já foi gasto ou foi revogado.
pub fn reset_token_foi_consumido(
    claims: &ResetClaims,
    password_changed_at: chrono::DateTime<chrono::Utc>,
) -> bool {
    claims.iat < password_changed_at.timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn com_segredo<T>(corpo: impl FnOnce() -> T) -> T {
        unsafe { env::set_var("JWT_SECRET", "segredo-de-teste-para-reset") };
        corpo()
    }

    fn agora() -> chrono::DateTime<Utc> {
        chrono::Utc::now()
    }

    use chrono::Utc;

    #[test]
    fn o_link_de_reset_carrega_o_instante_de_emissao() {
        com_segredo(|| {
            let token = generate_reset_token(uuid::Uuid::new_v4()).expect("token");
            let claims = verify_reset_token(&token).expect("verificar");

            assert!(claims.iat > 0, "sem iat não há como revogar o link");
            assert!(claims.exp as i64 > claims.iat, "expiração deve ser futura");
        });
    }

    #[test]
    fn um_link_emitido_antes_da_troca_esta_consumido() {
        com_segredo(|| {
            let token = generate_reset_token(uuid::Uuid::new_v4()).expect("token");
            let claims = verify_reset_token(&token).expect("verificar");

            let depois = agora() + chrono::Duration::seconds(30);

            assert!(
                reset_token_foi_consumido(&claims, depois),
                "o mesmo link não pode servir duas vezes"
            );
        });
    }

    #[test]
    fn um_link_novo_vale_contra_senha_trocada_antes() {
        com_segredo(|| {
            let antes = agora() - chrono::Duration::days(30);

            let token = generate_reset_token(uuid::Uuid::new_v4()).expect("token");
            let claims = verify_reset_token(&token).expect("verificar");

            assert!(
                !reset_token_foi_consumido(&claims, antes),
                "link recém-emitido deveria valer"
            );
        });
    }

    #[test]
    fn token_de_reset_adulterado_e_recusado() {
        com_segredo(|| {
            let token = generate_reset_token(uuid::Uuid::new_v4()).expect("token");
            let adulterado = format!("{}x", token);

            assert!(verify_reset_token(&adulterado).is_err());
            assert!(verify_reset_token("nem-parece-jwt").is_err());
        });
    }
}
