use std::sync::Arc;

use axum::routing::{delete, get, patch, post};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::{
        oauth::{
            api_github_callback, api_github_login, api_link_github_callback, api_link_github_init,
        },
        user::{
            api_delete_user, api_execute_password_reset, api_get_logged_user, api_login_user,
            api_register_user, api_request_password_reset, api_update_user_data,
            api_update_user_password,
        },
    },
    models::state::AppState,
};

pub async fn user_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::new()
        .route("/me", get(api_get_logged_user))
        .route("/", delete(api_delete_user))
        .route("/register", post(api_register_user))
        .route("/login", post(api_login_user))
        .route("/update", patch(api_update_user_data))
        .route("/password", patch(api_update_user_password))
        .route("/request-password-reset", post(api_request_password_reset))
        .route("/execute-password-reset", post(api_execute_password_reset))
        .route("/login/github", get(api_github_login))
        .route("/link/github", get(api_link_github_init))
        .route("/link/github/callback", get(api_link_github_callback))
        .route("/auth/callback/github", get(api_github_callback));

    routes
}
