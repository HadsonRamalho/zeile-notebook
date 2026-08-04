use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::models::chat::ChatMessage;

#[derive(Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[serde(rename_all_fields = "camelCase")]
#[ts(export, export_to = "ws-message.ts")]
pub enum WsServerMessage {
    Init {
        user_id: Uuid,
    },
    PresenceBatch {
        updates: Vec<serde_json::Value>,
        gone: Vec<String>,
    },
    NotebookRestored,
    ChatMessage {
        message: ChatMessage,
    },
    CommentEvent {
        notebook_id: Uuid,
    },
    CapabilitiesUpdated,
}

#[derive(Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export, export_to = "ws-message.ts")]
pub enum WsClientMessage {
    Presence {
        #[serde(flatten)]
        data: serde_json::Value,
    },
    Chat {
        name: Option<String>,
        text: Option<String>,
    },
}
