use automerge::{AutoCommit, sync::State as SyncState};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Notify, RwLock, mpsc};
use uuid::Uuid;

pub const PEER_CHANNEL_CAP: usize = 256;

pub struct NotebookInner {
    pub doc: AutoCommit,
    pub peer_states: HashMap<Uuid, SyncState>,
}

pub struct PeerHandle {
    pub notify: Notify,
    pub tx: mpsc::Sender<Vec<u8>>,
}

pub struct ActiveNotebook {
    pub inner: tokio::sync::Mutex<NotebookInner>,
    pub peers: dashmap::DashMap<Uuid, Arc<PeerHandle>>,
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
        }
    }
}

pub struct PresenceMember {
    pub tx: mpsc::UnboundedSender<String>,
    pub user_id: Option<Uuid>,
    pub name: Option<String>,
}

pub struct PresenceRoom {
    pub subscribers: HashMap<Uuid, PresenceMember>,
}

impl PresenceRoom {
    pub fn new() -> Self {
        Self {
            subscribers: HashMap::new(),
        }
    }
}

pub type SyncRegistry = Arc<dashmap::DashMap<Uuid, Arc<ActiveNotebook>>>;
pub type PresenceRegistry = Arc<RwLock<HashMap<Uuid, Arc<RwLock<PresenceRoom>>>>>;
