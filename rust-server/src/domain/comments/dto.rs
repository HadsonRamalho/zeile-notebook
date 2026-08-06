use serde::{Deserialize, Serialize};
use validator::Validate;

use super::entity::{Comment, CommentThread};

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadWithComments {
    #[serde(flatten)]
    pub thread: CommentThread,
    pub comments: Vec<Comment>,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateThreadRequest {
    #[validate(length(min = 1, message = "Block id is required"))]
    pub block_id: String,
    pub anchor_offset: Option<i32>,
    #[validate(length(
        min = 1,
        max = 10000,
        message = "Comment must be between 1 and 10000 characters"
    ))]
    pub body: String,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReplyRequest {
    #[validate(length(
        min = 1,
        max = 10000,
        message = "Comment must be between 1 and 10000 characters"
    ))]
    pub body: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateThreadRequest {
    pub status: String,
}
