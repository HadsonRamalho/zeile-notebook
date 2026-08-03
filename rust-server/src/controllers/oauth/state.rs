use axum::http::HeaderMap;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::controllers::{
    jwt::get_jwt_secret_from_env,
    oauth::provider::{OAuthError, Provider},
    utils::get_var_from_env,
};

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

pub struct Desafio {
    pub state: String,
    pub set_cookie: String,
}

pub fn emitir(
    provider: Provider,
    purpose: Purpose,
    user_id: Option<Uuid>,
) -> Result<Desafio, OAuthError> {
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
        tracing::error!("falha ao assinar o state do OAuth: {e}");
        OAuthError::Unavailable
    })?;

    Ok(Desafio {
        state,
        set_cookie: cookie(&nonce, TTL_SECS),
    })
}

pub fn validar(
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

    let esperado = nonce_do_cookie(headers).ok_or(OAuthError::InvalidState)?;

    if !comparacao_constante(&esperado, &claims.nonce) {
        return Err(OAuthError::InvalidState);
    }

    Ok(claims.sub)
}

pub fn cookie_expirado() -> String {
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

fn nonce_do_cookie(headers: &HeaderMap) -> Option<String> {
    let bruto = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;

    bruto
        .split(';')
        .filter_map(|par| par.split_once('='))
        .find(|(nome, _)| nome.trim() == COOKIE)
        .map(|(_, valor)| valor.trim().to_string())
        .filter(|valor| !valor.is_empty())
}

fn nonce() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);

    hex::encode(bytes)
}

fn comparacao_constante(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }

    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

#[cfg(test)]
mod testes {
    use super::*;

    fn com_segredo<T>(corpo: impl FnOnce() -> T) -> T {
        unsafe { std::env::set_var("JWT_SECRET", "segredo-de-teste-para-reset") };
        corpo()
    }

    fn headers_com(nonce: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::COOKIE,
            format!("outro=1; {COOKIE}={nonce}").parse().unwrap(),
        );

        headers
    }

    fn nonce_emitido(desafio: &Desafio) -> String {
        desafio
            .set_cookie
            .split(';')
            .next()
            .and_then(|par| par.split_once('='))
            .map(|(_, valor)| valor.to_string())
            .expect("cookie")
    }

    #[test]
    fn state_valido_devolve_o_usuario_do_vinculo() {
        com_segredo(|| {
            let user = Uuid::new_v4();
            let desafio = emitir(Provider::Google, Purpose::Link, Some(user)).expect("emitir");
            let headers = headers_com(&nonce_emitido(&desafio));

            let sub = validar(&desafio.state, Provider::Google, Purpose::Link, &headers)
                .expect("state válido");

            assert_eq!(sub, Some(user));
        });
    }

    #[test]
    fn state_sem_cookie_correspondente_e_recusado() {
        com_segredo(|| {
            let desafio = emitir(Provider::Google, Purpose::Login, None).expect("emitir");

            let sem_cookie = validar(
                &desafio.state,
                Provider::Google,
                Purpose::Login,
                &HeaderMap::new(),
            );
            let outro_nonce = validar(
                &desafio.state,
                Provider::Google,
                Purpose::Login,
                &headers_com("00000000000000000000000000000000"),
            );

            assert_eq!(sem_cookie, Err(OAuthError::InvalidState));
            assert_eq!(outro_nonce, Err(OAuthError::InvalidState));
        });
    }

    #[test]
    fn state_de_outro_provider_ou_proposito_e_recusado() {
        com_segredo(|| {
            let desafio = emitir(Provider::Google, Purpose::Login, None).expect("emitir");
            let headers = headers_com(&nonce_emitido(&desafio));

            assert_eq!(
                validar(&desafio.state, Provider::Github, Purpose::Login, &headers),
                Err(OAuthError::InvalidState)
            );
            assert_eq!(
                validar(&desafio.state, Provider::Google, Purpose::Link, &headers),
                Err(OAuthError::InvalidState)
            );
        });
    }

    #[test]
    fn state_forjado_sem_assinatura_e_recusado() {
        com_segredo(|| {
            let headers = headers_com("abc");

            assert_eq!(
                validar("nao-e-um-jwt", Provider::Google, Purpose::Login, &headers),
                Err(OAuthError::InvalidState)
            );
        });
    }

    #[test]
    fn cookie_expirado_zera_o_valor() {
        assert!(cookie_expirado().starts_with(&format!("{COOKIE}=;")));
        assert!(cookie_expirado().contains("Max-Age=0"));
    }
}
