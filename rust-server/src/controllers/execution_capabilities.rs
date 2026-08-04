use axum::Json;
use hyper::StatusCode;

use crate::executor::capabilities::{CapabilitiesReport, capabilities_report};

#[utoipa::path(get, path = "/capabilities", responses((status = OK, body = CapabilitiesReport)))]
pub async fn api_get_execution_capabilities() -> (StatusCode, Json<CapabilitiesReport>) {
    (StatusCode::OK, Json(capabilities_report().clone()))
}
