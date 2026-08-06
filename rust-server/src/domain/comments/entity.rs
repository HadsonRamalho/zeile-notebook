use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::comment_threads)]
#[serde(rename_all = "camelCase")]
pub struct CommentThread {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub block_id: String,
    pub anchor_offset: Option<i32>,
    pub status: String,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::comment_threads)]
pub struct NewCommentThread {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub block_id: String,
    pub anchor_offset: Option<i32>,
    pub status: String,
    pub created_by: Option<Uuid>,
}

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::comments)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub author_id: Option<Uuid>,
    pub author_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::comments)]
pub struct NewComment {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub author_id: Option<Uuid>,
    pub author_name: String,
    pub body: String,
}
