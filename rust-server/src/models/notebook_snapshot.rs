use crate::models::error::ApiError;
use crate::schema::notebook_snapshots;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

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
#[diesel(table_name = notebook_snapshots)]
struct NewSnapshot {
    id: Uuid,
    notebook_id: Uuid,
    label: String,
    note: Option<String>,
    document_data: Vec<u8>,
    kind: String,
    created_by: Option<Uuid>,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnapshotRequest {
    #[validate(length(
        min = 1,
        max = 300,
        message = "Label must be between 1 and 300 characters"
    ))]
    pub label: String,
    pub note: Option<String>,
}

pub async fn create_snapshot(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
    label: &str,
    note: Option<String>,
    kind: &str,
    created_by: Option<Uuid>,
) -> Result<SnapshotMeta, ApiError> {
    use crate::schema::notebooks;

    let data: Option<Vec<u8>> = notebooks::table
        .find(notebook_id)
        .select(notebooks::document_data)
        .first::<Option<Vec<u8>>>(conn)
        .await
        .map_err(ApiError::from)?;

    let new_snapshot = NewSnapshot {
        id: Uuid::new_v4(),
        notebook_id,
        label: label.to_string(),
        note,
        document_data: data.unwrap_or_default(),
        kind: kind.to_string(),
        created_by,
    };

    diesel::insert_into(notebook_snapshots::table)
        .values(&new_snapshot)
        .returning(SnapshotMeta::as_returning())
        .get_result::<SnapshotMeta>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_snapshots(
    conn: &mut AsyncPgConnection,
    notebook_id_param: Uuid,
) -> Result<Vec<SnapshotMeta>, ApiError> {
    notebook_snapshots::table
        .filter(notebook_snapshots::notebook_id.eq(notebook_id_param))
        .order(notebook_snapshots::created_at.desc())
        .select(SnapshotMeta::as_select())
        .load::<SnapshotMeta>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn get_snapshot(
    conn: &mut AsyncPgConnection,
    snapshot_id: Uuid,
) -> Result<(Uuid, Vec<u8>), ApiError> {
    notebook_snapshots::table
        .find(snapshot_id)
        .select((
            notebook_snapshots::notebook_id,
            notebook_snapshots::document_data,
        ))
        .first::<(Uuid, Vec<u8>)>(conn)
        .await
        .map_err(|_| ApiError::Request("Version not found".to_string()))
}

pub async fn delete_snapshot(
    conn: &mut AsyncPgConnection,
    snapshot_id: Uuid,
) -> Result<(), ApiError> {
    diesel::delete(notebook_snapshots::table.find(snapshot_id))
        .execute(conn)
        .await
        .map_err(ApiError::from)?;
    Ok(())
}
