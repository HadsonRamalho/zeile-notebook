use std::sync::Arc;

use axum::routing::post;
use utoipa_axum::router::OpenApiRouter;

use crate::{
    http::{verify_cpp_request, verify_go_request, verify_request, verify_zig_request},
    models::state::AppState,
};

pub async fn run_rust_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::new()
        .route(
            "/run",
            post(verify_request).route_layer(crate::rate_limit!(
                "run-rust",
                crate::middleware::rate_limit::JUDGE
            )),
        )
        .route(
            "/run/go",
            post(verify_go_request).route_layer(crate::rate_limit!(
                "run-go",
                crate::middleware::rate_limit::JUDGE
            )),
        )
        .route(
            "/run/cpp",
            post(verify_cpp_request).route_layer(crate::rate_limit!(
                "run-cpp",
                crate::middleware::rate_limit::JUDGE
            )),
        )
        .route(
            "/run/zig",
            post(verify_zig_request).route_layer(crate::rate_limit!(
                "run-zig",
                crate::middleware::rate_limit::JUDGE
            )),
        );

    routes
}
