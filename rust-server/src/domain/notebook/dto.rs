use chrono::{DateTime, Utc};
use diesel::QueryableByName;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::entity::{BlockType, Language, Notebook};

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BlockMetadata {
    Callout {
        props: CalloutProps,
    },
    Card {
        props: CardProps,
    },
    GithubRepo {
        props: GithubRepoProps,
    },
    Banner {
        variant: String,
    },
    Generic {
        #[serde(flatten)]
        props: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CalloutProps {
    pub title: Option<String>,
    pub icon: Option<String>,
    #[serde(rename = "type")]
    pub callout_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CardProps {
    pub title: String,
    pub description: Option<String>,
    pub href: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct GithubRepoProps {
    pub owner: String,
    pub repo: String,
}

#[derive(Serialize, Debug, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotebookDto {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub is_public: bool,
    pub document_data: Option<Vec<u8>>,
    pub team_id: Option<Uuid>,
    pub folder_id: Option<Uuid>,
    pub tags: serde_json::Value,
    pub public_slug: Option<String>,
}

impl From<Notebook> for NotebookDto {
    fn from(n: Notebook) -> Self {
        NotebookDto {
            id: n.id,
            user_id: n.user_id,
            title: n.title,
            created_at: n.created_at,
            updated_at: n.updated_at,
            is_public: n.is_public,
            document_data: n.document_data,
            team_id: n.team_id,
            folder_id: n.folder_id,
            tags: n.tags,
            public_slug: n.public_slug,
        }
    }
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotebookResponse {
    #[serde(flatten)]
    pub meta: NotebookDto,
    pub blocks: Vec<BlockResponse>,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BlockResponse {
    pub id: Uuid,
    pub title: String,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub content: String,
    pub language: Option<Language>,
    pub metadata: Option<BlockMetadata>,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotebookTitle {
    #[validate(length(
        min = 1,
        max = 300,
        message = "Title must be between 1 and 300 characters"
    ))]
    pub title: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTagsRequest {
    pub tags: Vec<String>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotebookVisibility {
    #[serde(alias = "is_visible")]
    pub is_visible: bool,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncNotebookRequest {
    pub title: String,
    pub blocks: Vec<BlockRequest>,
    pub is_public: bool,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BlockRequest {
    pub id: Uuid,
    pub title: String,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub content: String,
    pub language: Option<Language>,
    pub metadata: Option<BlockMetadata>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Deserialize, Default)]
pub struct PublicSearchQuery {
    #[serde(default)]
    pub q: Option<String>,
}

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct SearchResult {
    pub id: Uuid,
    pub title: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct RankedSearchQuery {
    pub q: String,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RankedSearchItem {
    pub kind: String,
    pub notebook_id: Uuid,
    pub block_id: Option<Uuid>,
    pub notebook_title: String,
    pub team_id: Option<Uuid>,
    pub team_name: Option<String>,
    pub snippet: String,
    pub rank: f32,
}

#[derive(QueryableByName)]
pub(super) struct NotebookHitRow {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    pub notebook_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub notebook_title: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Uuid>)]
    pub team_id: Option<Uuid>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub team_name: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub snippet: String,
    #[diesel(sql_type = diesel::sql_types::Float)]
    pub rank: f32,
}

#[derive(QueryableByName)]
pub(super) struct BlockHitRow {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    pub block_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    pub notebook_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub notebook_title: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Uuid>)]
    pub team_id: Option<Uuid>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub team_name: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub snippet: String,
    #[diesel(sql_type = diesel::sql_types::Float)]
    pub rank: f32,
}

#[derive(Serialize, Deserialize, Debug, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicNotebookResponse {
    pub id: Uuid,
    pub title: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub owner_name: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicNotebookDoc {
    pub id: Uuid,
    pub title: String,
    pub owner_name: Option<String>,
    pub updated_at: DateTime<Utc>,
    pub public_slug: Option<String>,
    pub document_data: Option<Vec<u8>>,
}
