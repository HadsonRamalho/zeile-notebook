use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;
use validator::Validate;

use super::entity::{Template, TemplateVersion};

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTemplateRequest {
    pub kind: String,
    #[validate(length(max = 300, message = "Name must be at most 300 characters"))]
    pub name: String,
    pub team_id: Option<Uuid>,
    pub source_notebook_id: Option<Uuid>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublishVersionRequest {
    pub named_sources: Value,
    pub note: Option<String>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VisibilityRequest {
    pub is_public: bool,
}

#[derive(Deserialize)]
pub struct VersionQuery {
    pub version: Option<i32>,
}

#[derive(Deserialize)]
pub struct PublicQuery {
    pub kind: Option<String>,
    pub q: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyTemplatesQuery {
    pub team_id: Option<Uuid>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ResolvedTemplate {
    #[serde(flatten)]
    pub template: Template,
    pub version: Option<TemplateVersion>,
}

#[derive(Serialize, Debug, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicTemplateResponse {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub owner_name: String,
    pub latest_version: i32,
    pub updated_at: DateTime<Utc>,
}
