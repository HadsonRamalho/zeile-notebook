use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use tower::ServiceExt;

use crate::middleware::rate_limit::JUDGE;
use crate::routes::test_support::{body_as_text, get, respond, router_with_unreachable_database};

const ROUTES: [&str; 4] = ["/api/run", "/api/run/go", "/api/run/cpp", "/api/run/zig"];

fn submission(path: &str, peer: &str) -> Request<Body> {
    let peer: std::net::SocketAddr = peer.parse().expect("peer address");

    Request::builder()
        .method("POST")
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .extension(axum::extract::ConnectInfo(peer))
        .body(Body::from(br#"{"code":"fn main(){}"}"#.to_vec()))
        .expect("request")
}

#[tokio::test]
async fn the_session_is_derived_from_the_user_and_the_notebook() {
    let user = uuid::Uuid::new_v4();
    let notebook = uuid::Uuid::new_v4();

    let session = crate::http::execution_session(user, notebook);

    assert!(
        session.chars().all(|c| c.is_alphanumeric() || c == '_'),
        "session must be safe as a directory name: {session}"
    );
    assert_eq!(
        session,
        crate::http::execution_session(user, notebook),
        "the session must be stable for the Rust module to persist across requests"
    );
    assert_ne!(
        session,
        crate::http::execution_session(user, uuid::Uuid::new_v4()),
        "different notebooks cannot share a workspace"
    );
    assert_ne!(
        session,
        crate::http::execution_session(uuid::Uuid::new_v4(), notebook),
        "different users cannot share a workspace"
    );
}

#[tokio::test]
async fn the_session_never_collides_with_the_judges_workspace() {
    let session = crate::http::execution_session(uuid::Uuid::new_v4(), uuid::Uuid::new_v4());

    for prefix in ["judge_ref_", "judge_sub_", "run_"] {
        assert!(
            !session.starts_with(prefix),
            "the /api/run session invaded the judge's space ({prefix}): {session}"
        );
    }
}

#[tokio::test]
async fn anonymous_execution_is_refused_in_every_language() {
    for route in ROUTES {
        let response = respond(submission(route, "10.0.0.1:5000")).await;
        let body = body_as_text(response).await;

        assert!(
            body.contains("autenticado"),
            "{route} accepted anonymous execution: {body}"
        );
        assert!(
            body.contains("\"status\":\"unauthenticated\""),
            "{route} did not report a structured status: {body}"
        );
        assert!(
            body.contains("\"errorCode\":\"NOT_AUTHENTICATED\""),
            "{route} did not report a stable errorCode: {body}"
        );
    }
}

#[tokio::test]
async fn execution_without_a_notebook_is_refused() {
    let peer: std::net::SocketAddr = "10.0.0.2:5000".parse().expect("peer");

    let request = Request::builder()
        .method("POST")
        .uri("/api/run")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, "Bearer invalid-token")
        .extension(axum::extract::ConnectInfo(peer))
        .body(Body::from(br#"{"code":"fn main(){}"}"#.to_vec()))
        .expect("request");

    let body = body_as_text(respond(request).await).await;

    assert!(
        body.contains("autenticado") || body.contains("notebook"),
        "execution without a notebook was not blocked: {body}"
    );
}

#[tokio::test]
async fn execution_routes_have_a_rate_limit() {
    let router = router_with_unreachable_database().await;
    let peer = "10.0.0.3:5000";

    for _ in 0..JUDGE.max {
        let response = router
            .clone()
            .oneshot(submission("/api/run/go", peer))
            .await
            .expect("response");

        assert_ne!(
            response.status(),
            StatusCode::TOO_MANY_REQUESTS,
            "the rate limit fired before the ceiling of {} requests",
            JUDGE.max
        );
    }

    let over_the_limit = router
        .oneshot(submission("/api/run/go", peer))
        .await
        .expect("response");

    assert_eq!(over_the_limit.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn execution_rate_limit_is_per_language_and_per_origin() {
    let router = router_with_unreachable_database().await;

    for _ in 0..JUDGE.max {
        let _ = router
            .clone()
            .oneshot(submission("/api/run/cpp", "10.0.0.4:5000"))
            .await
            .expect("response");
    }

    let other_origin = router
        .clone()
        .oneshot(submission("/api/run/cpp", "10.0.0.5:5000"))
        .await
        .expect("response");

    assert_ne!(
        other_origin.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "one origin's limit leaked into another"
    );

    let other_route = router
        .oneshot(submission("/api/run/zig", "10.0.0.4:5000"))
        .await
        .expect("response");

    assert_ne!(
        other_route.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "one language's limit leaked into another"
    );
}

#[tokio::test]
async fn capabilities_reports_one_entry_per_execution_language_and_needs_no_auth() {
    let response = respond(get("/api/capabilities")).await;

    assert_eq!(response.status(), StatusCode::OK);

    let body = body_as_text(response).await;
    for language in ["rust", "go", "cpp", "zig"] {
        assert!(
            body.contains(&format!("\"language\":\"{language}\"")),
            "missing {language} in {body}"
        );
    }
}
