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
pub mod middleware;
pub mod models;
pub mod outbound;
pub mod routes;
pub mod schema;
pub mod sec;
pub mod shutdown;

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CodeRequest {
    pub code: String,
    #[serde(default, alias = "notebook_id")]
    pub notebook_id: Option<uuid::Uuid>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct CodeResponse {
    stdout: String,
    stderr: String,
}

#[tokio::main]
async fn main() {
    if std::env::args().nth(1).as_deref() == Some("export-openapi") {
        return export_openapi();
    }

    if std::env::args().nth(1).as_deref() == Some("export-ws-types") {
        return export_ws_types();
    }

    if std::env::args().nth(1).as_deref() == Some("export-error-codes") {
        return export_error_codes();
    }

    if let Err(error) = run().await {
        eprintln!("zeile-server failed to start: {error}");
        std::process::exit(1);
    }
}

fn export_openapi() {
    let docs = crate::routes::docs::get_api_docs();
    let json = docs
        .to_pretty_json()
        .expect("OpenApi struct always serializes to JSON");
    match std::env::args().nth(2) {
        Some(path) => std::fs::write(&path, json).unwrap_or_else(|e| {
            eprintln!("failed to write {path}: {e}");
            std::process::exit(1);
        }),
        None => println!("{json}"),
    }
}

fn export_ws_types() {
    use ts_rs::TS;

    let dir = std::env::args().nth(2).unwrap_or_else(|| ".".to_string());

    crate::models::ws_message::WsServerMessage::export_all_to(&dir).unwrap_or_else(|e| {
        eprintln!("failed to export WsServerMessage: {e}");
        std::process::exit(1);
    });
    crate::models::ws_message::WsClientMessage::export_all_to(&dir).unwrap_or_else(|e| {
        eprintln!("failed to export WsClientMessage: {e}");
        std::process::exit(1);
    });
}

fn export_error_codes() {
    let json = serde_json::to_string_pretty(crate::models::error::ALL_ERROR_CODES)
        .expect("&[&str] always serializes");
    match std::env::args().nth(2) {
        Some(path) => std::fs::write(&path, json).unwrap_or_else(|e| {
            eprintln!("failed to write {path}: {e}");
            std::process::exit(1);
        }),
        None => println!("{json}"),
    }
}

async fn run() -> Result<(), BootError> {
    crate::bootstrap::install_crypto_provider()?;
    crate::bootstrap::init_tracing();

    crate::sec::catalog::init();

    #[cfg(feature = "embedded-pg")]
    let _embedded_pg = crate::embedded_pg::ensure_running().await;

    let db_url = crate::bootstrap::database_url()?;

    crate::db_migrations::guard_against_migration_downgrade(&db_url)
        .map_err(BootError::MigrationDowngrade)?;
    crate::db_migrations::run_pending_migrations(&db_url).map_err(BootError::Migration)?;

    let pool = crate::bootstrap::build_pool(db_url.clone())?;
    let state = crate::bootstrap::build_state(pool)?;
    crate::bootstrap::spawn_background_tasks(&state, db_url);

    let app = crate::routes::build_router(state.clone())
        .await
        .layer(TraceLayer::new_for_http());

    let port = crate::bootstrap::port()?;
    let addr = format!("{}:{port}", crate::bootstrap::bind_host()?);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|source| BootError::Bind {
            addr: addr.clone(),
            source,
        })?;

    tracing::info!("Servidor rodando em http://{addr}");

    let signal = state.shutdown.clone();
    tokio::spawn(async move {
        crate::shutdown::wait_for_os_signal().await;
        signal.trigger(crate::shutdown::Reason::Signal);
    });

    let graceful = state.shutdown.clone();
    let mut server = tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .with_graceful_shutdown(async move { graceful.wait().await })
        .await
    });

    let served = tokio::select! {
        finished = &mut server => join_result(finished),
        _ = state.shutdown.wait() => {
            match tokio::time::timeout(crate::shutdown::grace_period(), server).await {
                Ok(finished) => join_result(finished),
                Err(_) => {
                    tracing::warn!("shutdown: grace period elapsed with connections still open");
                    Ok(())
                }
            }
        }
    };

    crate::shutdown::drain(&state).await;

    served.map_err(BootError::Serve)
}

fn join_result(
    finished: Result<std::io::Result<()>, tokio::task::JoinError>,
) -> std::io::Result<()> {
    match finished {
        Ok(result) => result,
        Err(join_error) => {
            tracing::error!("shutdown: a task do servidor encerrou de forma anormal: {join_error}");
            Ok(())
        }
    }
}
