use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        activity::spawn_record,
        jwt::extract_claims_from_header,
        notifications::{NotificationInput, spawn_deliver},
        permissions::{TargetCtx, require},
        utils::get_conn,
        websocket::broadcast_comment_event,
    },
    models::{
        self,
        comment::{
            Comment, CommentThread, CreateThreadRequest, NewComment, NewCommentThread,
            ReplyRequest, ThreadWithComments, UpdateThreadRequest,
        },
        error::ApiError,
        state::AppState,
        ws_message::WsServerMessage,
    },
};

fn comment_signal(notebook_id: Uuid) -> String {
    serde_json::to_string(&WsServerMessage::CommentEvent { notebook_id })
        .expect("WsServerMessage::CommentEvent always serializes")
}

fn mentions_name(text: &str, name: &str) -> bool {
    let pattern = format!("@{}", name);
    text.to_lowercase().contains(&pattern.to_lowercase())
}

async fn author_name(conn: &mut diesel_async::AsyncPgConnection, user_id: Uuid) -> String {
    models::user::find_user_by_id(conn, &user_id)
        .await
        .map(|u| u.name)
        .unwrap_or_else(|_| "Usuário".to_string())
}

fn notify_mentions(
    state: &Arc<AppState>,
    notebook_id: Uuid,
    block_id: String,
    body: String,
    sender_id: Uuid,
    sender_name: String,
) {
    let state = state.clone();
    tokio::spawn(async move {
        let Ok(mut conn) = get_conn(&state.pool).await else {
            return;
        };
        let Ok(notebook) =
            crate::domain::notebook::find_notebook_by_id(&mut conn, &notebook_id).await
        else {
            return;
        };

        let mut candidates: Vec<(Uuid, String)> = Vec::new();
        if let Some(owner_id) = notebook.user_id
            && let Ok(owner) = models::user::find_user_by_id(&mut conn, &owner_id).await
        {
            candidates.push((owner_id, owner.name));
        }
        if let Some(team_id) = notebook.team_id
            && let Ok(members) =
                models::team::find_team_members_with_roles(&mut conn, team_id).await
        {
            for (member, _role) in members {
                candidates.push((member.user_id, member.name));
            }
        }

        let mut targets: Vec<Uuid> = Vec::new();
        for (uid, name) in candidates {
            if uid != sender_id && mentions_name(&body, &name) && !targets.contains(&uid) {
                targets.push(uid);
            }
        }

        if targets.is_empty() {
            return;
        }

        spawn_deliver(
            state.clone(),
            targets,
            NotificationInput {
                kind: "comment_mention".to_string(),
                title: format!("{} mencionou você em um comentário", sender_name),
                body,
                url: Some(format!("/notebook/{}?block={}", notebook_id, block_id)),
                notebook_id: Some(notebook_id),
                team_id: notebook.team_id,
            },
        );
    });
}

#[utoipa::path(get, path = "/notebook/{id}/comments", responses((status = OK, body = Vec<ThreadWithComments>), (status = 401, body = ApiError)))]
pub async fn api_list_comments(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Vec<ThreadWithComments>>), ApiError> {
    let user_id = extract_claims_from_header(&headers)
        .await
        .ok()
        .map(|c| c.1.id);

    require(
        &state.pool,
        user_id,
        notebook_id,
        "comment.view",
        &TargetCtx::default(),
    )
    .await?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let threads = models::comment::list_threads_with_comments(conn, notebook_id).await?;
    Ok((StatusCode::OK, Json(threads)))
}

#[utoipa::path(post, path = "/notebook/{id}/comments", request_body = CreateThreadRequest, responses((status = CREATED, body = ThreadWithComments), (status = 401, body = ApiError)))]
pub async fn api_create_thread(
    State(state): State<Arc<AppState>>,
    Path(notebook_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<CreateThreadRequest>,
) -> Result<(StatusCode, Json<ThreadWithComments>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "comment.create",
        &TargetCtx::default(),
    )
    .await?;

    let body = payload.body.trim().to_string();
    if body.is_empty() {
        return Err(ApiError::Request("Comentário vazio".to_string()));
    }
    if payload.block_id.trim().is_empty() {
        return Err(ApiError::Request("Bloco inválido".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let name = author_name(conn, user_id).await;

    let thread = models::comment::create_thread(
        conn,
        &NewCommentThread {
            id: Uuid::new_v4(),
            notebook_id,
            block_id: payload.block_id.clone(),
            anchor_offset: payload.anchor_offset,
            status: "open".to_string(),
            created_by: Some(user_id),
        },
    )
    .await?;

    let comment = models::comment::create_comment(
        conn,
        &NewComment {
            id: Uuid::new_v4(),
            thread_id: thread.id,
            author_id: Some(user_id),
            author_name: name.clone(),
            body: body.clone(),
        },
    )
    .await?;

    broadcast_comment_event(&state, notebook_id, comment_signal(notebook_id));
    spawn_record(
        &state,
        notebook_id,
        Some(user_id),
        name.clone(),
        "comment".to_string(),
        Some(payload.block_id.clone()),
        None,
    );
    notify_mentions(&state, notebook_id, payload.block_id, body, user_id, name);

    Ok((
        StatusCode::CREATED,
        Json(ThreadWithComments {
            thread,
            comments: vec![comment],
        }),
    ))
}

#[utoipa::path(post, path = "/notebook/{id}/comments/threads/{thread_id}/replies", request_body = ReplyRequest, responses((status = CREATED, body = Comment), (status = 401, body = ApiError)))]
pub async fn api_reply(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, thread_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(payload): Json<ReplyRequest>,
) -> Result<(StatusCode, Json<Comment>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "comment.create",
        &TargetCtx::default(),
    )
    .await?;

    let body = payload.body.trim().to_string();
    if body.is_empty() {
        return Err(ApiError::Request("Comentário vazio".to_string()));
    }

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let thread = models::comment::get_thread(conn, thread_id).await?;
    if thread.notebook_id != notebook_id {
        return Err(ApiError::Request("Thread inválida".to_string()));
    }

    let name = author_name(conn, user_id).await;

    let comment = models::comment::create_comment(
        conn,
        &NewComment {
            id: Uuid::new_v4(),
            thread_id,
            author_id: Some(user_id),
            author_name: name.clone(),
            body: body.clone(),
        },
    )
    .await?;

    broadcast_comment_event(&state, notebook_id, comment_signal(notebook_id));
    notify_mentions(&state, notebook_id, thread.block_id, body, user_id, name);

    Ok((StatusCode::CREATED, Json(comment)))
}

#[utoipa::path(patch, path = "/notebook/{id}/comments/threads/{thread_id}", request_body = UpdateThreadRequest, responses((status = OK, body = CommentThread), (status = 401, body = ApiError)))]
pub async fn api_update_thread(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, thread_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(payload): Json<UpdateThreadRequest>,
) -> Result<(StatusCode, Json<CommentThread>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        notebook_id,
        "comment.resolve",
        &TargetCtx::default(),
    )
    .await?;

    let status = match payload.status.as_str() {
        "open" | "resolved" => payload.status.as_str(),
        _ => return Err(ApiError::Request("Status inválido".to_string())),
    };

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let thread = models::comment::get_thread(conn, thread_id).await?;
    if thread.notebook_id != notebook_id {
        return Err(ApiError::Request("Thread inválida".to_string()));
    }

    let updated = models::comment::update_thread_status(conn, thread_id, status).await?;

    broadcast_comment_event(&state, notebook_id, comment_signal(notebook_id));

    Ok((StatusCode::OK, Json(updated)))
}

#[utoipa::path(delete, path = "/notebook/{id}/comments/{comment_id}", responses((status = OK, body = Comment), (status = 401, body = ApiError)))]
pub async fn api_delete_comment(
    State(state): State<Arc<AppState>>,
    Path((notebook_id, comment_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Comment>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let comment = models::comment::get_comment(conn, comment_id).await?;

    if comment.author_id != Some(user_id) {
        require(
            &state.pool,
            Some(user_id),
            notebook_id,
            "comment.resolve",
            &TargetCtx::default(),
        )
        .await?;
    } else {
        require(
            &state.pool,
            Some(user_id),
            notebook_id,
            "comment.create",
            &TargetCtx::default(),
        )
        .await?;
    }

    let deleted = models::comment::soft_delete_comment(conn, comment_id).await?;

    broadcast_comment_event(&state, notebook_id, comment_signal(notebook_id));

    Ok((StatusCode::OK, Json(deleted)))
}
