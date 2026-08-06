use diesel_async::AsyncPgConnection;
use uuid::Uuid;

use crate::models::error::ApiError;

use super::entity::ChatMessage;
use super::repository::get_message;

/// Hides the content of deleted messages before it leaves the backend, so the
/// original text of a soft-deleted message doesn't leak.
pub fn mask_deleted(mut message: ChatMessage) -> ChatMessage {
    if message.deleted_at.is_some() {
        message.content = String::new();
    }
    message
}

pub async fn author_name(conn: &mut AsyncPgConnection, user_id: Uuid) -> String {
    crate::models::user::find_user_by_id(conn, &user_id)
        .await
        .map(|u| u.name)
        .unwrap_or_else(|_| "Usuário".to_string())
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
