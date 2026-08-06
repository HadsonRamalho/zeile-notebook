use chrono::Utc;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::{chat_message_versions, chat_messages};

use super::entity::{ChatMessage, ChatMessageVersion, NewChatMessage, NewChatMessageVersion};
use super::service::mask_deleted;

const CHAT_HISTORY_LIMIT: i64 = 500;

pub async fn create_message(
    conn: &mut AsyncPgConnection,
    new_message: &NewChatMessage,
) -> Result<ChatMessage, ApiError> {
    diesel::insert_into(chat_messages::table)
        .values(new_message)
        .get_result::<ChatMessage>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn get_message(
    conn: &mut AsyncPgConnection,
    message_id: Uuid,
) -> Result<ChatMessage, ApiError> {
    chat_messages::table
        .find(message_id)
        .get_result::<ChatMessage>(conn)
        .await
        .map_err(ApiError::from)
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
        .map_err(ApiError::from)
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
        .map_err(ApiError::from)
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
        .map_err(ApiError::from)
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
        .map_err(ApiError::from)
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
        .map_err(ApiError::from)?;
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
        .map_err(ApiError::from)?;
    rows.reverse();
    Ok(rows.into_iter().map(mask_deleted).collect())
}
