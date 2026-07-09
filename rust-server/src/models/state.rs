use crate::controllers::sync::{PresenceRegistry, SyncRegistry};
use axum::extract::FromRef;
use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Pool};
use web_push::{HyperWebPushClient, PartialVapidSignatureBuilder};

#[derive(Clone)]
pub struct PushState {
    pub client: HyperWebPushClient,
    pub vapid_builder: PartialVapidSignatureBuilder,
    pub subject: String,
}

pub struct AppState {
    pub pool: Pool<AsyncPgConnection>,
    pub sync_registry: SyncRegistry,
    pub presence_registry: PresenceRegistry,
    pub push: Option<PushState>,
}

impl FromRef<AppState> for Pool<AsyncPgConnection> {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}
