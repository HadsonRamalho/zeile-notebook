use std::sync::Arc;

use axum::routing::post;
use utoipa_axum::router::OpenApiRouter;

use crate::{
    http::{verify_go_request, verify_request},
    models::state::AppState,
};

pub async fn run_rust_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::new()
        .route("/run", post(verify_request))
        .route("/run/go", post(verify_go_request));

    routes
}
