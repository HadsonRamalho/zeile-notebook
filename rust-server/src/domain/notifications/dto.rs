use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::entity::Notification;

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsResponse {
    pub items: Vec<Notification>,
    pub unread_count: i64,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPreferenceRequest {
    pub scope_kind: String,
    pub scope_id: Option<Uuid>,
    pub push_enabled: bool,
    pub inapp_enabled: bool,
    pub chat_enabled: bool,
}
