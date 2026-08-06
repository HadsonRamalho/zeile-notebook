use std::sync::Arc;

use uuid::Uuid;

use crate::controllers::utils::get_conn;
use crate::models::state::AppState;

use super::entity::NewNotification;
use super::repository;

#[derive(Clone)]
pub struct NotificationInput {
    pub kind: String,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
    pub notebook_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
}

pub async fn deliver_notification(state: &Arc<AppState>, user_id: Uuid, input: &NotificationInput) {
    let (scope_kind, scope_id) = if let Some(nb) = input.notebook_id {
        ("notebook", Some(nb))
    } else if let Some(team) = input.team_id {
        ("team", Some(team))
    } else {
        ("global", None)
    };

    let is_chat = input.kind.starts_with("chat");

    if let Ok(mut conn) = get_conn(&state.pool).await {
        let prefs = repository::resolve_prefs(&mut conn, user_id, scope_kind, scope_id).await;

        if is_chat && !prefs.chat {
            return;
        }

        if prefs.inapp {
            let row = NewNotification {
                id: Uuid::new_v4(),
                user_id,
                kind: input.kind.clone(),
                title: input.title.clone(),
                body: input.body.clone(),
                url: input.url.clone(),
                notebook_id: input.notebook_id,
                team_id: input.team_id,
            };
            repository::create_notification(&mut conn, &row).await.ok();
        }

        if !prefs.push {
            return;
        }
    }

    let url = input.url.as_deref().unwrap_or("/");
    crate::domain::push::send_push_to_user(state, user_id, &input.title, &input.body, url).await;
}

pub fn spawn_deliver(state: Arc<AppState>, user_ids: Vec<Uuid>, input: NotificationInput) {
    if user_ids.is_empty() {
        return;
    }
    tokio::spawn(async move {
        for uid in user_ids {
            deliver_notification(&state, uid, &input).await;
        }
    });
}
