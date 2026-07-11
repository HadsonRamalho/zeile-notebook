use automerge::sync::Message as SyncMessage;
use automerge::{AutoCommit, sync::State as SyncState};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tokio::sync::mpsc;
use uuid::Uuid;

pub const PEER_CHANNEL_CAP: usize = 256;

/// teto da fila de entrada; acima disso a recv_task aplica backpressure
pub const INBOUND_SOFT_CAP: usize = 20_000;

pub struct NotebookInner {
    pub doc: AutoCommit,
    pub peer_states: HashMap<Uuid, SyncState>,
}

pub struct PeerHandle {
    pub tx: mpsc::Sender<Vec<u8>>,
}

pub struct ActiveNotebook {
    pub inner: tokio::sync::Mutex<NotebookInner>,
    pub peers: dashmap::DashMap<Uuid, Arc<PeerHandle>>,
    // single-flight do broadcaster: `dirty` coalesce rajadas de mutações numa passada
    pub broadcasting: AtomicBool,
    pub dirty: AtomicBool,
    // fila de recebimento; um aplicador single-flight drena e aplica o lote sob um lock
    pub inbound: std::sync::Mutex<Vec<(Uuid, SyncMessage)>>,
    pub applying: AtomicBool,
    pub apply_dirty: AtomicBool,
    // mudou desde o último checkpoint; o loop periódico só persiste notebooks sujos
    pub dirty_since_save: AtomicBool,
}

impl ActiveNotebook {
    pub fn new(loaded_data: Option<Vec<u8>>) -> Self {
        let doc = if let Some(data) = loaded_data {
            AutoCommit::load(&data).unwrap_or_else(|_| AutoCommit::new())
        } else {
            AutoCommit::new()
        };

        Self {
            inner: tokio::sync::Mutex::new(NotebookInner {
                doc,
                peer_states: HashMap::new(),
            }),
            peers: dashmap::DashMap::new(),
            broadcasting: AtomicBool::new(false),
            dirty: AtomicBool::new(false),
            inbound: std::sync::Mutex::new(Vec::new()),
            applying: AtomicBool::new(false),
            apply_dirty: AtomicBool::new(false),
            dirty_since_save: AtomicBool::new(false),
        }
    }
}

/// canal de saída de presença bounded (lossy; cursor é descartável)
pub const PRESENCE_CHANNEL_CAP: usize = 64;

pub struct PresenceMember {
    pub tx: mpsc::Sender<String>,
    pub user_id: Option<Uuid>,
    pub name: std::sync::Mutex<Option<String>>,
    // último estado recebido; a task de flush reenvia só o último por tick (coalescência)
    pub latest: std::sync::Mutex<Option<serde_json::Value>>,
    pub changed: std::sync::atomic::AtomicBool,
}

pub struct PresenceRoom {
    pub subscribers: dashmap::DashMap<Uuid, Arc<PresenceMember>>,
    // sessões que saíram desde o último flush, para o batch informar `gone`
    pub gone: std::sync::Mutex<Vec<Uuid>>,
}

impl PresenceRoom {
    pub fn new() -> Self {
        Self {
            subscribers: dashmap::DashMap::new(),
            gone: std::sync::Mutex::new(Vec::new()),
        }
    }
}

pub type SyncRegistry = Arc<dashmap::DashMap<Uuid, Arc<ActiveNotebook>>>;
// dashmap por-sala, sem lock global sobre todas as salas
pub type PresenceRegistry = Arc<dashmap::DashMap<Uuid, Arc<PresenceRoom>>>;
