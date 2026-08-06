use std::sync::Arc;

use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;

use crate::{domain::user::oauth::controller::api_auth_providers, models::state::AppState};

pub async fn auth_routes() -> OpenApiRouter<Arc<AppState>> {
    OpenApiRouter::new().route("/providers", get(api_auth_providers))
}
