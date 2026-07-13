use std::sync::Arc;

use axum::routing::{get, patch, post};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::template::{
        api_create_template, api_delete_template, api_get_template, api_list_my_templates,
        api_list_public_templates, api_publish_version, api_update_template_visibility,
    },
    models::state::AppState,
};

pub async fn template_routes() -> OpenApiRouter<Arc<AppState>> {
    OpenApiRouter::<Arc<AppState>>::new()
        .route("/", post(api_create_template))
        .route("/all", get(api_list_my_templates))
        .route("/all/public", get(api_list_public_templates))
        .route("/{id}", get(api_get_template).delete(api_delete_template))
        .route("/{id}/versions", post(api_publish_version))
        .route("/{id}/visibility", patch(api_update_template_visibility))
}
