use serde::{Deserialize, Serialize};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::controllers::utils::auto_delete_files;

pub mod controllers;
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

    let app = crate::routes::init_routes()
        .await
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3099").await.unwrap();

    tracing::info!("Servidor rodando em http://0.0.0.0:3099");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap();
}
