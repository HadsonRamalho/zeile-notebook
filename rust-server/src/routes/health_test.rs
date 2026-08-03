use axum::http::StatusCode;

use crate::routes::test_support::{body_as_text, get, respond};

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
