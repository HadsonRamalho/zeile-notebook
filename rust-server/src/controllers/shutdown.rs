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

pub fn expected_token() -> Option<String> {
    std::env::var(TOKEN_VAR)
        .ok()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

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
    fn tokens_of_different_length_do_not_match() {
        assert!(!tokens_match("secret", "secre"));
        assert!(!tokens_match("secret", "secrett"));
    }

    #[test]
    fn identical_tokens_match() {
        assert!(tokens_match("secret", "secret"));
    }

    #[test]
    fn token_with_correct_prefix_does_not_match() {
        assert!(!tokens_match("secret", "secreu"));
    }

    #[test]
    fn missing_peer_does_not_count_as_loopback() {
        assert!(!is_loopback(None));
    }

    #[test]
    fn only_loopback_is_accepted() {
        let local: SocketAddr = "127.0.0.1:52000".parse().unwrap();
        let local_v6: SocketAddr = "[::1]:52000".parse().unwrap();
        let lan: SocketAddr = "192.168.0.10:52000".parse().unwrap();

        assert!(is_loopback(Some(&local)));
        assert!(is_loopback(Some(&local_v6)));
        assert!(!is_loopback(Some(&lan)));
    }
}
