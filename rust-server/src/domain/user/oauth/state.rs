use axum::http::HeaderMap;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::controllers::{jwt::get_jwt_secret_from_env, utils::get_var_from_env};

use super::provider::{OAuthError, Provider};

const COOKIE: &str = "zeile_oauth_state";
const TTL_SECS: i64 = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Purpose {
    Login,
    Link,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StateClaims {
    pub prov: String,
    pub purpose: Purpose,
    pub nonce: String,
    pub sub: Option<Uuid>,
    pub exp: usize,
}

pub struct Challenge {
    pub state: String,
    pub set_cookie: String,
}

pub fn issue(
    provider: Provider,
    purpose: Purpose,
    user_id: Option<Uuid>,
) -> Result<Challenge, OAuthError> {
    let nonce = nonce();

    let claims = StateClaims {
        prov: provider.slug().to_string(),
        purpose,
        nonce: nonce.clone(),
        sub: user_id,
        exp: (chrono::Utc::now().timestamp() + TTL_SECS) as usize,
    };

    let secret = get_jwt_secret_from_env().map_err(|_| OAuthError::Unavailable)?;

    let state = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
    .map_err(|e| {
        tracing::error!("failed to sign the OAuth state: {e}");
        OAuthError::Unavailable
    })?;

    Ok(Challenge {
        state,
        set_cookie: cookie(&nonce, TTL_SECS),
    })
}

pub fn validate(
    state: &str,
    provider: Provider,
    purpose: Purpose,
    headers: &HeaderMap,
) -> Result<Option<Uuid>, OAuthError> {
    let secret = get_jwt_secret_from_env().map_err(|_| OAuthError::Unavailable)?;

    let claims = decode::<StateClaims>(
        state,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| OAuthError::InvalidState)?
    .claims;

    if claims.prov != provider.slug() || claims.purpose != purpose {
        return Err(OAuthError::InvalidState);
    }

    if purpose == Purpose::Link && claims.sub.is_none() {
        return Err(OAuthError::InvalidState);
    }

    match cookie_nonce(headers) {
        Some(expected) if constant_time_compare(&expected, &claims.nonce) => {}
        Some(_) => return Err(OAuthError::InvalidState),
        None if purpose == Purpose::Login => return Err(OAuthError::InvalidState),
        None => {}
    }

    Ok(claims.sub)
}

pub fn expired_cookie() -> String {
    cookie("", 0)
}

fn cookie(nonce: &str, max_age: i64) -> String {
    let mut cookie = format!("{COOKIE}={nonce}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax");

    if get_var_from_env("API_URL")
        .map(|url| url.starts_with("https://"))
        .unwrap_or(false)
    {
        cookie.push_str("; Secure");
    }

    cookie
}

fn cookie_nonce(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;

    raw.split(';')
        .filter_map(|pair| pair.split_once('='))
        .find(|(name, _)| name.trim() == COOKIE)
        .map(|(_, value)| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn nonce() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);

    hex::encode(bytes)
}

fn constant_time_compare(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }

    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_secret<T>(body: impl FnOnce() -> T) -> T {
        unsafe { std::env::set_var("JWT_SECRET", "test-secret-for-reset") };
        body()
    }

    fn headers_with(nonce: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::COOKIE,
            format!("other=1; {COOKIE}={nonce}").parse().unwrap(),
        );

        headers
    }

    fn issued_nonce(challenge: &Challenge) -> String {
        challenge
            .set_cookie
            .split(';')
            .next()
            .and_then(|pair| pair.split_once('='))
            .map(|(_, value)| value.to_string())
            .expect("cookie")
    }

    #[test]
    fn valid_state_returns_the_link_user() {
        with_secret(|| {
            let user = Uuid::new_v4();
            let challenge = issue(Provider::Google, Purpose::Link, Some(user)).expect("issue");
            let headers = headers_with(&issued_nonce(&challenge));

            let sub = validate(&challenge.state, Provider::Google, Purpose::Link, &headers)
                .expect("valid state");

            assert_eq!(sub, Some(user));
        });
    }

    #[test]
    fn state_without_a_matching_cookie_is_refused() {
        with_secret(|| {
            let challenge = issue(Provider::Google, Purpose::Login, None).expect("issue");

            let no_cookie = validate(
                &challenge.state,
                Provider::Google,
                Purpose::Login,
                &HeaderMap::new(),
            );
            let other_nonce = validate(
                &challenge.state,
                Provider::Google,
                Purpose::Login,
                &headers_with("00000000000000000000000000000000"),
            );

            assert_eq!(no_cookie, Err(OAuthError::InvalidState));
            assert_eq!(other_nonce, Err(OAuthError::InvalidState));
        });
    }

    #[test]
    fn linking_skips_the_cookie_because_the_owner_is_signed_into_the_state() {
        with_secret(|| {
            let user = Uuid::new_v4();
            let challenge = issue(Provider::Google, Purpose::Link, Some(user)).expect("issue");

            let sub = validate(
                &challenge.state,
                Provider::Google,
                Purpose::Link,
                &HeaderMap::new(),
            )
            .expect("cross-site linking cannot depend on a third-party cookie");

            assert_eq!(sub, Some(user));
        });
    }

    #[test]
    fn linking_with_a_divergent_cookie_is_still_refused() {
        with_secret(|| {
            let challenge =
                issue(Provider::Google, Purpose::Link, Some(Uuid::new_v4())).expect("issue");

            assert_eq!(
                validate(
                    &challenge.state,
                    Provider::Google,
                    Purpose::Link,
                    &headers_with("00000000000000000000000000000000"),
                ),
                Err(OAuthError::InvalidState)
            );
        });
    }

    #[test]
    fn linking_without_an_owner_in_the_state_is_refused() {
        with_secret(|| {
            let challenge = issue(Provider::Google, Purpose::Link, None).expect("issue");
            let headers = headers_with(&issued_nonce(&challenge));

            assert_eq!(
                validate(&challenge.state, Provider::Google, Purpose::Link, &headers),
                Err(OAuthError::InvalidState)
            );
        });
    }

    #[test]
    fn state_from_another_provider_or_purpose_is_refused() {
        with_secret(|| {
            let challenge = issue(Provider::Google, Purpose::Login, None).expect("issue");
            let headers = headers_with(&issued_nonce(&challenge));

            assert_eq!(
                validate(&challenge.state, Provider::Github, Purpose::Login, &headers),
                Err(OAuthError::InvalidState)
            );
            assert_eq!(
                validate(&challenge.state, Provider::Google, Purpose::Link, &headers),
                Err(OAuthError::InvalidState)
            );
        });
    }

    #[test]
    fn forged_state_without_a_signature_is_refused() {
        with_secret(|| {
            let headers = headers_with("abc");

            assert_eq!(
                validate("not-a-jwt", Provider::Google, Purpose::Login, &headers),
                Err(OAuthError::InvalidState)
            );
        });
    }

    #[test]
    fn expired_cookie_zeroes_out_the_value() {
        assert!(expired_cookie().starts_with(&format!("{COOKIE}=;")));
        assert!(expired_cookie().contains("Max-Age=0"));
    }
}
