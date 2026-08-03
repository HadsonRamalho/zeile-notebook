use axum::body::Body;
use axum::http::{Request, StatusCode, header};

use crate::middleware::rate_limit::LOGIN;
use crate::middleware::request_id::REQUEST_ID_HEADER;
use crate::routes::DEFAULT_BODY_LIMIT;
use crate::routes::test_support::{get, respond, router_with_unreachable_database};
use tower::ServiceExt;

fn post_json(path: &str, body: Vec<u8>) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .expect("request")
}

#[tokio::test]
async fn every_response_carries_a_request_id() {
    let response = respond(get("/health/live")).await;

    let id = response
        .headers()
        .get(&REQUEST_ID_HEADER)
        .expect("x-request-id in the response")
        .to_str()
        .expect("id in ascii")
        .to_string();

    assert!(!id.is_empty());
}

#[tokio::test]
async fn incoming_request_id_is_propagated() {
    let mut request = get("/health/live");
    request
        .headers_mut()
        .insert(REQUEST_ID_HEADER, "client-123".parse().expect("header"));

    let response = respond(request).await;

    assert_eq!(
        response
            .headers()
            .get(&REQUEST_ID_HEADER)
            .and_then(|v| v.to_str().ok()),
        Some("client-123")
    );
}

#[tokio::test]
async fn forged_request_id_is_replaced() {
    let mut request = get("/health/live");
    request.headers_mut().insert(
        REQUEST_ID_HEADER,
        "id\twith\tcontrol".parse().expect("header"),
    );

    let response = respond(request).await;
    let id = response
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .expect("id in the response");

    assert_ne!(id, "id\twith\tcontrol");
}

#[tokio::test]
async fn body_above_1mb_is_refused_on_a_common_route() {
    let body = vec![b'a'; DEFAULT_BODY_LIMIT + 1];

    let response = respond(post_json("/api/user/register", body)).await;

    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn content_route_accepts_more_than_the_default_limit() {
    let body = vec![b'a'; DEFAULT_BODY_LIMIT + 1];

    let request = Request::builder()
        .method("PUT")
        .uri("/api/notebook/00000000-0000-0000-0000-000000000000/content")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .expect("request");

    let response = respond(request).await;

    assert_ne!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn login_starts_responding_429_after_the_quota() {
    let router = router_with_unreachable_database().await;

    for _ in 0..LOGIN.max {
        let response = router
            .clone()
            .oneshot(post_json("/api/user/login", b"{}".to_vec()))
            .await
            .expect("response");

        assert_ne!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    }

    let response = router
        .oneshot(post_json("/api/user/login", b"{}".to_vec()))
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(response.headers().contains_key(header::RETRY_AFTER));
}

#[tokio::test]
async fn unknown_origin_does_not_get_cors_clearance() {
    let mut request = get("/health/live");
    request
        .headers_mut()
        .insert(header::ORIGIN, "https://attacker.test".parse().expect("h"));

    let response = respond(request).await;

    assert!(
        !response
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN)
    );
}
