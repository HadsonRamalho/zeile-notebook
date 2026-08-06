use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page: i64,
    pub limit: i64,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct AdminChartData {
    pub name: String,
    pub users: i64,
    pub notebooks: i64,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminSystemStats {
    pub total_users: i64,
    pub total_active_users: i64,
    pub total_notebooks: i64,
    pub total_public_notebooks: i64,
    pub total_teams: i64,
    pub total_team_members: i64,
    pub chart_data: Vec<AdminChartData>,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminUserView {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub primary_provider: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminTeamView {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: NaiveDateTime,
    pub member_count: i64,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminNotebookView {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub title: String,
    pub is_public: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct AdminSearchResult {
    pub id: Uuid,
    pub label: String,
    pub sublabel: Option<String>,
}

#[derive(Deserialize)]
pub struct AdminSearchQuery {
    pub kind: String,
    pub q: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminNotifyRequest {
    pub target_kind: String,
    pub target_id: Uuid,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
}
