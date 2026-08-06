use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::templates)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub source_notebook_id: Option<Uuid>,
    pub is_public: bool,
    pub latest_version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::templates)]
pub struct NewTemplate {
    pub kind: String,
    pub name: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub source_notebook_id: Option<Uuid>,
}

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::template_versions)]
#[serde(rename_all = "camelCase")]
pub struct TemplateVersion {
    pub id: Uuid,
    pub template_id: Uuid,
    pub version: i32,
    pub named_sources: Value,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::template_versions)]
pub(super) struct NewTemplateVersion {
    pub template_id: Uuid,
    pub version: i32,
    pub named_sources: Value,
    pub note: Option<String>,
}
