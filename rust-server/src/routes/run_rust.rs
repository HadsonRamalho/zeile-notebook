use std::sync::Arc;

use axum::routing::post;
use utoipa_axum::router::OpenApiRouter;

use crate::{
    http::{verify_cpp_request, verify_go_request, verify_request, verify_zig_request},
    models::state::AppState,
};

pub async fn run_rust_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::new()
        .route("/run", post(verify_request))
        .route("/run/go", post(verify_go_request))
        .route("/run/cpp", post(verify_cpp_request))
        .route("/run/zig", post(verify_zig_request));

    routes
}
