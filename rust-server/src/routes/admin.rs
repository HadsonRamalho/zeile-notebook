use crate::{
    controllers::admin::{
        api_admin_notify, api_admin_search, api_get_admin_notebooks, api_get_admin_stats,
        api_get_admin_teams, api_get_admin_users,
    },
    models::state::AppState,
};
use axum::routing::{get, post};
use std::sync::Arc;
use utoipa_axum::router::OpenApiRouter;

pub async fn admin_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::new()
        .route("/stats", get(api_get_admin_stats))
        .route("/users", get(api_get_admin_users))
        .route("/teams", get(api_get_admin_teams))
        .route("/notebooks", get(api_get_admin_notebooks))
        .route("/search", get(api_admin_search))
        .route("/notify", post(api_admin_notify));

    routes
}
