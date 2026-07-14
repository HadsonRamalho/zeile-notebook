use std::sync::Arc;

use axum::routing::{delete, get, patch, post, put};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::{
        activity::{api_list_activity, api_record_edit},
        chat::{
            api_delete_notebook_message, api_edit_notebook_message,
            api_list_notebook_message_versions, api_list_notebook_messages,
            api_send_notebook_message,
        },
        comments::{
            api_create_thread, api_delete_comment, api_list_comments, api_reply,
            api_update_thread,
        },
        folder::{
            api_create_folder, api_delete_folder, api_list_folders,
            api_move_notebook_to_folder, api_rename_folder, api_update_folder_tags,
        },
        grants::{api_create_public_grant, api_delete_public_grant, api_list_public_grants},
        notebook::{
            api_clone_notebook, api_create_notebook, api_delete_notebook, api_get_notebooks,
            api_get_public_notebooks, api_get_single_notebook, api_get_single_notebook_with_blocks,
            api_rename_notebook, api_save_notebook_content, api_search_notebooks,
            api_search_notebooks_ranked, api_update_notebook_tags, api_update_notebook_visibility,
        },
        permissions::api_get_notebook_capabilities,
        push::{api_subscribe_push, api_unsubscribe_push},
        snapshots::{
            api_create_snapshot, api_delete_snapshot, api_list_snapshots,
            api_restore_snapshot,
        },
        user::api_get_user_notebook_permissions,
        websocket::{websocket_combined_handler, websocket_handler, websocket_presence_handler},
    },
    models::state::AppState,
};

pub async fn notebook_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::<Arc<AppState>>::new()
        .route("/create", post(api_create_notebook))
        .route("/folders", get(api_list_folders).post(api_create_folder))
        .route(
            "/folders/{folder_id}",
            patch(api_rename_folder).delete(api_delete_folder),
        )
        .route("/folders/{folder_id}/tags", patch(api_update_folder_tags))
        .route("/{id}/folder", patch(api_move_notebook_to_folder))
        .route("/{id}/tags", patch(api_update_notebook_tags))
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
            patch(api_edit_notebook_message).delete(api_delete_notebook_message),
        )
        .route(
            "/{id}/chat/messages/{message_id}/versions",
            get(api_list_notebook_message_versions),
        )
        .route(
            "/{id}/comments",
            get(api_list_comments).post(api_create_thread),
        )
        .route(
            "/{id}/comments/threads/{thread_id}/replies",
            post(api_reply),
        )
        .route(
            "/{id}/comments/threads/{thread_id}",
            patch(api_update_thread),
        )
        .route("/{id}/comments/{comment_id}", delete(api_delete_comment))
        .route(
            "/{id}/activity",
            get(api_list_activity).post(api_record_edit),
        )
        .route(
            "/{id}/snapshots",
            get(api_list_snapshots).post(api_create_snapshot),
        )
        .route(
            "/{id}/snapshots/{snapshot_id}/restore",
            post(api_restore_snapshot),
        )
        .route(
            "/{id}/snapshots/{snapshot_id}",
            delete(api_delete_snapshot),
        )
        .route("/search/", get(api_search_notebooks))
        .route("/search/ranked/", get(api_search_notebooks_ranked))
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
