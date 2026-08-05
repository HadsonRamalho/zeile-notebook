use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{Duration, Utc};
use hyper::{HeaderMap, StatusCode};
use rand::{Rng, distributions::Alphanumeric};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        email::send_team_invitation_email, jwt::extract_claims_from_header,
        permissions::require_team_permission, utils::get_conn,
    },
    models::{
        self,
        error::ApiError,
        state::AppState,
        team::NewTeamMember,
        team_invitation::{AcceptInviteRequest, InviteRequest, NewTeamInvitation},
    },
};

#[utoipa::path(post, path = "/team/{id}/invites", request_body = InviteRequest, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_invite_member(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<InviteRequest>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, id, team_id, "team.invite_users").await?;

    let invited_by = models::user::find_user_by_id(conn, &id).await?;

    let token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let expires_at = (Utc::now() + Duration::days(7)).naive_utc();

    let team = models::team::find_team_by_id(conn, team_id).await?;

    let new_invite = NewTeamInvitation {
        team_id,
        role_id: payload.role_id,
        email: payload.email.clone(),
        token: token.clone(),
        expires_at,
    };

    if let Err(e) = crate::models::team_invitation::create_invitation(conn, &new_invite).await {
        return Err(ApiError::Database(e));
    }

    let invited_user = models::user::find_user_by_email(conn, &payload.email).await?;

    let magic_link = format!(
        "{}/invite?token={}",
        std::env::var("FRONTEND_URL").unwrap(),
        token
    );

    let _ = send_team_invitation_email(&invited_user, &magic_link, &team.name, &invited_by.name)
        .await?;

    let push_state = state.clone();
    let push_user_id = invited_user.id;
    let push_title = format!("Convite para o time {}", team.name);
    let push_body = format!("{} te convidou para o time {}", invited_by.name, team.name);
    let push_url = format!("/invite?token={}", token);
    tokio::spawn(async move {
        crate::controllers::push::send_push_to_user(
            &push_state,
            push_user_id,
            &push_title,
            &push_body,
            &push_url,
        )
        .await;
    });

    Ok(StatusCode::OK)
}

#[utoipa::path(post, path = "/team/invites/accept", request_body = AcceptInviteRequest, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_accept_invite(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<AcceptInviteRequest>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let user = models::user::find_user_by_id(conn, &id).await?;

    // The invite is found, but not consumed on the way in: if it were consumed
    // first, whoever has the link would burn the invite for the person who
    // was actually invited.
    let invitation =
        match crate::models::team_invitation::find_invitation_by_token(conn, payload.token.trim())
            .await
        {
            Ok(inv) => inv,
            Err(_) => return Err(ApiError::InvalidData),
        };

    if Utc::now().naive_utc() > invitation.expires_at {
        crate::models::team_invitation::delete_invitation(conn, invitation.id)
            .await
            .ok();
        return Err(ApiError::InvalidData);
    }

    if !crate::models::team_invitation::email_matches(&invitation.email, &user.email) {
        tracing::warn!(
            "team {} invite refused: accepted by an account other than the one invited",
            invitation.team_id
        );
        return Err(ApiError::PermissionDenied(
            "Este convite foi enviado para outro e-mail.".to_string(),
        ));
    }

    let new_member = NewTeamMember {
        team_id: invitation.team_id,
        user_id: user.id,
        role_id: invitation.role_id,
    };

    models::team::add_user_to_team(conn, &new_member).await?;

    // Only consumed after joining the team: if the insert fails, the invite
    // is still valid for a new attempt.
    crate::models::team_invitation::delete_invitation(conn, invitation.id)
        .await
        .ok();

    Ok(StatusCode::OK)
}
