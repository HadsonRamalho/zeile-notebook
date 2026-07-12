use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;

use crate::{
    controllers::{
        jwt::extract_claims_from_header,
        notifications::{NotificationInput, deliver_notification},
        permissions::{TargetCtx, member_has_capability, require, require_team_permission},
        utils::get_conn,
        websocket::{broadcast_chat_and_notify, is_user_present},
    },
    models::{
        self,
        chat::{
            ChatMessage, ChatMessageVersion, EditMessageRequest, NewChatMessage,
            SendMessageRequest,
        },
        error::ApiError,
        state::AppState,
    },
};

fn message_event(message: &ChatMessage) -> String {
    serde_json::json!({ "type": "chat_message", "message": message }).to_string()
}

async fn author_name(conn: &mut diesel_async::AsyncPgConnection, user_id: Uuid) -> String {
    models::user::find_user_by_id(conn, &user_id)
        .await
        .map(|u| u.name)
        .unwrap_or_else(|_| "Usuário".to_string())
}

pub async fn api_list_notebook_messages(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<ChatMessage>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await.ok().map(|c| c.1.id);

    require(
        &state.pool,
        user_id,
        notebook_id,
        "chat.view",
        &TargetCtx::default(),
    )
    .await?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let messages = models::chat::list_notebook_messages(conn, notebook_id).await?;
    Ok((StatusCode::OK, Json(messages)))
}

pub async fn api_send_notebook_message(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<ChatMessage>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "chat.messages.send",
        &TargetCtx::default(),
    )
    .await?;

    if payload.parent_id.is_some() {
        require(
            &state.pool,
            Some(user_id),
            notebook_id,
            "chat.messages.reply",
            &TargetCtx::default(),
        )
        .await?;
    }
    if payload.quoted_message_id.is_some() {
        require(
            &state.pool,
            Some(user_id),
            notebook_id,
            "chat.messages.quote",
            &TargetCtx::default(),
        )
        .await?;
    }

    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(ApiError::Request("Mensagem vazia".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let name = author_name(conn, user_id).await;

    let parent_id =
        models::chat::resolve_thread_parent(conn, Some(notebook_id), None, payload.parent_id)
            .await?;
    let quoted_message_id =
        models::chat::validate_quote(conn, Some(notebook_id), None, payload.quoted_message_id)
            .await?;

    let new_message = NewChatMessage {
        id: Uuid::new_v4(),
        notebook_id: Some(notebook_id),
        user_id: Some(user_id),
        author_name: name.clone(),
        content: content.clone(),
        parent_id,
        quoted_message_id,
        ..Default::default()
    };

    let message = models::chat::create_message(conn, &new_message).await?;

    broadcast_chat_and_notify(
        &state,
        notebook_id,
        message_event(&message),
        Some(&content),
        Some(&name),
        Some(user_id),
    );

    // notifica o dono do notebook (fora do caminho da request) se ele não estiver
    // presente na sala no momento
    {
        let state = state.clone();
        let sender_name = name.clone();
        let body = content.clone();
        tokio::spawn(async move {
            let Ok(mut conn) = get_conn(&state.pool).await else {
                return;
            };
            let Ok(notebook) = models::notebook::find_notebook_by_id(&mut conn, &notebook_id).await
            else {
                return;
            };
            let Some(owner_id) = notebook.user_id else {
                return;
            };
            if owner_id == user_id
                || is_user_present(&state.presence_registry, notebook_id, owner_id)
            {
                return;
            }
            deliver_notification(
                &state,
                owner_id,
                &NotificationInput {
                    kind: "chat_notebook".to_string(),
                    title: format!("{} no chat de {}", sender_name, notebook.title),
                    body,
                    url: Some(format!("/notebook/{}", notebook_id)),
                    notebook_id: Some(notebook_id),
                    team_id: None,
                },
            )
            .await;
        });
    }

    Ok((StatusCode::CREATED, Json(message)))
}

pub async fn api_edit_notebook_message(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, message_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(payload): Json<EditMessageRequest>,
) -> Result<(StatusCode, Json<ChatMessage>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "chat.messages.edit",
        &TargetCtx::default(),
    )
    .await?;

    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(ApiError::Request("Mensagem vazia".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let existing = models::chat::get_message(conn, message_id).await?;
    if existing.notebook_id != Some(notebook_id) {
        return Err(ApiError::Request("Mensagem não pertence a este chat".to_string()));
    }
    if existing.user_id != Some(user_id) {
        return Err(ApiError::PermissionDenied("chat.messages.edit".to_string()));
    }
    if existing.deleted_at.is_some() {
        return Err(ApiError::Request("Mensagem excluída".to_string()));
    }
    if existing.content == content {
        return Ok((StatusCode::OK, Json(existing)));
    }

    models::chat::create_message_version(conn, message_id, &existing.content).await?;
    let updated = models::chat::update_message_content(conn, message_id, &content).await?;

    broadcast_chat_and_notify(
        &state,
        notebook_id,
        message_event(&updated),
        None,
        None,
        None,
    );

    Ok((StatusCode::OK, Json(updated)))
}

pub async fn api_edit_team_message(
    State(state): State<Arc<AppState>>,
    Path((team_id, message_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(payload): Json<EditMessageRequest>,
) -> Result<(StatusCode, Json<ChatMessage>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(ApiError::Request("Mensagem vazia".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "chat.messages.edit").await?;

    let existing = models::chat::get_message(conn, message_id).await?;
    if existing.team_id != Some(team_id) {
        return Err(ApiError::Request("Mensagem não pertence a este chat".to_string()));
    }
    if existing.user_id != Some(user_id) {
        return Err(ApiError::PermissionDenied("chat.messages.edit".to_string()));
    }
    if existing.deleted_at.is_some() {
        return Err(ApiError::Request("Mensagem excluída".to_string()));
    }
    if existing.content == content {
        return Ok((StatusCode::OK, Json(existing)));
    }

    models::chat::create_message_version(conn, message_id, &existing.content).await?;
    let updated = models::chat::update_message_content(conn, message_id, &content).await?;
    Ok((StatusCode::OK, Json(updated)))
}

pub async fn api_delete_notebook_message(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, message_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<ChatMessage>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let existing = models::chat::get_message(conn, message_id).await?;
    if existing.notebook_id != Some(notebook_id) {
        return Err(ApiError::Request("Mensagem não pertence a este chat".to_string()));
    }

    let delete_key = if existing.user_id == Some(user_id) {
        "chat.messages.delete"
    } else {
        "chat.messages.delete_any"
    };
    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        delete_key,
        &TargetCtx::default(),
    )
    .await?;

    let deleted = models::chat::soft_delete_message(conn, message_id).await?;

    broadcast_chat_and_notify(
        &state,
        notebook_id,
        message_event(&deleted),
        None,
        None,
        None,
    );

    Ok((StatusCode::OK, Json(deleted)))
}

pub async fn api_delete_team_message(
    State(state): State<Arc<AppState>>,
    Path((team_id, message_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<ChatMessage>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let existing = models::chat::get_message(conn, message_id).await?;
    if existing.team_id != Some(team_id) {
        return Err(ApiError::Request("Mensagem não pertence a este chat".to_string()));
    }

    let delete_key = if existing.user_id == Some(user_id) {
        "chat.messages.delete"
    } else {
        "chat.messages.delete_any"
    };
    require_team_permission(conn, user_id, team_id, delete_key).await?;

    let deleted = models::chat::soft_delete_message(conn, message_id).await?;
    Ok((StatusCode::OK, Json(deleted)))
}

pub async fn api_list_notebook_message_versions(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, message_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<ChatMessageVersion>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await.ok().map(|c| c.1.id);

    require(
        &state.pool,
        user_id,
        notebook_id,
        "chat.view",
        &TargetCtx::default(),
    )
    .await?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let existing = models::chat::get_message(conn, message_id).await?;
    if existing.notebook_id != Some(notebook_id) {
        return Err(ApiError::Request("Mensagem não pertence a este chat".to_string()));
    }

    let versions = models::chat::list_message_versions(conn, message_id).await?;
    Ok((StatusCode::OK, Json(versions)))
}

pub async fn api_list_team_message_versions(
    State(state): State<Arc<AppState>>,
    Path((team_id, message_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<ChatMessageVersion>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "chat.team.access").await?;

    let existing = models::chat::get_message(conn, message_id).await?;
    if existing.team_id != Some(team_id) {
        return Err(ApiError::Request("Mensagem não pertence a este chat".to_string()));
    }

    let versions = models::chat::list_message_versions(conn, message_id).await?;
    Ok((StatusCode::OK, Json(versions)))
}

pub async fn api_list_team_messages(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<ChatMessage>>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "chat.team.access").await?;

    let messages = models::chat::list_team_messages(conn, team_id).await?;
    Ok((StatusCode::OK, Json(messages)))
}

pub async fn api_send_team_message(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<ChatMessage>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(ApiError::Request("Mensagem vazia".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "chat.messages.send").await?;
    if payload.parent_id.is_some() {
        require_team_permission(conn, user_id, team_id, "chat.messages.reply").await?;
    }
    if payload.quoted_message_id.is_some() {
        require_team_permission(conn, user_id, team_id, "chat.messages.quote").await?;
    }

    let name = author_name(conn, user_id).await;

    let parent_id =
        models::chat::resolve_thread_parent(conn, None, Some(team_id), payload.parent_id).await?;
    let quoted_message_id =
        models::chat::validate_quote(conn, None, Some(team_id), payload.quoted_message_id).await?;

    let new_message = NewChatMessage {
        id: Uuid::new_v4(),
        team_id: Some(team_id),
        user_id: Some(user_id),
        author_name: name,
        content,
        parent_id,
        quoted_message_id,
        ..Default::default()
    };

    let message = models::chat::create_message(conn, &new_message).await?;

    // notifica os membros do time com acesso ao chat (menos o autor), em background
    {
        let state = state.clone();
        let sender_name = message.author_name.clone();
        let body = message.content.clone();
        tokio::spawn(async move {
            let Ok(mut conn) = get_conn(&state.pool).await else {
                return;
            };
            let members =
                match crate::models::team::find_team_members_with_roles(&mut conn, team_id).await {
                    Ok(m) => m,
                    Err(_) => return,
                };
            for (member, _role) in members {
                if member.user_id == user_id {
                    continue;
                }
                let allowed = member_has_capability(
                    &mut conn,
                    team_id,
                    member.user_id,
                    "chat.team.access",
                )
                .await
                .unwrap_or(false);
                if !allowed {
                    continue;
                }
                deliver_notification(
                    &state,
                    member.user_id,
                    &NotificationInput {
                        kind: "chat_team".to_string(),
                        title: format!("{} no chat do time", sender_name),
                        body: body.clone(),
                        url: Some(format!("/teams/{}/settings", team_id)),
                        notebook_id: None,
                        team_id: Some(team_id),
                    },
                )
                .await;
            }
        });
    }

    Ok((StatusCode::CREATED, Json(message)))
}
