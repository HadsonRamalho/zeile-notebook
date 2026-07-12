use crate::models::error::ApiError;
use crate::schema::chat_messages;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone)]
#[diesel(table_name = crate::schema::chat_messages)]
pub struct ChatMessage {
    pub id: Uuid,
    #[serde(rename = "notebookId")]
    pub notebook_id: Option<Uuid>,
    #[serde(rename = "teamId")]
    pub team_id: Option<Uuid>,
    #[serde(rename = "userId")]
    pub user_id: Option<Uuid>,
    #[serde(rename = "authorName")]
    pub author_name: String,
    pub content: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<Uuid>,
    #[serde(rename = "quotedMessageId")]
    pub quoted_message_id: Option<Uuid>,
    #[serde(rename = "isEdited")]
    pub is_edited: bool,
    #[serde(rename = "editedAt")]
    pub edited_at: Option<DateTime<Utc>>,
    #[serde(rename = "deletedAt")]
    pub deleted_at: Option<DateTime<Utc>>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Default)]
#[diesel(table_name = chat_messages)]
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

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub content: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<Uuid>,
    #[serde(rename = "quotedMessageId")]
    pub quoted_message_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct EditMessageRequest {
    pub content: String,
}

const CHAT_HISTORY_LIMIT: i64 = 500;

pub async fn create_message(
    conn: &mut AsyncPgConnection,
    new_message: &NewChatMessage,
) -> Result<ChatMessage, ApiError> {
    diesel::insert_into(chat_messages::table)
        .values(new_message)
        .get_result::<ChatMessage>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn get_message(
    conn: &mut AsyncPgConnection,
    message_id: Uuid,
) -> Result<ChatMessage, ApiError> {
    chat_messages::table
        .find(message_id)
        .get_result::<ChatMessage>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn update_message_content(
    conn: &mut AsyncPgConnection,
    message_id: Uuid,
    new_content: &str,
) -> Result<ChatMessage, ApiError> {
    diesel::update(chat_messages::table.find(message_id))
        .set((
            chat_messages::content.eq(new_content),
            chat_messages::is_edited.eq(true),
            chat_messages::edited_at.eq(Some(Utc::now())),
        ))
        .get_result::<ChatMessage>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_notebook_messages(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
) -> Result<Vec<ChatMessage>, ApiError> {
    let mut rows = chat_messages::table
        .filter(chat_messages::notebook_id.eq(notebook_id))
        .order(chat_messages::created_at.desc())
        .limit(CHAT_HISTORY_LIMIT)
        .load::<ChatMessage>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;
    rows.reverse();
    Ok(rows)
}

pub async fn list_team_messages(
    conn: &mut AsyncPgConnection,
    team_id: Uuid,
) -> Result<Vec<ChatMessage>, ApiError> {
    let mut rows = chat_messages::table
        .filter(chat_messages::team_id.eq(team_id))
        .order(chat_messages::created_at.desc())
        .limit(CHAT_HISTORY_LIMIT)
        .load::<ChatMessage>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;
    rows.reverse();
    Ok(rows)
}
