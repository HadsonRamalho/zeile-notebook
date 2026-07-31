use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{ConnectInfo, Request, State};
use axum::response::IntoResponse;
use hyper::StatusCode;
use serde_json::json;

use crate::models::state::AppState;
use crate::shutdown::Reason;

pub const TOKEN_HEADER: &str = "x-zeile-shell-token";
pub const TOKEN_VAR: &str = "ZEILE_SHELL_TOKEN";

/// Sem a variável a rota responde 404: um endpoint que derruba o servidor não deve nem
/// anunciar que existe no deploy de nuvem.
pub fn expected_token() -> Option<String> {
    std::env::var(TOKEN_VAR)
        .ok()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

/// tempo constante: um early-return por byte vazaria o prefixo correto
pub fn tokens_match(expected: &str, received: &str) -> bool {
    if expected.len() != received.len() {
        return false;
    }

    expected
        .as_bytes()
        .iter()
        .zip(received.as_bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

pub fn is_loopback(peer: Option<&SocketAddr>) -> bool {
    peer.is_some_and(|addr| addr.ip().is_loopback())
}

pub async fn request_shutdown(
    State(state): State<Arc<AppState>>,
    request: Request,
) -> impl IntoResponse {
    let Some(expected) = expected_token() else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0);

    if !is_loopback(peer.as_ref()) {
        tracing::warn!("shutdown refused: caller is not on loopback");
        return StatusCode::NOT_FOUND.into_response();
    }

    let received = request
        .headers()
        .get(TOKEN_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    if !tokens_match(&expected, received) {
        tracing::warn!("shutdown refused: invalid session token");
        return StatusCode::FORBIDDEN.into_response();
    }

    let started = state.shutdown.trigger(Reason::Internal);

    (
        StatusCode::ACCEPTED,
        axum::Json(json!({
            "status": if started { "shutting_down" } else { "already_shutting_down" },
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_de_tamanho_diferente_nao_casa() {
        assert!(!tokens_match("segredo", "segred"));
        assert!(!tokens_match("segredo", "segredoo"));
    }

    #[test]
    fn token_identico_casa() {
        assert!(tokens_match("segredo", "segredo"));
    }

    #[test]
    fn token_com_prefixo_correto_nao_casa() {
        assert!(!tokens_match("segredo", "segredx"));
    }

    #[test]
    fn peer_ausente_nao_conta_como_loopback() {
        assert!(!is_loopback(None));
    }

    #[test]
    fn so_loopback_e_aceito() {
        let local: SocketAddr = "127.0.0.1:52000".parse().unwrap();
        let local_v6: SocketAddr = "[::1]:52000".parse().unwrap();
        let lan: SocketAddr = "192.168.0.10:52000".parse().unwrap();

        assert!(is_loopback(Some(&local)));
        assert!(is_loopback(Some(&local_v6)));
        assert!(!is_loopback(Some(&lan)));
    }
}
