use std::sync::Arc;

use axum::routing::{delete, get, post};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::notifications::{
        api_delete_notification, api_list_notifications, api_mark_all_read,
        api_mark_notification_read,
    },
    models::state::AppState,
};

pub async fn notification_routes() -> OpenApiRouter<Arc<AppState>> {
    OpenApiRouter::<Arc<AppState>>::new()
        .route("/", get(api_list_notifications))
        .route("/read-all", post(api_mark_all_read))
        .route("/{id}/read", post(api_mark_notification_read))
        .route("/{id}", delete(api_delete_notification))
}
