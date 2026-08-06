use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

#[derive(Queryable, Selectable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::notebook_snapshots)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub label: String,
    pub note: Option<String>,
    pub kind: String,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::notebook_snapshots)]
pub(super) struct NewSnapshot {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub label: String,
    pub note: Option<String>,
    pub document_data: Vec<u8>,
    pub kind: String,
    pub created_by: Option<Uuid>,
}
