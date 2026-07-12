use crate::controllers::sync::{PresenceRegistry, SyncRegistry};
use crate::controllers::utils::get_database_url_from_env;
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
    routing::{get, get_service},
};
use dashmap::DashMap;
use diesel::{ConnectionError, ConnectionResult};
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::pooled_connection::ManagerConfig;
use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Pool};
use futures_util::FutureExt;
use futures_util::future::BoxFuture;
use hyper::StatusCode;
use rustls::ClientConfig;
use rustls_platform_verifier::ConfigVerifierExt;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use utoipa_axum::router::OpenApiRouter;

pub mod admin;
pub mod challenge;
pub mod docs;
pub mod notebook;
pub mod notifications;
pub mod permissions;
pub mod run_rust;
pub mod team;
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

pub fn establish_connection(config: &str) -> BoxFuture<'_, ConnectionResult<AsyncPgConnection>> {
    let fut = async {
        let rustls_config = ClientConfig::with_platform_verifier();
        let tls = tokio_postgres_rustls::MakeRustlsConnect::new(rustls_config.unwrap());
        let (client, conn) = tokio_postgres::connect(config, tls)
            .await
            .map_err(|e| ConnectionError::BadConnection(e.to_string()))?;

        AsyncPgConnection::try_from_client_and_connection(client, conn).await
    };
    fut.boxed()
}

pub async fn init_routes() -> Router {
    let db_url = get_database_url_from_env().ok();

    let mut config = ManagerConfig::default();
    config.custom_setup = Box::new(establish_connection);

    let sync_registry: SyncRegistry = Arc::new(DashMap::new());
    let presence_registry: PresenceRegistry = Arc::new(DashMap::new());

    if let Some(db_url) = db_url {
        let db_url_listen = db_url.clone();
        let mgr =
            AsyncDieselConnectionManager::<AsyncPgConnection>::new_with_config(db_url, config);
        let pool = Pool::builder(mgr).max_size(50).build().unwrap();

        let judge_concurrency: usize = std::env::var("JUDGE_CONCURRENCY")
            .ok()
            .and_then(|v| v.parse().ok())
            .filter(|n| *n > 0)
            .unwrap_or(2);

        let app_state = Arc::new(AppState {
            presence_registry,
            pool,
            sync_registry,
            push: crate::controllers::push::load_push_state(),
            judge_semaphore: Arc::new(tokio::sync::Semaphore::new(judge_concurrency)),
        });

        // checkpoint periódico de notebooks ativos
        tokio::spawn(crate::controllers::websocket::checkpoint_loop(
            app_state.sync_registry.clone(),
            app_state.pool.clone(),
        ));

        {
            let pool = app_state.pool.clone();
            tokio::spawn(async move {
                match crate::models::notebook::backfill_search_text(&pool).await {
                    Ok(n) if n > 0 => tracing::info!("search_text backfill: {n} notebooks"),
                    Ok(_) => {}
                    Err(e) => tracing::warn!("search_text backfill falhou: {e}"),
                }
            });
        }

        // backplane multi-nó: escuta NOTIFY de mudança de capabilities de outros nós
        tokio::spawn(crate::controllers::permissions::caps_listen_loop(
            db_url_listen,
            app_state.presence_registry.clone(),
        ));

        let app = OpenApiRouter::<Arc<AppState>>::new()
            .route("/common", get(print_common_route))
            .route(
                "/metrics",
                get(crate::controllers::metrics::metrics_handler),
            )
            .nest_service("/images", get_service(ServeDir::new("./images")));

        return Router::new()
            .nest("/api", app.into())
            .nest("/api", run_rust_routes().await.into())
            .nest("/api/user", user_routes().await.into())
            .nest("/api/notebook", notebook_routes().await.into())
            .nest("/api/team", team_routes().await.into())
            .nest("/api/challenge", challenge_routes().await.into())
            .nest("/api/admin", admin_routes().await.into())
            .nest(
                "/api/notifications",
                crate::routes::notifications::notification_routes().await.into(),
            )
            .nest(
                "/api/permissions",
                crate::routes::permissions::permissions_routes().await.into(),
            )
            .merge(utoipa_swagger_ui::SwaggerUi::new("/docs").url(
                "/api-docs/openapi.json",
                crate::routes::docs::get_api_docs(),
            ))
            .with_state(app_state)
            .layer(DefaultBodyLimit::max(1024 * 1024 * 100))
            .layer(
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any),
            );
    }
    Router::new()
}
