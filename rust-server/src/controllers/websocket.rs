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
use std::sync::atomic::Ordering;
use tokio::sync::mpsc;
use uuid::Uuid;

/// passo do flush de presença (coalescência de cursores)
const PRESENCE_FLUSH_MS: u64 = 50;

use automerge::sync::{Message as SyncMessage, State as SyncState, SyncDoc};

use crate::{
    controllers::{
        jwt::extract_claims_from_ws_headers,
        metrics::METRICS,
        sync::{
            ActiveNotebook, INBOUND_SOFT_CAP, NotebookInner, PeerHandle, PresenceMember,
            PresenceRoom, PRESENCE_CHANNEL_CAP, SyncRegistry, PEER_CHANNEL_CAP,
        },
        permissions::{CapabilitySet, TargetCtx, capabilities_cached},
    },
    models::{
        notebook::{checkpoint_notebook_data, extract_search_text, load_notebook_data},
        state::AppState,
    },
};

fn checkpoint_interval_secs() -> u64 {
    std::env::var("CHECKPOINT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|v| *v > 0)
        .unwrap_or(15)
}

// persiste periodicamente os notebooks ativos que mudaram (sala movimentada nunca
// esvazia e, sem isto, nunca seria salva)
pub async fn checkpoint_loop(registry: SyncRegistry, pool: Pool<AsyncPgConnection>) {
    let interval = std::time::Duration::from_secs(checkpoint_interval_secs());
    loop {
        tokio::time::sleep(interval).await;

        // coleta os Arcs sem segurar refs do dashmap através dos awaits
        let items: Vec<(Uuid, Arc<ActiveNotebook>)> = registry
            .iter()
            .map(|e| (*e.key(), e.value().clone()))
            .collect();

        for (id, nb) in items {
            if !nb.dirty_since_save.swap(false, Ordering::AcqRel) {
                continue;
            }
            let (data, search_text) = {
                let mut inner = nb.inner.lock().await;
                let data = inner.doc.save();
                (data, extract_search_text(&inner.doc))
            };
            match pool.get().await {
                Ok(mut conn) => {
                    checkpoint_notebook_data(&mut conn, id, data, search_text).await;
                    METRICS.notebook_saves_total.inc();
                }
                Err(_) => {
                    nb.dirty_since_save.store(true, Ordering::Release);
                }
            }
        }
    }
}

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
    // chave de peer por conexão, não por user_id (duas abas do mesmo usuário colidiam)
    let session_id = Uuid::new_v4();

    let permissions = match capabilities_cached(&pool, original_user_id, notebook_id).await {
        Ok(caps) => caps,
        Err(_) => {
            METRICS.ws_sync_connection_errors_total.inc();
            let _ = socket.close().await;
            return;
        }
    };

    if !permissions.can("notebook.view", &TargetCtx::default()) {
        tracing::warn!(
            "Acesso negado: Tentativa de leitura em notebook privado {}",
            notebook_id
        );
        METRICS.ws_sync_connection_errors_total.inc();
        let _ = socket.close().await;
        return;
    }

    // adquire o notebook antes do split para poder fechar gracioso se o pool cair
    let notebook: Arc<ActiveNotebook> = if let Some(nb) = registry.get(&notebook_id) {
        nb.clone()
    } else {
        let mut conn = match pool.get().await {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("Pool indisponível ao abrir notebook {notebook_id}: {e}");
                METRICS.ws_sync_connection_errors_total.inc();
                let _ = socket.close().await;
                return;
            }
        };
        let saved_data = load_notebook_data(&mut conn, notebook_id).await;
        let mut newly_created = false;
        let nb = registry
            .entry(notebook_id)
            .or_insert_with(|| {
                newly_created = true;
                Arc::new(ActiveNotebook::new(saved_data))
            })
            .clone();
        if newly_created {
            METRICS.active_notebooks.inc();
        }
        nb
    };

    METRICS.ws_sync_connections_total.inc();
    METRICS.ws_sync_active.inc();

    let (mut sender, mut receiver) = socket.split();

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(PEER_CHANNEL_CAP);

    let peer = Arc::new(PeerHandle { tx });
    {
        let mut inner = notebook.inner.lock().await;
        inner
            .peer_states
            .entry(session_id)
            .or_insert_with(SyncState::new);
    }
    notebook.peers.insert(session_id, peer.clone());

    let mut send_task = tokio::spawn(async move {
        while let Some(packet) = rx.recv().await {
            if sender.send(Message::Binary(packet.into())).await.is_err() {
                break;
            }
        }
    });

    // gera o sync inicial do novo peer
    trigger_broadcast(notebook.clone());

    let notebook_recv = notebook.clone();
    let permission_cloned = permissions.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Binary(data))) = receiver.next().await {
            if !process_msg(session_id, data, &notebook_recv, &permission_cloned).await {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => { recv_task.abort(); }
        _ = (&mut recv_task) => { send_task.abort(); }
    };

    METRICS.ws_sync_active.dec();

    notebook.peers.remove(&session_id);
    let data_to_save = {
        let mut inner = notebook.inner.lock().await;
        inner.peer_states.remove(&session_id);
        if notebook.peers.is_empty() {
            let data = inner.doc.save();
            Some((data, extract_search_text(&inner.doc)))
        } else {
            None
        }
    };

    if let Some((data, search_text)) = data_to_save {
        if registry
            .remove_if(&notebook_id, |_, nb| nb.peers.is_empty())
            .is_some()
        {
            METRICS.active_notebooks.dec();
        }
        let pool_clone = pool.clone();
        tokio::spawn(async move {
            if let Ok(mut conn) = pool_clone.get().await {
                checkpoint_notebook_data(&mut conn, notebook_id, data, search_text).await;
                METRICS.notebook_saves_total.inc();
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
    // decodifica fora do lock do doc
    let msg = match SyncMessage::decode(&data) {
        Ok(m) => m,
        Err(_) => return true,
    };

    if !permission.can("notebook.edit", &TargetCtx::default()) && !msg.changes.is_empty() {
        tracing::warn!("Usuário sem permissão tentou enviar alterações. Desconectando.");
        return false;
    }

    // backpressure: se a fila acumulou demais, cede a cpu até drenar
    while notebook.inbound.lock().unwrap().len() >= INBOUND_SOFT_CAP {
        tokio::task::yield_now().await;
    }

    notebook.inbound.lock().unwrap().push((sender_id, msg));
    trigger_apply(notebook.clone());

    true
}

// aplicador single-flight: as recv_tasks só enfileiram; um único aplicador drena e
// aplica o lote sob um lock, sem N tasks disputando o mutex do doc
fn trigger_apply(notebook: Arc<ActiveNotebook>) {
    notebook.apply_dirty.store(true, Ordering::Release);
    if notebook
        .applying
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }
    tokio::spawn(async move {
        loop {
            notebook.apply_dirty.store(false, Ordering::Release);
            apply_batch(&notebook).await;
            if notebook.apply_dirty.load(Ordering::Acquire) {
                continue;
            }
            notebook.applying.store(false, Ordering::Release);
            if notebook.apply_dirty.load(Ordering::Acquire)
                && notebook
                    .applying
                    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
            {
                continue;
            }
            break;
        }
    });
}

async fn apply_batch(notebook: &Arc<ActiveNotebook>) {
    let batch: Vec<(Uuid, SyncMessage)> = {
        let mut q = notebook.inbound.lock().unwrap();
        if q.is_empty() {
            return;
        }
        std::mem::take(&mut *q)
    };

    let mut applied = 0u64;
    {
        let mut inner = notebook.inner.lock().await;
        let NotebookInner { doc, peer_states } = &mut *inner;
        for (sender_id, msg) in batch {
            let had_changes = !msg.changes.is_empty();
            if let Some(state) = peer_states.get_mut(&sender_id) {
                match doc.sync().receive_sync_message(state, msg) {
                    Ok(()) => {
                        if had_changes {
                            applied += 1;
                        }
                    }
                    Err(e) => tracing::error!("Erro ao aplicar sync message: {:?}", e),
                }
            }
        }
    }

    if applied > 0 {
        METRICS.sync_changes_applied_total.add(applied);
        notebook.dirty_since_save.store(true, Ordering::Release);
    }
    trigger_broadcast(notebook.clone());
}

// broadcaster single-flight: coalesce rajadas de mutações de N clientes numa geração
// por peer, em vez de O(N) aquisições do lock por mudança
fn trigger_broadcast(notebook: Arc<ActiveNotebook>) {
    notebook.dirty.store(true, Ordering::Release);
    if notebook
        .broadcasting
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }

    tokio::spawn(async move {
        loop {
            notebook.dirty.store(false, Ordering::Release);
            let (progressed, skipped) = broadcast_pass(&notebook).await;
            if progressed {
                continue;
            }
            if notebook.dirty.load(Ordering::Acquire) {
                continue;
            }
            if skipped {
                // peer com canal cheio: retenta em breve sem busy-wait
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                continue;
            }
            notebook.broadcasting.store(false, Ordering::Release);
            // recheca para não perder um `dirty` setado entre a passada e o store
            if notebook.dirty.load(Ordering::Acquire)
                && notebook
                    .broadcasting
                    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
            {
                continue;
            }
            break;
        }
    });
}

// reserva o slot do canal ANTES de gerar: generate_sync_message muta o SyncState do
// peer, então gerar e não conseguir enviar (canal cheio) causaria divergência; sem slot,
// pula o peer sem tocar seu estado
async fn broadcast_pass(notebook: &Arc<ActiveNotebook>) -> (bool, bool) {
    METRICS.sync_broadcast_passes_total.inc();
    let mut progressed = false;
    let mut generated = 0u64;
    let mut skipped = 0u64;

    let mut inner = notebook.inner.lock().await;
    let NotebookInner { doc, peer_states } = &mut *inner;

    for entry in notebook.peers.iter() {
        let pid = *entry.key();
        match entry.value().tx.try_reserve() {
            Ok(permit) => {
                if let Some(state) = peer_states.get_mut(&pid) {
                    if let Some(msg) = doc.sync().generate_sync_message(state) {
                        permit.send(msg.encode());
                        generated += 1;
                        progressed = true;
                    }
                }
            }
            // canal cheio ou fechado: pula sem mutar o estado do peer
            Err(_) => skipped += 1,
        }
    }

    if generated > 0 {
        METRICS.sync_peer_notifications_total.add(generated);
    }
    if skipped > 0 {
        METRICS.sync_broadcast_skips_total.add(skipped);
    }
    (progressed, skipped > 0)
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
    let permissions = match capabilities_cached(&state.pool, original_user_id, notebook_id).await {
        Ok(caps) => caps,
        Err(_) => {
            METRICS.ws_presence_connection_errors_total.inc();
            let _ = socket.close().await;
            return;
        }
    };

    if !permissions.can("notebook.view", &TargetCtx::default()) {
        METRICS.ws_presence_connection_errors_total.inc();
        let _ = socket.close().await;
        return;
    }

    METRICS.ws_presence_connections_total.inc();
    METRICS.ws_presence_active.inc();

    let (mut sender, mut receiver) = socket.split();

    let session_id = Uuid::new_v4();

    let (tx, mut rx) = mpsc::channel::<String>(PRESENCE_CHANNEL_CAP);

    let _ = tx.try_send(format!(r#"{{"type":"init","userId":"{}"}}"#, session_id));

    let registry = state.presence_registry.clone();

    let member = Arc::new(PresenceMember {
        tx,
        user_id: original_user_id,
        name: std::sync::Mutex::new(None),
        latest: std::sync::Mutex::new(None),
        changed: std::sync::atomic::AtomicBool::new(false),
        can_view_chat: permissions.can("chat.view", &TargetCtx::default()),
    });

    // insere sob o mesmo shard lock do dashmap para não correr com a remoção da sala vazia
    let room = {
        let entry = registry
            .entry(notebook_id)
            .or_insert_with(|| Arc::new(PresenceRoom::new()));
        let is_new = entry.subscribers.is_empty();
        entry.subscribers.insert(session_id, member.clone());
        let room_arc = entry.clone();
        if is_new {
            METRICS.presence_rooms.inc();
            tokio::spawn(presence_flush_loop(
                registry.clone(),
                notebook_id,
                room_arc.clone(),
            ));
        }
        room_arc
    };

    let mut send_task = tokio::spawn(async move {
        while let Some(msg_text) = rx.recv().await {
            if sender.send(Message::Text(msg_text.into())).await.is_err() {
                break;
            }
        }
    });

    let room_for_recv = room.clone();
    let state_for_recv = state.clone();
    let member_for_recv = member.clone();
    let perm_for_recv = permissions.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            let parsed: Option<serde_json::Value> = serde_json::from_str(&text).ok();
            let msg_type = parsed
                .as_ref()
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str());

            match msg_type {
                // cursor: guarda o último estado; a task de flush difunde coalescido
                Some("presence") => {
                    if let Some(v) = parsed {
                        if let Some(name) = v.get("name").and_then(|n| n.as_str()) {
                            *member_for_recv.name.lock().unwrap() = Some(name.to_string());
                        }
                        *member_for_recv.latest.lock().unwrap() = Some(v);
                        member_for_recv
                            .changed
                            .store(true, Ordering::Release);
                    }
                }
                // chat: difunde imediatamente + push de menção
                Some("chat") => {
                    if !perm_for_recv.can("chat.messages.send", &TargetCtx::default()) {
                        continue;
                    }
                    let sender_name = parsed
                        .as_ref()
                        .and_then(|v| v.get("name"))
                        .and_then(|v| v.as_str());
                    let chat_text = parsed
                        .as_ref()
                        .and_then(|v| v.get("text"))
                        .and_then(|v| v.as_str());
                    for m in room_for_recv.subscribers.iter() {
                        if *m.key() == session_id {
                            continue;
                        }
                        if !m.value().can_view_chat {
                            continue;
                        }
                        let _ = m.value().tx.try_send(text.to_string());

                        if let (Some(sender_name), Some(chat_text)) = (sender_name, chat_text) {
                            let mentioned_name = m.value().name.lock().unwrap().clone();
                            if let (Some(mentioned_user_id), Some(mentioned_name)) =
                                (m.value().user_id, mentioned_name)
                            {
                                if mentions_name(chat_text, &mentioned_name) {
                                    let state_for_push = state_for_recv.clone();
                                    let title =
                                        format!("{} mencionou você no chat", sender_name);
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
                    }
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    METRICS.ws_presence_active.dec();

    room.subscribers.remove(&session_id);
    room.gone.lock().unwrap().push(session_id);
}

// uma task por sala: a cada tick difunde um batch com o último estado dos membros que
// mudaram + as saídas, em vez de propagar cada update para todos (O(N²))
async fn presence_flush_loop(
    registry: crate::controllers::sync::PresenceRegistry,
    notebook_id: Uuid,
    room: Arc<PresenceRoom>,
) {
    let tick = std::time::Duration::from_millis(PRESENCE_FLUSH_MS);
    loop {
        tokio::time::sleep(tick).await;

        let mut updates: Vec<serde_json::Value> = Vec::new();
        for m in room.subscribers.iter() {
            if m.value().changed.swap(false, Ordering::AcqRel) {
                if let Some(v) = m.value().latest.lock().unwrap().clone() {
                    updates.push(v);
                }
            }
        }
        let gone: Vec<Uuid> = std::mem::take(&mut *room.gone.lock().unwrap());

        if updates.is_empty() && gone.is_empty() {
            // nada a difundir; se a sala esvaziou, encerra (remoção atômica no shard)
            if registry
                .remove_if(&notebook_id, |_, r| r.subscribers.is_empty())
                .is_some()
            {
                METRICS.presence_rooms.dec();
                return;
            }
            continue;
        }

        let batch = serde_json::json!({
            "type": "presence_batch",
            "updates": updates,
            "gone": gone.iter().map(|u| u.to_string()).collect::<Vec<String>>(),
        })
        .to_string();

        for m in room.subscribers.iter() {
            let _ = m.value().tx.try_send(batch.clone());
        }
    }
}

fn mentions_name(text: &str, name: &str) -> bool {
    let pattern = format!("@{}", name);
    text.to_lowercase().contains(&pattern.to_lowercase())
}

pub fn is_user_present(
    registry: &crate::controllers::sync::PresenceRegistry,
    notebook_id: Uuid,
    user_id: Uuid,
) -> bool {
    let Some(room) = registry.get(&notebook_id) else {
        return false;
    };
    room.subscribers
        .iter()
        .any(|m| m.value().user_id == Some(user_id))
}

pub fn broadcast_comment_event(state: &Arc<AppState>, notebook_id: Uuid, payload: String) {
    let Some(room) = state.presence_registry.get(&notebook_id) else {
        return;
    };
    for m in room.subscribers.iter() {
        let _ = m.value().tx.try_send(payload.clone());
    }
}

pub async fn restore_notebook_doc(state: &Arc<AppState>, notebook_id: Uuid, bytes: Vec<u8>) {
    let search_text = automerge::AutoCommit::load(&bytes)
        .map(|doc| extract_search_text(&doc))
        .unwrap_or_default();

    if let Ok(mut conn) = state.pool.get().await {
        checkpoint_notebook_data(&mut conn, notebook_id, bytes.clone(), search_text).await;
    }

    if let Some(active) = state.sync_registry.get(&notebook_id)
        && let Ok(new_doc) = automerge::AutoCommit::load(&bytes)
    {
        let mut inner = active.inner.lock().await;
        inner.doc = new_doc;
        inner.peer_states.clear();
        active.dirty_since_save.store(false, Ordering::Release);
    }

    broadcast_comment_event(
        state,
        notebook_id,
        serde_json::json!({ "type": "notebook_restored" }).to_string(),
    );
}

/// Difunde um evento de chat (JSON) para a sala de presença do notebook e dispara
/// push de menção. Usado pelos endpoints REST de chat para propagar em tempo real.
pub fn broadcast_chat_and_notify(
    state: &Arc<AppState>,
    notebook_id: Uuid,
    payload: String,
    content: Option<&str>,
    sender_name: Option<&str>,
    sender_user_id: Option<Uuid>,
) {
    let Some(room) = state.presence_registry.get(&notebook_id) else {
        return;
    };
    for m in room.subscribers.iter() {
        if !m.value().can_view_chat {
            continue;
        }
        let _ = m.value().tx.try_send(payload.clone());

        if let (Some(content), Some(sender_name)) = (content, sender_name) {
            let mentioned_name = m.value().name.lock().unwrap().clone();
            if let (Some(uid), Some(name)) = (m.value().user_id, mentioned_name) {
                if Some(uid) == sender_user_id {
                    continue;
                }
                if mentions_name(content, &name) {
                    let state_for_push = state.clone();
                    let title = format!("{} mencionou você no chat", sender_name);
                    let body = content.to_string();
                    let url = format!("/notebook/{}", notebook_id);
                    tokio::spawn(async move {
                        crate::controllers::push::send_push_to_user(
                            &state_for_push,
                            uid,
                            &title,
                            &body,
                            &url,
                        )
                        .await;
                    });
                }
            }
        }
    }
}

// socket combinado: sync (binário) + presença (texto) numa conexão, uma checagem de
// permissão por cliente. os handlers separados acima seguem como fallback.

fn join_presence_room(
    registry: &crate::controllers::sync::PresenceRegistry,
    notebook_id: Uuid,
    session_id: Uuid,
    member: Arc<PresenceMember>,
) -> Arc<PresenceRoom> {
    let entry = registry
        .entry(notebook_id)
        .or_insert_with(|| Arc::new(PresenceRoom::new()));
    let is_new = entry.subscribers.is_empty();
    entry.subscribers.insert(session_id, member);
    let room = entry.clone();
    if is_new {
        METRICS.presence_rooms.inc();
        tokio::spawn(presence_flush_loop(
            registry.clone(),
            notebook_id,
            room.clone(),
        ));
    }
    room
}

async fn handle_presence_text(
    text: String,
    session_id: Uuid,
    room: &Arc<PresenceRoom>,
    member: &Arc<PresenceMember>,
    state: &Arc<AppState>,
    notebook_id: Uuid,
    permission: &CapabilitySet,
) {
    let parsed: Option<serde_json::Value> = serde_json::from_str(&text).ok();
    let msg_type = parsed
        .as_ref()
        .and_then(|v| v.get("type"))
        .and_then(|v| v.as_str());

    match msg_type {
        Some("presence") => {
            if let Some(v) = parsed {
                if let Some(name) = v.get("name").and_then(|n| n.as_str()) {
                    *member.name.lock().unwrap() = Some(name.to_string());
                }
                *member.latest.lock().unwrap() = Some(v);
                member.changed.store(true, Ordering::Release);
            }
        }
        Some("chat") => {
            if !permission.can("chat.messages.send", &TargetCtx::default()) {
                return;
            }
            let sender_name = parsed
                .as_ref()
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str());
            let chat_text = parsed
                .as_ref()
                .and_then(|v| v.get("text"))
                .and_then(|v| v.as_str());
            for m in room.subscribers.iter() {
                if *m.key() == session_id {
                    continue;
                }
                if !m.value().can_view_chat {
                    continue;
                }
                let _ = m.value().tx.try_send(text.to_string());
                if let (Some(sender_name), Some(chat_text)) = (sender_name, chat_text) {
                    let mentioned_name = m.value().name.lock().unwrap().clone();
                    if let (Some(mentioned_user_id), Some(mentioned_name)) =
                        (m.value().user_id, mentioned_name)
                    {
                        if mentions_name(chat_text, &mentioned_name) {
                            let state_for_push = state.clone();
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
            }
        }
        _ => {}
    }
}

pub async fn websocket_combined_handler(
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
        .on_upgrade(move |socket| handle_combined_socket(socket, notebook_id, user_token, state))
}

async fn handle_combined_socket(
    mut socket: WebSocket,
    notebook_id: Uuid,
    original_user_id: Option<Uuid>,
    state: Arc<AppState>,
) {
    let session_id = Uuid::new_v4();

    // uma checagem de permissão para sync + presença
    let permissions = match capabilities_cached(&state.pool, original_user_id, notebook_id).await {
        Ok(caps) => caps,
        Err(_) => {
            METRICS.ws_sync_connection_errors_total.inc();
            let _ = socket.close().await;
            return;
        }
    };
    if !permissions.can("notebook.view", &TargetCtx::default()) {
        METRICS.ws_sync_connection_errors_total.inc();
        let _ = socket.close().await;
        return;
    }

    let notebook: Arc<ActiveNotebook> = if let Some(nb) = state.sync_registry.get(&notebook_id) {
        nb.clone()
    } else {
        let mut conn = match state.pool.get().await {
            Ok(c) => c,
            Err(_) => {
                METRICS.ws_sync_connection_errors_total.inc();
                let _ = socket.close().await;
                return;
            }
        };
        let saved = load_notebook_data(&mut conn, notebook_id).await;
        let mut created = false;
        let nb = state
            .sync_registry
            .entry(notebook_id)
            .or_insert_with(|| {
                created = true;
                Arc::new(ActiveNotebook::new(saved))
            })
            .clone();
        if created {
            METRICS.active_notebooks.inc();
        }
        nb
    };

    METRICS.ws_sync_connections_total.inc();
    METRICS.ws_sync_active.inc();
    METRICS.ws_presence_connections_total.inc();
    METRICS.ws_presence_active.inc();

    let (mut sender, mut receiver) = socket.split();

    // peer binário (sync) + membro texto (presença); um send task muxa os dois no socket
    let (bin_tx, mut bin_rx) = mpsc::channel::<Vec<u8>>(PEER_CHANNEL_CAP);
    let (txt_tx, mut txt_rx) = mpsc::channel::<String>(PRESENCE_CHANNEL_CAP);

    let peer = Arc::new(PeerHandle { tx: bin_tx });
    {
        let mut inner = notebook.inner.lock().await;
        inner
            .peer_states
            .entry(session_id)
            .or_insert_with(SyncState::new);
    }
    notebook.peers.insert(session_id, peer.clone());

    let member = Arc::new(PresenceMember {
        tx: txt_tx,
        user_id: original_user_id,
        name: std::sync::Mutex::new(None),
        latest: std::sync::Mutex::new(None),
        changed: std::sync::atomic::AtomicBool::new(false),
        can_view_chat: permissions.can("chat.view", &TargetCtx::default()),
    });
    let _ = member
        .tx
        .try_send(format!(r#"{{"type":"init","userId":"{}"}}"#, session_id));
    let room = join_presence_room(&state.presence_registry, notebook_id, session_id, member.clone());

    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                b = bin_rx.recv() => match b {
                    Some(b) => {
                        if sender.send(Message::Binary(b.into())).await.is_err() { break; }
                    }
                    None => break,
                },
                t = txt_rx.recv() => match t {
                    Some(t) => {
                        if sender.send(Message::Text(t.into())).await.is_err() { break; }
                    }
                    None => break,
                },
            }
        }
    });

    trigger_broadcast(notebook.clone());

    let notebook_recv = notebook.clone();
    let room_recv = room.clone();
    let member_recv = member.clone();
    let state_recv = state.clone();
    let perm = permissions.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Binary(data) => {
                    if !process_msg(session_id, data, &notebook_recv, &perm).await {
                        break;
                    }
                }
                Message::Text(text) => {
                    handle_presence_text(
                        text.to_string(),
                        session_id,
                        &room_recv,
                        &member_recv,
                        &state_recv,
                        notebook_id,
                        &perm,
                    )
                    .await;
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    METRICS.ws_sync_active.dec();
    METRICS.ws_presence_active.dec();

    notebook.peers.remove(&session_id);
    let data_to_save = {
        let mut inner = notebook.inner.lock().await;
        inner.peer_states.remove(&session_id);
        if notebook.peers.is_empty() {
            let data = inner.doc.save();
            Some((data, extract_search_text(&inner.doc)))
        } else {
            None
        }
    };
    if let Some((data, search_text)) = data_to_save {
        if state
            .sync_registry
            .remove_if(&notebook_id, |_, nb| nb.peers.is_empty())
            .is_some()
        {
            METRICS.active_notebooks.dec();
        }
        let pool_clone = state.pool.clone();
        tokio::spawn(async move {
            if let Ok(mut conn) = pool_clone.get().await {
                checkpoint_notebook_data(&mut conn, notebook_id, data, search_text).await;
                METRICS.notebook_saves_total.inc();
            }
        });
    }

    room.subscribers.remove(&session_id);
    room.gone.lock().unwrap().push(session_id);
}
