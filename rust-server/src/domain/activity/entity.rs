use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

#[derive(Queryable, Selectable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::notebook_activity)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub actor_id: Option<Uuid>,
    pub actor_name: String,
    pub kind: String,
    pub block_id: Option<String>,
    pub summary: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::notebook_activity)]
pub struct NewActivity {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub actor_id: Option<Uuid>,
    pub actor_name: String,
    pub kind: String,
    pub block_id: Option<String>,
    pub summary: Option<String>,
}
