use serde::{Deserialize, Serialize};
use tower_http::trace::TraceLayer;

use crate::bootstrap::BootError;

pub mod bootstrap;
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
    if let Err(error) = run().await {
        eprintln!("zeile-server não subiu: {error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), BootError> {
    crate::bootstrap::install_crypto_provider()?;
    crate::bootstrap::init_tracing();

    crate::sec::catalog::init();

    #[cfg(feature = "embedded-pg")]
    let _embedded_pg = crate::embedded_pg::ensure_running().await;

    let db_url = crate::bootstrap::database_url()?;

    crate::db_migrations::run_pending_migrations(&db_url).map_err(BootError::Migration)?;

    let pool = crate::bootstrap::build_pool(db_url.clone())?;
    let state = crate::bootstrap::build_state(pool)?;
    crate::bootstrap::spawn_background_tasks(&state, db_url);

    let app = crate::routes::build_router(state)
        .await
        .layer(TraceLayer::new_for_http());

    let port = crate::bootstrap::port()?;
    let addr = format!("0.0.0.0:{port}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|source| BootError::Bind {
            addr: addr.clone(),
            source,
        })?;

    tracing::info!("Servidor rodando em http://{addr}");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .map_err(BootError::Serve)
}
