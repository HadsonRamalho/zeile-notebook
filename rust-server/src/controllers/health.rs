use std::sync::Arc;

use axum::{Json, extract::State, response::IntoResponse};
use diesel_async::RunQueryDsl;
use hyper::StatusCode;
use serde::Serialize;

use crate::models::state::AppState;

#[derive(Serialize)]
pub struct HealthStatus {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database: Option<&'static str>,
}

pub async fn live() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(HealthStatus {
            status: "live",
            database: None,
        }),
    )
}

pub async fn ready(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match database_reachable(&state).await {
        Ok(()) => (
            StatusCode::OK,
            Json(HealthStatus {
                status: "ready",
                database: Some("up"),
            }),
        ),
        Err(error) => {
            tracing::warn!("health/ready: banco indisponível: {error}");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(HealthStatus {
                    status: "not_ready",
                    database: Some("down"),
                }),
            )
        }
    }
}

async fn database_reachable(state: &AppState) -> Result<(), String> {
    let mut conn = state.pool.get().await.map_err(|e| e.to_string())?;

    diesel::sql_query("SELECT 1")
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
