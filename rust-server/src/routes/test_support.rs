use axum::body::Body;
use axum::http::{Request, Response};
use http_body_util::BodyExt;
use tower::ServiceExt;

use crate::bootstrap;
use crate::routes::build_router;

static CRYPTO: std::sync::Once = std::sync::Once::new();

pub async fn router_and_state() -> (axum::Router, std::sync::Arc<crate::models::state::AppState>) {
    CRYPTO.call_once(|| {
        bootstrap::install_crypto_provider().expect("crypto provider");
    });

    let pool = bootstrap::build_pool(
        "postgres://user:password@127.0.0.1:1/database-that-does-not-exist".to_string(),
    )
    .expect("pool is lazy and must be built without connecting");

    let state = bootstrap::build_state(pool).expect("state");

    (build_router(state.clone()).await, state)
}

pub async fn router_with_unreachable_database() -> axum::Router {
    router_and_state().await.0
}

pub async fn respond(request: Request<Body>) -> Response<Body> {
    router_with_unreachable_database()
        .await
        .oneshot(request)
        .await
        .expect("response")
}

pub async fn body_as_text(response: Response<Body>) -> String {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();

    String::from_utf8_lossy(&bytes).to_string()
}

pub fn get(path: &str) -> Request<Body> {
    Request::builder()
        .uri(path)
        .body(Body::empty())
        .expect("request")
}

pub fn post_from(path: &str, peer: &str, headers: &[(&str, &str)]) -> Request<Body> {
    let peer: std::net::SocketAddr = peer.parse().expect("peer address");

    let mut builder = Request::builder()
        .method("POST")
        .uri(path)
        .extension(axum::extract::ConnectInfo(peer));

    for (name, value) in headers {
        builder = builder.header(*name, *value);
    }

    builder.body(Body::empty()).expect("request")
}
