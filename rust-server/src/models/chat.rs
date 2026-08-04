use crate::models::error::ApiError;
use crate::schema::{chat_message_versions, chat_messages};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone)]
#[diesel(table_name = crate::schema::chat_messages)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub content: String,
    pub parent_id: Option<Uuid>,
    pub quoted_message_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct EditMessageRequest {
    pub content: String,
}

#[derive(Queryable, Selectable, Serialize, Debug)]
#[diesel(table_name = crate::schema::chat_message_versions)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageVersion {
    pub id: Uuid,
    pub message_id: Uuid,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = chat_message_versions)]
pub struct NewChatMessageVersion {
    pub id: Uuid,
    pub message_id: Uuid,
    pub content: String,
}

const CHAT_HISTORY_LIMIT: i64 = 500;

/// Hides the content of deleted messages before it leaves the backend, so the
/// original text of a soft-deleted message doesn't leak.
pub fn mask_deleted(mut message: ChatMessage) -> ChatMessage {
    if message.deleted_at.is_some() {
        message.content = String::new();
    }
    message
}

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

/// Resolves a reply's parent: validates scope and reparents to the thread
/// root (Slack's one-level model — a reply to a reply becomes a reply to the root).
pub async fn resolve_thread_parent(
    conn: &mut AsyncPgConnection,
    notebook_id: Option<Uuid>,
    team_id: Option<Uuid>,
    parent_id: Option<Uuid>,
) -> Result<Option<Uuid>, ApiError> {
    let Some(pid) = parent_id else {
        return Ok(None);
    };
    let parent = get_message(conn, pid).await?;
    if parent.notebook_id != notebook_id || parent.team_id != team_id {
        return Err(ApiError::Request("Mensagem pai inválida".to_string()));
    }
    Ok(Some(parent.parent_id.unwrap_or(parent.id)))
}

/// Valida que a mensagem citada existe e pertence ao mesmo chat.
pub async fn validate_quote(
    conn: &mut AsyncPgConnection,
    notebook_id: Option<Uuid>,
    team_id: Option<Uuid>,
    quoted_message_id: Option<Uuid>,
) -> Result<Option<Uuid>, ApiError> {
    let Some(qid) = quoted_message_id else {
        return Ok(None);
    };
    let quoted = get_message(conn, qid).await?;
    if quoted.notebook_id != notebook_id || quoted.team_id != team_id {
        return Err(ApiError::Request("Mensagem citada inválida".to_string()));
    }
    Ok(Some(qid))
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

pub async fn soft_delete_message(
    conn: &mut AsyncPgConnection,
    message_id: Uuid,
) -> Result<ChatMessage, ApiError> {
    diesel::update(chat_messages::table.find(message_id))
        .set(chat_messages::deleted_at.eq(Some(Utc::now())))
        .get_result::<ChatMessage>(conn)
        .await
        .map(mask_deleted)
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn create_message_version(
    conn: &mut AsyncPgConnection,
    message_id: Uuid,
    content: &str,
) -> Result<(), ApiError> {
    diesel::insert_into(chat_message_versions::table)
        .values(NewChatMessageVersion {
            id: Uuid::new_v4(),
            message_id,
            content: content.to_string(),
        })
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_message_versions(
    conn: &mut AsyncPgConnection,
    message_id: Uuid,
) -> Result<Vec<ChatMessageVersion>, ApiError> {
    chat_message_versions::table
        .filter(chat_message_versions::message_id.eq(message_id))
        .order(chat_message_versions::created_at.asc())
        .load::<ChatMessageVersion>(conn)
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
    Ok(rows.into_iter().map(mask_deleted).collect())
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
    Ok(rows.into_iter().map(mask_deleted).collect())
}
