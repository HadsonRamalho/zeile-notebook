use axum::http::StatusCode;
use tower::ServiceExt;

use crate::controllers::shutdown::{TOKEN_HEADER, TOKEN_VAR};
use crate::routes::test_support::{post_from, router_and_state};

const TOKEN: &str = "3f6b1e2c-0000-4000-8000-abcdefabcdef";

static ENV_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct SessionToken(Option<String>);

impl SessionToken {
    fn set(value: Option<&str>) -> Self {
        let previous = std::env::var(TOKEN_VAR).ok();
        unsafe {
            match value {
                Some(v) => std::env::set_var(TOKEN_VAR, v),
                None => std::env::remove_var(TOKEN_VAR),
            }
        }
        Self(previous)
    }
}

impl Drop for SessionToken {
    fn drop(&mut self) {
        unsafe {
            match self.0.take() {
                Some(v) => std::env::set_var(TOKEN_VAR, v),
                None => std::env::remove_var(TOKEN_VAR),
            }
        }
    }
}

async fn attempt(
    process_token: Option<&str>,
    peer: &str,
    headers: &[(&str, &str)],
) -> (StatusCode, bool) {
    let _guard = ENV_LOCK.lock().await;
    let _token = SessionToken::set(process_token);

    let (router, state) = router_and_state().await;

    let response = router
        .oneshot(post_from("/internal/shutdown", peer, headers))
        .await
        .expect("response");

    (response.status(), state.shutdown.is_triggered())
}

#[tokio::test]
async fn without_a_process_token_the_route_does_not_exist() {
    let (status, triggered) = attempt(None, "127.0.0.1:52000", &[(TOKEN_HEADER, TOKEN)]).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(!triggered);
}

#[tokio::test]
async fn a_call_from_outside_loopback_does_not_bring_down_the_server() {
    let (status, triggered) =
        attempt(Some(TOKEN), "192.168.0.10:52000", &[(TOKEN_HEADER, TOKEN)]).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(!triggered);
}

#[tokio::test]
async fn loopback_without_the_token_is_refused() {
    let (status, triggered) = attempt(Some(TOKEN), "127.0.0.1:52000", &[]).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(!triggered);
}

#[tokio::test]
async fn loopback_with_the_wrong_token_is_refused() {
    let (status, triggered) = attempt(
        Some(TOKEN),
        "127.0.0.1:52000",
        &[(TOKEN_HEADER, "3f6b1e2c-0000-4000-8000-abcdefabcdee")],
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(!triggered);
}

#[tokio::test]
async fn loopback_with_the_correct_token_starts_shutdown() {
    let (status, triggered) =
        attempt(Some(TOKEN), "127.0.0.1:52000", &[(TOKEN_HEADER, TOKEN)]).await;

    assert_eq!(status, StatusCode::ACCEPTED);
    assert!(triggered);
}

#[tokio::test]
async fn the_route_stays_outside_the_api_prefix() {
    let (status, _) = attempt(Some(TOKEN), "127.0.0.1:52000", &[(TOKEN_HEADER, TOKEN)]).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    let _guard = ENV_LOCK.lock().await;
    let _token = SessionToken::set(Some(TOKEN));
    let (router, _) = router_and_state().await;

    let response = router
        .oneshot(post_from(
            "/api/internal/shutdown",
            "127.0.0.1:52000",
            &[(TOKEN_HEADER, TOKEN)],
        ))
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
