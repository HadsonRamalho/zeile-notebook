use axum::http::StatusCode;

use crate::routes::test_support::{get, respond};

async fn destination(path: &str) -> (StatusCode, String) {
    let response = respond(get(path)).await;
    let status = response.status();
    let location = response
        .headers()
        .get("location")
        .map(|value| value.to_str().unwrap_or_default().to_string())
        .unwrap_or_default();

    (status, location)
}

#[tokio::test]
async fn github_routes_stay_at_the_same_path() {
    for path in [
        "/api/user/login/github",
        "/api/user/link/github",
        "/api/user/link/github/callback?code=x&state=y",
        "/api/user/auth/callback/github?code=x&state=y",
    ] {
        let (status, _) = destination(path).await;

        assert_ne!(
            status,
            StatusCode::NOT_FOUND,
            "callback registered on the GitHub App would stop existing: {path}"
        );
    }
}

#[tokio::test]
async fn unknown_provider_redirects_back_to_login_with_an_error() {
    let (status, location) = destination("/api/user/login/gitlab").await;

    assert_eq!(status, StatusCode::SEE_OTHER);
    assert!(
        location.contains("auth_error=unknown_provider"),
        "unexpected destination: {location}"
    );
}

#[tokio::test]
async fn callback_of_an_unknown_provider_never_reaches_the_database() {
    let (status, location) = destination("/api/user/auth/callback/gitlab?code=x&state=y").await;

    assert_eq!(status, StatusCode::SEE_OTHER);
    assert!(
        location.contains("auth_error=unknown_provider"),
        "unexpected destination: {location}"
    );
}

#[tokio::test]
async fn the_provider_list_is_public() {
    let response = respond(get("/api/auth/providers")).await;

    assert_eq!(response.status(), StatusCode::OK);

    let body = crate::routes::test_support::body_as_text(response).await;
    assert!(body.contains("\"providers\""), "unexpected body: {body}");
}

#[tokio::test]
async fn starting_a_link_without_a_session_is_not_allowed() {
    let response = respond(
        axum::http::Request::builder()
            .method("POST")
            .uri("/api/user/link/google")
            .body(axum::body::Body::empty())
            .expect("request"),
    )
    .await;

    assert_ne!(response.status(), StatusCode::OK);
    assert_ne!(response.status(), StatusCode::SEE_OTHER);
}

#[tokio::test]
async fn unlinking_without_a_session_is_not_allowed() {
    let response = respond(
        axum::http::Request::builder()
            .method("DELETE")
            .uri("/api/user/link/google")
            .body(axum::body::Body::empty())
            .expect("request"),
    )
    .await;

    assert_ne!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn callback_without_a_valid_state_does_not_exchange_the_code() {
    let (status, location) =
        destination("/api/user/auth/callback/google?code=x&state=forged").await;

    assert_eq!(status, StatusCode::SEE_OTHER);
    assert!(
        location.contains("auth_error="),
        "callback without state should redirect back with an error: {location}"
    );
}

#[tokio::test]
async fn the_google_route_exists() {
    for path in [
        "/api/user/login/google",
        "/api/user/link/google/callback?code=x&state=y",
        "/api/user/auth/callback/google?code=x&state=y",
    ] {
        let (status, _) = destination(path).await;

        assert_ne!(status, StatusCode::NOT_FOUND, "missing route: {path}");
    }
}
