use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::folders)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: Uuid,
    pub name: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub tags: serde_json::Value,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::folders)]
pub struct NewFolder {
    pub id: Uuid,
    pub name: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
}
