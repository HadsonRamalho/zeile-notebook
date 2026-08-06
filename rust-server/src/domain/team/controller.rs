use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{Duration, Utc};
use hyper::{HeaderMap, StatusCode};
use rand::{Rng, distributions::Alphanumeric};
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        email::send_team_invitation_email, jwt::extract_claims_from_header,
        permissions::require_team_permission, utils::get_conn,
    },
    domain::notebook::{NewNotebook, NotebookDto},
    models::{error::ApiError, state::AppState},
};

use super::dto::{
    AcceptInviteRequest, InviteRequest, NewTeamRoleRequest, TeamMemberResponse, TeamRoleView,
    UpdateMemberRoleRequest, UpdateTeamRole,
};
use super::entity::{
    NewTeam, NewTeamInvitation, NewTeamMember, NewTeamRole, Team, TeamMember, TeamRole, UpdateTeam,
};
use super::repository;
use super::service::{email_matches, get_default_roles, get_team_member};

#[utoipa::path(
    post,
    path = "/team/{id}/notebooks",
    responses((status = OK, body = Uuid), (status = 401, body = ApiError))
)]
pub async fn api_create_team_page(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Uuid>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "notebook.pages.add").await?;

    let page_id = Uuid::new_v4();
    let new_page = NewNotebook {
        id: page_id,
        user_id: None,
        team_id: Some(team_id),
        title: "Nova Página".to_string(),
    };

    crate::domain::notebook::create_notebook(conn, &new_page)
        .await
        .map_err(ApiError::Database)?;

    Ok((StatusCode::OK, Json(page_id)))
}

#[utoipa::path(
    get,
    path = "/team/{id}/notebooks",
    responses((status = OK, body = Vec<NotebookDto>), (status = 401, body = ApiError))
)]
pub async fn api_get_team_pages(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<NotebookDto>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "notebook.view").await?;

    let pages = crate::domain::notebook::get_team_notebooks(conn, &team_id)
        .await
        .map_err(ApiError::Database)?;

    Ok(Json(pages.into_iter().map(NotebookDto::from).collect()))
}

#[utoipa::path(
    patch,
    path = "/team/{id}",
    request_body = UpdateTeam,
    responses((status = OK), (status = 403, body = ApiError))
)]
pub async fn api_update_team(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateTeam>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.edit_name").await?;

    let _ = repository::update_team_data(conn, team_id, &payload).await?;

    Ok(StatusCode::OK)
}

#[utoipa::path(get, path = "/team/{id}/roles", responses((status = OK, body = Vec<TeamRoleView>), (status = 401, body = ApiError)))]
pub async fn api_get_team_roles(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<TeamRoleView>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.roles.edit_role_permissions").await?;

    let roles = repository::find_roles_by_team(conn, team_id).await?;
    Ok(Json(roles))
}

#[utoipa::path(post, path = "/team/{id}/roles", request_body = NewTeamRoleRequest, responses((status = CREATED), (status = 401, body = ApiError)))]
pub async fn api_create_team_role(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<NewTeamRoleRequest>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.roles.create_role").await?;

    let role = NewTeamRole {
        team_id,
        name: payload.name,
    };

    match repository::create_team_role(conn, &role, payload.permissions).await {
        Ok(_) => Ok(StatusCode::CREATED),
        Err(e) => Err(e),
    }
}

#[utoipa::path(get, path = "/team/", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_get_user_teams(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<(Team, TeamRoleView)>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    match repository::find_user_teams(conn, user_id).await {
        Ok(t) => Ok(Json(t)),
        Err(e) => Err(e),
    }
}

#[utoipa::path(patch, path = "/team/{id}/roles", request_body = UpdateTeamRole, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_update_team_role(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateTeamRole>,
) -> Result<StatusCode, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.roles.edit_role_name").await?;

    match repository::update_team_role(conn, payload.id, &payload).await {
        Ok(_) => {
            crate::controllers::permissions::broadcast_capability_change_for_team(
                &state.pool,
                &state.presence_registry,
                team_id,
            )
            .await;
            Ok(StatusCode::OK)
        }
        Err(e) => Err(e),
    }
}

#[utoipa::path(delete, path = "/team/{id}/members", request_body = Uuid, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_remove_user_from_team(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(target): Json<Uuid>,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.remove_users").await?;

    if target == user_id {
        return Err(ApiError::PermissionDenied(
            "Você não pode remover a si mesmo do time".to_string(),
        ));
    }

    crate::controllers::permissions::ensure_team_not_locked(conn, team_id, Some(target)).await?;

    match repository::remove_user_from_team(conn, team_id, target).await {
        Ok(_) => {
            crate::controllers::permissions::broadcast_capability_change_for_team(
                &state.pool,
                &state.presence_registry,
                team_id,
            )
            .await;
            Ok(StatusCode::OK)
        }
        Err(e) => Err(e),
    }
}

#[utoipa::path(patch, path = "/team/{id}/members", request_body = UpdateMemberRoleRequest, responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_update_member_role(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateMemberRoleRequest>,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.roles.edit_role_permissions").await?;

    if payload.user_id == user_id {
        return Err(ApiError::PermissionDenied(
            "Você não pode alterar o seu próprio cargo".to_string(),
        ));
    }

    let roles = repository::find_roles_by_team(conn, team_id).await?;
    if !roles.iter().any(|r| r.id == payload.role_id) {
        return Err(ApiError::Request(
            "O cargo não pertence a este time".to_string(),
        ));
    }

    let previous_role = repository::find_team_member_with_role(conn, team_id, payload.user_id)
        .await
        .map(|(_, role)| role.id)?;

    repository::update_member_role(conn, team_id, payload.user_id, payload.role_id).await?;

    if let Err(e) =
        crate::controllers::permissions::ensure_team_not_locked(conn, team_id, None).await
    {
        repository::update_member_role(conn, team_id, payload.user_id, previous_role).await?;
        return Err(e);
    }

    crate::controllers::permissions::broadcast_capability_change_for_team(
        &state.pool,
        &state.presence_registry,
        team_id,
    )
    .await;

    Ok(StatusCode::OK)
}

#[utoipa::path(get, path = "/team/{id}/members", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_get_team_members(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<(TeamMemberResponse, TeamRoleView)>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let _ = get_team_member(conn, team_id, user_id).await?;

    match repository::find_team_members_with_roles(conn, team_id).await {
        Ok(members) => Ok(Json(members)),
        Err(e) => Err(e),
    }
}

#[utoipa::path(get, path = "/team/{id}", responses((status = OK, body = Team), (status = 401, body = ApiError)))]
pub async fn api_get_team(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Team>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let _ = get_team_member(conn, team_id, user_id).await?;

    match repository::find_team_by_id(conn, team_id).await {
        Ok(team) => Ok(Json(team)),
        Err(e) => Err(e),
    }
}

#[utoipa::path(delete, path = "/team/{id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_team(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.manage").await?;

    match repository::delete_team(conn, team_id).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(e),
    }
}

#[utoipa::path(post, path = "/team/", request_body = NewTeam, responses((status = CREATED, body = Team), (status = 401, body = ApiError)))]
pub async fn api_create_team(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(data): Json<NewTeam>,
) -> Result<Json<Team>, ApiError> {
    if let Err(errors) = data.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let team = match repository::create_team(conn, &data).await {
        Ok(t) => t,
        Err(e) => return Err(e),
    };

    let default_roles = get_default_roles(&team.id);

    let mut team_roles: Vec<TeamRole> = vec![];
    for (role, permissions) in default_roles.iter() {
        if let Ok(t) = repository::create_team_role(conn, role, *permissions).await {
            team_roles.push(t);
        }
    }

    let admin_role = team_roles.first().unwrap();

    repository::add_user_to_team(
        conn,
        &NewTeamMember {
            team_id: team.id,
            user_id,
            role_id: admin_role.id,
        },
    )
    .await?;

    Ok(Json(team))
}

#[utoipa::path(get, path = "/team/{id}/members/permissions", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_get_user_team_permissions(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<(TeamMember, TeamRoleView)>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let (member, role) = get_team_member(conn, team_id, user_id).await?;
    let view = repository::build_role_view(conn, &role).await?;

    Ok(Json((member, view)))
}

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

    let invited_by = crate::models::user::find_user_by_id(conn, &id).await?;

    let token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let expires_at = (Utc::now() + Duration::days(7)).naive_utc();

    let team = repository::find_team_by_id(conn, team_id).await?;

    let new_invite = NewTeamInvitation {
        team_id,
        role_id: payload.role_id,
        email: payload.email.clone(),
        token: token.clone(),
        expires_at,
    };

    if let Err(e) = repository::create_invitation(conn, &new_invite).await {
        return Err(ApiError::Database(e));
    }

    let invited_user = crate::models::user::find_user_by_email(conn, &payload.email).await?;

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
        crate::domain::push::send_push_to_user(
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

    let user = crate::models::user::find_user_by_id(conn, &id).await?;

    // The invite is found, but not consumed on the way in: if it were consumed
    // first, whoever has the link would burn the invite for the person who
    // was actually invited.
    let invitation = match repository::find_invitation_by_token(conn, payload.token.trim()).await {
        Ok(inv) => inv,
        Err(_) => return Err(ApiError::InvalidData),
    };

    if Utc::now().naive_utc() > invitation.expires_at {
        repository::delete_invitation(conn, invitation.id)
            .await
            .ok();
        return Err(ApiError::InvalidData);
    }

    if !email_matches(&invitation.email, &user.email) {
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

    repository::add_user_to_team(conn, &new_member).await?;

    // Only consumed after joining the team: if the insert fails, the invite
    // is still valid for a new attempt.
    repository::delete_invitation(conn, invitation.id)
        .await
        .ok();

    Ok(StatusCode::OK)
}
