use axum::http::StatusCode;

use crate::controllers::health::MIN_SUPPORTED_CLIENT_CONTRACT_VERSION;
use crate::routes::test_support::{body_as_text, get, get_with_headers, respond};

async fn response_of(path: &str) -> (StatusCode, String) {
    let response = respond(get(path)).await;
    let status = response.status();

    (status, body_as_text(response).await)
}

#[tokio::test]
async fn live_responds_ok_without_depending_on_the_database() {
    let (status, body) = response_of("/health/live").await;

    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("live"), "unexpected body: {body}");
}

#[tokio::test]
async fn ready_responds_503_when_the_database_does_not_respond() {
    let (status, body) = response_of("/health/ready").await;

    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(body.contains("not_ready"), "unexpected body: {body}");
}

#[tokio::test]
async fn health_stays_outside_the_api_prefix() {
    let (status, _) = response_of("/api/health/live").await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn ready_exposes_the_contract_version_handshake() {
    let (_, body) = response_of("/health/ready").await;

    assert!(
        body.contains("\"contract_version\""),
        "unexpected body: {body}"
    );
    assert!(
        body.contains("\"min_supported_contract_version\""),
        "unexpected body: {body}"
    );
}

#[tokio::test]
async fn ready_flags_a_client_below_the_minimum_supported_contract_version() {
    let outdated = MIN_SUPPORTED_CLIENT_CONTRACT_VERSION
        .saturating_sub(1)
        .to_string();
    let response = respond(get_with_headers(
        "/health/ready",
        &[("x-contract-version", &outdated)],
    ))
    .await;
    let body = body_as_text(response).await;

    assert!(
        body.contains("\"client_contract_outdated\":true"),
        "unexpected body: {body}"
    );
}

#[tokio::test]
async fn ready_does_not_flag_a_client_on_the_current_contract_version() {
    let current = crate::controllers::health::CONTRACT_VERSION.to_string();
    let response = respond(get_with_headers(
        "/health/ready",
        &[("x-contract-version", &current)],
    ))
    .await;
    let body = body_as_text(response).await;

    assert!(
        body.contains("\"client_contract_outdated\":false"),
        "unexpected body: {body}"
    );
}
