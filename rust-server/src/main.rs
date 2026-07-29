use serde::{Deserialize, Serialize};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::controllers::utils::auto_delete_files;

pub mod controllers;
pub mod db_migrations;
#[cfg(feature = "embedded-pg")]
pub mod embedded_pg;
pub mod executor;
pub mod file;
pub mod http;
pub mod models;
pub mod routes;
pub mod schema;
pub mod sec;

#[derive(Deserialize)]
pub struct CodeRequest {
    pub code: String,
    pub session_id: String,
    #[serde(default)]
    pub notebook_id: Option<uuid::Uuid>,
}

#[derive(Serialize)]
pub struct CodeResponse {
    stdout: String,
    stderr: String,
}

#[tokio::main]
async fn main() {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Falha ao instalar provedor de criptografia rustls");

    crate::sec::catalog::init();

    tokio::spawn(auto_delete_files());

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    #[cfg(feature = "embedded-pg")]
    let _embedded_pg = crate::embedded_pg::ensure_running().await;

    crate::db_migrations::run_pending_migrations();

    let app = crate::routes::init_routes()
        .await
        .layer(TraceLayer::new_for_http());

    // porta configurável por env (default 3099)
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3099);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .unwrap();

    tracing::info!("Servidor rodando em http://0.0.0.0:{port}");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}
