use crate::models::error::ApiError;
use crate::schema::{comment_threads, comments};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone)]
#[diesel(table_name = crate::schema::comment_threads)]
pub struct CommentThread {
    pub id: Uuid,
    #[serde(rename = "notebookId")]
    pub notebook_id: Uuid,
    #[serde(rename = "blockId")]
    pub block_id: String,
    #[serde(rename = "anchorOffset")]
    pub anchor_offset: Option<i32>,
    pub status: String,
    #[serde(rename = "createdBy")]
    pub created_by: Option<Uuid>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = comment_threads)]
pub struct NewCommentThread {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub block_id: String,
    pub anchor_offset: Option<i32>,
    pub status: String,
    pub created_by: Option<Uuid>,
}

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone)]
#[diesel(table_name = crate::schema::comments)]
pub struct Comment {
    pub id: Uuid,
    #[serde(rename = "threadId")]
    pub thread_id: Uuid,
    #[serde(rename = "authorId")]
    pub author_id: Option<Uuid>,
    #[serde(rename = "authorName")]
    pub author_name: String,
    pub body: String,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
    #[serde(rename = "deletedAt")]
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Insertable)]
#[diesel(table_name = comments)]
pub struct NewComment {
    pub id: Uuid,
    pub thread_id: Uuid,
    pub author_id: Option<Uuid>,
    pub author_name: String,
    pub body: String,
}

#[derive(Serialize)]
pub struct ThreadWithComments {
    #[serde(flatten)]
    pub thread: CommentThread,
    pub comments: Vec<Comment>,
}

#[derive(Deserialize)]
pub struct CreateThreadRequest {
    #[serde(rename = "blockId")]
    pub block_id: String,
    #[serde(rename = "anchorOffset")]
    pub anchor_offset: Option<i32>,
    pub body: String,
}

#[derive(Deserialize)]
pub struct ReplyRequest {
    pub body: String,
}

#[derive(Deserialize)]
pub struct UpdateThreadRequest {
    pub status: String,
}

pub fn mask_deleted(mut comment: Comment) -> Comment {
    if comment.deleted_at.is_some() {
        comment.body = String::new();
    }
    comment
}

pub async fn create_thread(
    conn: &mut AsyncPgConnection,
    new_thread: &NewCommentThread,
) -> Result<CommentThread, ApiError> {
    diesel::insert_into(comment_threads::table)
        .values(new_thread)
        .get_result::<CommentThread>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn create_comment(
    conn: &mut AsyncPgConnection,
    new_comment: &NewComment,
) -> Result<Comment, ApiError> {
    let comment = diesel::insert_into(comments::table)
        .values(new_comment)
        .get_result::<Comment>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    diesel::update(comment_threads::table.find(new_comment.thread_id))
        .set(comment_threads::updated_at.eq(Utc::now()))
        .execute(conn)
        .await
        .ok();

    Ok(comment)
}

pub async fn get_thread(
    conn: &mut AsyncPgConnection,
    thread_id: Uuid,
) -> Result<CommentThread, ApiError> {
    comment_threads::table
        .find(thread_id)
        .select(CommentThread::as_select())
        .first::<CommentThread>(conn)
        .await
        .map_err(|_| ApiError::Request("Thread não encontrada".to_string()))
}

pub async fn get_comment(
    conn: &mut AsyncPgConnection,
    comment_id: Uuid,
) -> Result<Comment, ApiError> {
    comments::table
        .find(comment_id)
        .select(Comment::as_select())
        .first::<Comment>(conn)
        .await
        .map_err(|_| ApiError::Request("Comentário não encontrado".to_string()))
}

pub async fn update_thread_status(
    conn: &mut AsyncPgConnection,
    thread_id: Uuid,
    status: &str,
) -> Result<CommentThread, ApiError> {
    diesel::update(comment_threads::table.find(thread_id))
        .set((
            comment_threads::status.eq(status),
            comment_threads::updated_at.eq(Utc::now()),
        ))
        .get_result::<CommentThread>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn soft_delete_comment(
    conn: &mut AsyncPgConnection,
    comment_id: Uuid,
) -> Result<Comment, ApiError> {
    diesel::update(comments::table.find(comment_id))
        .set(comments::deleted_at.eq(Utc::now()))
        .get_result::<Comment>(conn)
        .await
        .map(mask_deleted)
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_threads_with_comments(
    conn: &mut AsyncPgConnection,
    notebook_id_param: Uuid,
) -> Result<Vec<ThreadWithComments>, ApiError> {
    let threads: Vec<CommentThread> = comment_threads::table
        .filter(comment_threads::notebook_id.eq(notebook_id_param))
        .order(comment_threads::created_at.asc())
        .select(CommentThread::as_select())
        .load::<CommentThread>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let thread_ids: Vec<Uuid> = threads.iter().map(|t| t.id).collect();

    let all_comments: Vec<Comment> = comments::table
        .filter(comments::thread_id.eq_any(&thread_ids))
        .order(comments::created_at.asc())
        .select(Comment::as_select())
        .load::<Comment>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok(threads
        .into_iter()
        .map(|thread| {
            let comments = all_comments
                .iter()
                .filter(|c| c.thread_id == thread.id)
                .cloned()
                .map(mask_deleted)
                .collect();
            ThreadWithComments { thread, comments }
        })
        .collect())
}
