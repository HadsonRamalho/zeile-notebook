#[allow(dead_code, unused_imports, unused_import_braces)]
use axum::{
    extract::{
        Path, State as AxumState,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use bytes::Bytes;
use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Pool};
use futures::{SinkExt, stream::StreamExt};
use hyper::HeaderMap;
use std::sync::Arc;
use tokio::sync::{Notify, RwLock, mpsc};
use uuid::Uuid;

use automerge::sync::{Message as SyncMessage, State as SyncState, SyncDoc};

use crate::{
    controllers::{
        jwt::extract_claims_from_ws_headers,
        sync::{
            ActiveNotebook, NotebookInner, PeerHandle, PresenceMember, PresenceRoom, SyncRegistry,
            PEER_CHANNEL_CAP,
        },
        permissions::{CapabilitySet, TargetCtx, capabilities},
    },
    models::{
        notebook::{load_notebook_data, save_notebook_data},
        state::AppState,
    },
};

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    Path(notebook_id): Path<Uuid>,
    AxumState(state): AxumState<Arc<AppState>>,
) -> impl IntoResponse {
    let user_token = match extract_claims_from_ws_headers(&headers).await {
        Ok(t) => Some(t.1.id),
        Err(_) => None,
    };

    let pool = state.pool.clone();

    ws.protocols(["access_token"]).on_upgrade(move |socket| {
        handle_socket(
            socket,
            notebook_id,
            user_token,
            state.sync_registry.clone(),
            pool,
        )
    })
}

async fn handle_socket(
    mut socket: WebSocket,
    notebook_id: Uuid,
    original_user_id: Option<Uuid>,
    registry: SyncRegistry,
    pool: Pool<AsyncPgConnection>,
) {
    let user_id = original_user_id.unwrap_or(Uuid::new_v4());

    let permissions = match capabilities(&pool, original_user_id, notebook_id).await {
        Ok(caps) => caps,
        Err(_) => {
            let _ = socket.close().await;
            return;
        }
    };

    if !permissions.can("notebook.view", &TargetCtx::default()) {
        tracing::warn!(
            "Acesso negado: Tentativa de leitura em notebook privado {}",
            notebook_id
        );
        let _ = socket.close().await;
        return;
    }

    let (mut sender, mut receiver) = socket.split();

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(PEER_CHANNEL_CAP);

    let notebook: Arc<ActiveNotebook> = if let Some(nb) = registry.get(&notebook_id) {
        nb.clone()
    } else {
        let mut conn = pool.get().await.unwrap();
        let saved_data = load_notebook_data(&mut conn, notebook_id).await;
        registry
            .entry(notebook_id)
            .or_insert_with(|| Arc::new(ActiveNotebook::new(saved_data)))
            .clone()
    };

    let peer = Arc::new(PeerHandle {
        notify: Notify::new(),
        tx,
    });
    {
        let mut inner = notebook.inner.lock().await;
        inner.peer_states.entry(user_id).or_insert_with(SyncState::new);
    }
    notebook.peers.insert(user_id, peer.clone());

    let mut send_task = tokio::spawn(async move {
        while let Some(packet) = rx.recv().await {
            if sender.send(Message::Binary(packet.into())).await.is_err() {
                break;
            }
        }
    });

    let sync_nb = notebook.clone();
    let sync_peer = peer.clone();
    let mut sync_task = tokio::spawn(async move {
        loop {
            sync_peer.notify.notified().await;
            loop {
                let bytes = {
                    let mut inner = sync_nb.inner.lock().await;
                    let NotebookInner { doc, peer_states } = &mut *inner;
                    match peer_states.get_mut(&user_id) {
                        Some(state) => doc.sync().generate_sync_message(state).map(|m| m.encode()),
                        None => None,
                    }
                };
                match bytes {
                    Some(b) => {
                        if sync_peer.tx.send(b).await.is_err() {
                            return;
                        }
                    }
                    None => break,
                }
            }
        }
    });

    peer.notify.notify_one();

    let notebook_recv = notebook.clone();
    let permission_cloned = permissions.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Binary(data))) = receiver.next().await {
            if !process_msg(user_id, data, &notebook_recv, &permission_cloned).await {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => { recv_task.abort(); sync_task.abort(); }
        _ = (&mut recv_task) => { send_task.abort(); sync_task.abort(); }
    };

    notebook.peers.remove(&user_id);
    let data_to_save = {
        let mut inner = notebook.inner.lock().await;
        inner.peer_states.remove(&user_id);
        if notebook.peers.is_empty() {
            Some(inner.doc.save())
        } else {
            None
        }
    };

    if let Some(data) = data_to_save {
        registry.remove_if(&notebook_id, |_, nb| nb.peers.is_empty());
        let pool_clone = pool.clone();
        tokio::spawn(async move {
            if let Ok(mut conn) = pool_clone.get().await {
                save_notebook_data(&mut conn, user_id, notebook_id, data).await;
            }
        });
    }
}

async fn process_msg(
    sender_id: Uuid,
    data: Bytes,
    notebook: &Arc<ActiveNotebook>,
    permission: &CapabilitySet,
) -> bool {
    let msg = match SyncMessage::decode(&data) {
        Ok(m) => m,
        Err(_) => return true,
    };

    if !permission.can("notebook.edit", &TargetCtx::default()) && !msg.changes.is_empty() {
        tracing::warn!("Usuário sem permissão tentou enviar alterações. Desconectando.");
        return false;
    }

    let advanced = {
        let mut inner = notebook.inner.lock().await;
        let NotebookInner { doc, peer_states } = &mut *inner;
        let before = doc.get_heads();
        match peer_states.get_mut(&sender_id) {
            Some(state) => {
                if let Err(e) = doc.sync().receive_sync_message(state, msg) {
                    tracing::error!("Erro ao aplicar sync message: {:?}", e);
                    return true;
                }
            }
            None => return true,
        }
        before != doc.get_heads()
    };

    if let Some(p) = notebook.peers.get(&sender_id) {
        p.notify.notify_one();
    }

    if advanced {
        for entry in notebook.peers.iter() {
            if *entry.key() != sender_id {
                entry.value().notify.notify_one();
            }
        }
    }

    true
}

pub async fn websocket_presence_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    Path(notebook_id): Path<Uuid>,
    AxumState(state): AxumState<Arc<AppState>>,
) -> impl IntoResponse {
    let user_token = match extract_claims_from_ws_headers(&headers).await {
        Ok(t) => Some(t.1.id),
        Err(_) => None,
    };

    ws.protocols(["access_token"])
        .on_upgrade(move |socket| handle_presence_socket(socket, notebook_id, user_token, state))
}

async fn handle_presence_socket(
    mut socket: WebSocket,
    notebook_id: Uuid,
    original_user_id: Option<Uuid>,
    state: Arc<AppState>,
) {
    let permissions = match capabilities(&state.pool, original_user_id, notebook_id).await {
        Ok(caps) => caps,
        Err(_) => {
            let _ = socket.close().await;
            return;
        }
    };

    if !permissions.can("notebook.view", &TargetCtx::default()) {
        let _ = socket.close().await;
        return;
    }

    let (mut sender, mut receiver) = socket.split();

    let session_id = Uuid::new_v4();

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let _ = tx.send(format!(r#"{{"type":"init","userId":"{}"}}"#, session_id));

    let registry = state.presence_registry.clone();
    let room = {
        let mut reg = registry.write().await;
        let room_arc = reg
            .entry(notebook_id)
            .or_insert_with(|| Arc::new(RwLock::new(PresenceRoom::new())))
            .clone();
        room_arc
    };

    {
        let mut r = room.write().await;
        r.subscribers.insert(
            session_id,
            PresenceMember {
                tx,
                user_id: original_user_id,
                name: None,
            },
        );
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(msg_text) = rx.recv().await {
            if sender.send(Message::Text(msg_text.into())).await.is_err() {
                break;
            }
        }
    });

    let room_for_recv = room.clone();
    let state_for_recv = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            let parsed: Option<serde_json::Value> = serde_json::from_str(&text).ok();
            let msg_type = parsed
                .as_ref()
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str());

            if msg_type == Some("presence") {
                let name = parsed
                    .as_ref()
                    .and_then(|v| v.get("name"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let mut r = room_for_recv.write().await;
                if let Some(member) = r.subscribers.get_mut(&session_id) {
                    member.name = name;
                }
            }

            if msg_type == Some("chat") {
                if let (Some(sender_name), Some(chat_text)) = (
                    parsed
                        .as_ref()
                        .and_then(|v| v.get("name"))
                        .and_then(|v| v.as_str()),
                    parsed
                        .as_ref()
                        .and_then(|v| v.get("text"))
                        .and_then(|v| v.as_str()),
                ) {
                    let r = room_for_recv.read().await;
                    for (peer_session_id, member) in r.subscribers.iter() {
                        if *peer_session_id == session_id {
                            continue;
                        }
                        let (Some(mentioned_user_id), Some(mentioned_name)) =
                            (member.user_id, member.name.as_deref())
                        else {
                            continue;
                        };
                        if !mentions_name(chat_text, mentioned_name) {
                            continue;
                        }
                        let state_for_push = state_for_recv.clone();
                        let title = format!("{} mencionou você no chat", sender_name);
                        let body = chat_text.to_string();
                        let url = format!("/notebook/{}", notebook_id);
                        tokio::spawn(async move {
                            crate::controllers::push::send_push_to_user(
                                &state_for_push,
                                mentioned_user_id,
                                &title,
                                &body,
                                &url,
                            )
                            .await;
                        });
                    }
                }
            }

            let r = room_for_recv.read().await;
            for (peer_session_id, member) in r.subscribers.iter() {
                if *peer_session_id != session_id {
                    let _ = member.tx.send(text.to_string());
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    let should_remove_room = {
        let mut r = room.write().await;
        r.subscribers.remove(&session_id);

        let disconnect_msg = format!(r#"{{"type":"disconnect","userId":"{}"}}"#, session_id);
        for member in r.subscribers.values() {
            let _ = member.tx.send(disconnect_msg.clone());
        }

        r.subscribers.is_empty()
    };

    if should_remove_room {
        let mut reg = registry.write().await;
        reg.remove(&notebook_id);
    }
}

fn mentions_name(text: &str, name: &str) -> bool {
    let pattern = format!("@{}", name);
    text.to_lowercase().contains(&pattern.to_lowercase())
}
