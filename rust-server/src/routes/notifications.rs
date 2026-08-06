use std::sync::Arc;

use axum::routing::{delete, get, post};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    domain::notifications::controller::{
        api_delete_notification, api_list_notifications, api_list_preferences, api_mark_all_read,
        api_mark_notification_read, api_upsert_preference,
    },
    models::state::AppState,
};

pub async fn notification_routes() -> OpenApiRouter<Arc<AppState>> {
    OpenApiRouter::<Arc<AppState>>::new()
        .route("/", get(api_list_notifications))
        .route("/read-all", post(api_mark_all_read))
        .route(
            "/preferences",
            get(api_list_preferences).put(api_upsert_preference),
        )
        .route("/{id}/read", post(api_mark_notification_read))
        .route("/{id}", delete(api_delete_notification))
}
