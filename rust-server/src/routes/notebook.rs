use std::sync::Arc;

use axum::routing::{delete, get, patch, post, put};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::{
        chat::{
            api_edit_notebook_message, api_list_notebook_message_versions,
            api_list_notebook_messages, api_send_notebook_message,
        },
        grants::{api_create_public_grant, api_delete_public_grant, api_list_public_grants},
        notebook::{
            api_clone_notebook, api_create_notebook, api_delete_notebook, api_get_notebooks,
            api_get_public_notebooks, api_get_single_notebook, api_get_single_notebook_with_blocks,
            api_rename_notebook, api_save_notebook_content, api_search_notebooks,
            api_update_notebook_visibility,
        },
        permissions::api_get_notebook_capabilities,
        push::{api_subscribe_push, api_unsubscribe_push},
        user::api_get_user_notebook_permissions,
        websocket::{websocket_combined_handler, websocket_handler, websocket_presence_handler},
    },
    models::state::AppState,
};

pub async fn notebook_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::<Arc<AppState>>::new()
        .route("/create", post(api_create_notebook))
        .route("/{id}/title", patch(api_rename_notebook))
        .route("/{id}", delete(api_delete_notebook))
        .route("/{id}", get(api_get_single_notebook))
        .route("/{id}/full", get(api_get_single_notebook_with_blocks))
        .route("/{id}/content", put(api_save_notebook_content))
        .route("/{id}/clone", post(api_clone_notebook))
        .route("/{id}/visibility", patch(api_update_notebook_visibility))
        .route("/{id}/permissions", get(api_get_user_notebook_permissions))
        .route("/{id}/capabilities", get(api_get_notebook_capabilities))
        .route(
            "/{id}/public-grants",
            get(api_list_public_grants).post(api_create_public_grant),
        )
        .route(
            "/{id}/public-grants/{grant_id}",
            delete(api_delete_public_grant),
        )
        .route(
            "/{id}/chat/messages",
            get(api_list_notebook_messages).post(api_send_notebook_message),
        )
        .route(
            "/{id}/chat/messages/{message_id}",
            patch(api_edit_notebook_message),
        )
        .route(
            "/{id}/chat/messages/{message_id}/versions",
            get(api_list_notebook_message_versions),
        )
        .route("/search/", get(api_search_notebooks))
        .route("/ws/{notebook_id}", get(websocket_handler))
        .route("/ws/presence/{id}", get(websocket_presence_handler))
        // socket combinado: sync + presença numa conexão
        .route("/ws/combined/{notebook_id}", get(websocket_combined_handler))
        .route("/all", get(api_get_notebooks))
        .route("/all/public", get(api_get_public_notebooks))
        .route(
            "/push/subscribe",
            post(api_subscribe_push).delete(api_unsubscribe_push),
        );

    routes
}
