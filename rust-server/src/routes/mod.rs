use crate::models::error::ApiError;
use crate::models::state::AppState;
use crate::routes::admin::admin_routes;
use crate::routes::challenge::challenge_routes;
use crate::routes::notebook::notebook_routes;
use crate::routes::run_rust::run_rust_routes;
use crate::routes::team::team_routes;
use crate::routes::user::user_routes;
use axum::{Json, Router};
use axum::{
    extract::DefaultBodyLimit,
    routing::{get, get_service, post},
};
use diesel::{ConnectionError, ConnectionResult};
use diesel_async::AsyncPgConnection;
use futures_util::FutureExt;
use futures_util::future::BoxFuture;
use hyper::StatusCode;
use rustls::ClientConfig;
use rustls_platform_verifier::ConfigVerifierExt;
use std::sync::Arc;
use tower_http::services::ServeDir;
use utoipa_axum::router::OpenApiRouter;

pub mod admin;
pub mod challenge;
pub mod docs;
#[cfg(test)]
mod health_test;
#[cfg(test)]
mod middleware_test;
pub mod notebook;
pub mod notifications;
#[cfg(test)]
mod rate_limit_global_test;

pub mod permissions;
pub mod run_rust;
#[cfg(test)]
mod run_rust_test;
#[cfg(test)]
mod shutdown_test;
pub mod team;
pub mod template;
#[cfg(test)]
mod test_support;
pub mod user;

pub async fn print_protected_route()
-> Result<(StatusCode, Json<String>), (StatusCode, Json<ApiError>)> {
    Ok((StatusCode::OK, Json("Protected route!".to_string())))
}

#[axum::debug_handler]
pub async fn print_common_route() -> Result<(StatusCode, Json<String>), (StatusCode, Json<ApiError>)>
{
    Ok((StatusCode::OK, Json("Common route!".to_string())))
}

pub fn database_tls_enabled() -> bool {
    match std::env::var("DATABASE_TLS") {
        Ok(v) => {
            let v = v.trim().to_ascii_lowercase();
            v != "off" && v != "0" && v != "false" && v != "no"
        }
        Err(_) => true,
    }
}

pub fn establish_connection(config: &str) -> BoxFuture<'_, ConnectionResult<AsyncPgConnection>> {
    let fut = async move {
        if database_tls_enabled() {
            let rustls_config = ClientConfig::with_platform_verifier();
            let tls = tokio_postgres_rustls::MakeRustlsConnect::new(rustls_config.unwrap());
            let (client, conn) = tokio_postgres::connect(config, tls)
                .await
                .map_err(|e| ConnectionError::BadConnection(e.to_string()))?;

            AsyncPgConnection::try_from_client_and_connection(client, conn).await
        } else {
            let (client, conn) = tokio_postgres::connect(config, tokio_postgres::NoTls)
                .await
                .map_err(|e| ConnectionError::BadConnection(e.to_string()))?;

            AsyncPgConnection::try_from_client_and_connection(client, conn).await
        }
    };
    fut.boxed()
}

pub const BODY_LIMIT_PADRAO: usize = 1024 * 1024;
pub const BODY_LIMIT_CONTEUDO: usize = 1024 * 1024 * 100;

pub async fn build_router(app_state: Arc<AppState>) -> Router {
    let app = OpenApiRouter::<Arc<AppState>>::new()
        .route("/common", get(print_common_route))
        .route(
            "/metrics",
            get(crate::controllers::metrics::metrics_handler),
        )
        .nest_service("/images", get_service(ServeDir::new("./images")));

    Router::new()
        .route("/health/live", get(crate::controllers::health::live))
        .route("/health/ready", get(crate::controllers::health::ready))
        .route(
            "/internal/shutdown",
            post(crate::controllers::shutdown::request_shutdown),
        )
        .nest("/api", app.into())
        .nest("/api", run_rust_routes().await.into())
        .nest("/api/user", user_routes().await.into())
        .nest("/api/notebook", notebook_routes().await.into())
        .nest("/api/team", team_routes().await.into())
        .nest(
            "/api/template",
            crate::routes::template::template_routes().await.into(),
        )
        .nest("/api/challenge", challenge_routes().await.into())
        .nest("/api/admin", admin_routes().await.into())
        .nest(
            "/api/notifications",
            crate::routes::notifications::notification_routes()
                .await
                .into(),
        )
        .nest(
            "/api/permissions",
            crate::routes::permissions::permissions_routes()
                .await
                .into(),
        )
        .merge(utoipa_swagger_ui::SwaggerUi::new("/docs").url(
            "/api-docs/openapi.json",
            crate::routes::docs::get_api_docs(),
        ))
        .with_state(app_state)
        .layer(DefaultBodyLimit::max(BODY_LIMIT_PADRAO))
        .layer(axum::middleware::from_fn(
            crate::middleware::rate_limit::enforce_global,
        ))
        .layer(crate::middleware::cors::cors_layer())
        .layer(axum::middleware::from_fn(
            crate::middleware::request_id::propagate,
        ))
}
