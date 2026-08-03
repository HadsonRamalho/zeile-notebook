use std::sync::Arc;

use axum::routing::{delete, get, patch, post};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::{
        oauth::{
            api_auth_methods, api_link_callback, api_link_start, api_oauth_callback,
            api_oauth_login, api_unlink,
        },
        user::{
            api_delete_user, api_execute_password_reset, api_get_logged_user, api_login_user,
            api_logout, api_refresh_session, api_register_user, api_request_password_reset,
            api_update_user_data, api_update_user_password,
        },
    },
    models::state::AppState,
};

pub async fn user_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::new()
        .route("/me", get(api_get_logged_user))
        .route("/", delete(api_delete_user))
        .route(
            "/register",
            post(api_register_user).route_layer(crate::rate_limit!(
                "user-register",
                crate::middleware::rate_limit::REGISTER
            )),
        )
        .route(
            "/login",
            post(api_login_user).route_layer(crate::rate_limit!(
                "user-login",
                crate::middleware::rate_limit::LOGIN
            )),
        )
        .route(
            "/refresh",
            post(api_refresh_session).route_layer(crate::rate_limit!(
                "user-refresh",
                crate::middleware::rate_limit::REFRESH
            )),
        )
        .route("/logout", post(api_logout))
        .route("/update", patch(api_update_user_data))
        .route("/password", patch(api_update_user_password))
        .route(
            "/request-password-reset",
            post(api_request_password_reset).route_layer(crate::rate_limit!(
                "user-password-reset",
                crate::middleware::rate_limit::PASSWORD_RESET
            )),
        )
        .route(
            "/execute-password-reset",
            post(api_execute_password_reset).route_layer(crate::rate_limit!(
                "user-password-reset-execute",
                crate::middleware::rate_limit::PASSWORD_RESET
            )),
        )
        .route("/login/{provider}", get(api_oauth_login))
        .route("/auth/methods", get(api_auth_methods))
        .route("/link/{provider}", post(api_link_start).delete(api_unlink))
        .route("/link/{provider}/callback", get(api_link_callback))
        .route("/auth/callback/{provider}", get(api_oauth_callback));

    routes
}
