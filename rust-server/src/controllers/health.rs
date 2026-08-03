use std::sync::Arc;

use axum::{Json, extract::State, http::HeaderMap, response::IntoResponse};
use diesel_async::RunQueryDsl;
use hyper::StatusCode;
use serde::Serialize;

use crate::models::state::AppState;

/// Current contract version this binary implements. Bump on any breaking
/// change to the REST/WS contract (DTO shape, enum values, error codes).
pub const CONTRACT_VERSION: u32 = 1;

/// Oldest client contract version this binary still serves without warning.
/// The deadline for the `serde alias` transition (Q29) is governed by the
/// same policy that moves this value.
pub const MIN_SUPPORTED_CLIENT_CONTRACT_VERSION: u32 = 1;

const CONTRACT_VERSION_HEADER: &str = "x-contract-version";

#[derive(Serialize)]
pub struct HealthStatus {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database: Option<&'static str>,
    pub contract_version: u32,
    pub min_supported_contract_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_contract_outdated: Option<bool>,
}

pub async fn live() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(HealthStatus {
            status: "live",
            database: None,
            contract_version: CONTRACT_VERSION,
            min_supported_contract_version: MIN_SUPPORTED_CLIENT_CONTRACT_VERSION,
            client_contract_outdated: None,
        }),
    )
}

pub async fn ready(State(state): State<Arc<AppState>>, headers: HeaderMap) -> impl IntoResponse {
    let client_contract_outdated = client_contract_version(&headers)
        .map(|version| version < MIN_SUPPORTED_CLIENT_CONTRACT_VERSION);

    if let Some(true) = client_contract_outdated {
        tracing::warn!(
            "health/ready: client contract version is below the minimum supported ({})",
            MIN_SUPPORTED_CLIENT_CONTRACT_VERSION
        );
    }

    match database_reachable(&state).await {
        Ok(()) => (
            StatusCode::OK,
            Json(HealthStatus {
                status: "ready",
                database: Some("up"),
                contract_version: CONTRACT_VERSION,
                min_supported_contract_version: MIN_SUPPORTED_CLIENT_CONTRACT_VERSION,
                client_contract_outdated,
            }),
        ),
        Err(error) => {
            tracing::warn!("health/ready: database unavailable: {error}");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(HealthStatus {
                    status: "not_ready",
                    database: Some("down"),
                    contract_version: CONTRACT_VERSION,
                    min_supported_contract_version: MIN_SUPPORTED_CLIENT_CONTRACT_VERSION,
                    client_contract_outdated,
                }),
            )
        }
    }
}

fn client_contract_version(headers: &HeaderMap) -> Option<u32> {
    headers
        .get(CONTRACT_VERSION_HEADER)?
        .to_str()
        .ok()?
        .parse()
        .ok()
}

async fn database_reachable(state: &AppState) -> Result<(), String> {
    let mut conn = state.pool.get().await.map_err(|e| e.to_string())?;

    diesel::sql_query("SELECT 1")
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
