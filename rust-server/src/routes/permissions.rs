use std::sync::Arc;

use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;

use crate::{controllers::permissions::api_get_permission_catalog, models::state::AppState};

pub async fn permissions_routes() -> OpenApiRouter<Arc<AppState>> {
    OpenApiRouter::new().route("/catalog", get(api_get_permission_catalog))
}
