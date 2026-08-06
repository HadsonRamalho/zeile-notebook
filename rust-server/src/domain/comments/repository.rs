use chrono::Utc;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::{comment_threads, comments};

use super::dto::ThreadWithComments;
use super::entity::{Comment, CommentThread, NewComment, NewCommentThread};
use super::service::mask_deleted;

pub async fn create_thread(
    conn: &mut AsyncPgConnection,
    new_thread: &NewCommentThread,
) -> Result<CommentThread, ApiError> {
    diesel::insert_into(comment_threads::table)
        .values(new_thread)
        .get_result::<CommentThread>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn create_comment(
    conn: &mut AsyncPgConnection,
    new_comment: &NewComment,
) -> Result<Comment, ApiError> {
    let comment = diesel::insert_into(comments::table)
        .values(new_comment)
        .get_result::<Comment>(conn)
        .await
        .map_err(ApiError::from)?;

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
        .map_err(|_| ApiError::Request("Thread not found".to_string()))
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
        .map_err(|_| ApiError::Request("Comment not found".to_string()))
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
        .map_err(ApiError::from)
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
        .map_err(ApiError::from)
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
        .map_err(ApiError::from)?;

    let thread_ids: Vec<Uuid> = threads.iter().map(|t| t.id).collect();

    let all_comments: Vec<Comment> = comments::table
        .filter(comments::thread_id.eq_any(&thread_ids))
        .order(comments::created_at.asc())
        .select(Comment::as_select())
        .load::<Comment>(conn)
        .await
        .map_err(ApiError::from)?;

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
