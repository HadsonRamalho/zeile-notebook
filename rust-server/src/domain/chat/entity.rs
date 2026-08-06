use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

#[derive(
    Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema, ts_rs::TS,
)]
#[diesel(table_name = crate::schema::chat_messages)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "ws-message.ts", rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: Uuid,
    pub notebook_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub author_name: String,
    pub content: String,
    pub parent_id: Option<Uuid>,
    pub quoted_message_id: Option<Uuid>,
    pub is_edited: bool,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Default)]
#[diesel(table_name = crate::schema::chat_messages)]
pub struct NewChatMessage {
    pub id: Uuid,
    pub notebook_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub author_name: String,
    pub content: String,
    pub parent_id: Option<Uuid>,
    pub quoted_message_id: Option<Uuid>,
}

#[derive(Queryable, Selectable, Serialize, Debug, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::chat_message_versions)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageVersion {
    pub id: Uuid,
    pub message_id: Uuid,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::chat_message_versions)]
pub struct NewChatMessageVersion {
    pub id: Uuid,
    pub message_id: Uuid,
    pub content: String,
}
