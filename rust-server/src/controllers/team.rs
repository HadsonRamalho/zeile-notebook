use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use diesel_async::AsyncPgConnection;
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;

use crate::{
    controllers::{
        jwt::extract_claims_from_header, permissions::require_team_permission, utils::get_conn,
    },
    models::{
        self,
        error::ApiError,
        notebook::{NewNotebook, Notebook},
        state::AppState,
        team::{
            NewTeam, NewTeamMember, NewTeamRole, NewTeamRoleRequest, Team, TeamMember,
            TeamMemberResponse, TeamRole, UpdateMemberRoleRequest, UpdateTeam, UpdateTeamRole,
        },
    },
};

pub fn get_default_roles(team_id: &Uuid) -> Vec<NewTeamRole> {
    let admin_role = NewTeamRole {
        team_id: team_id.clone(),
        name: "Owner".to_string(),
        can_read: true,
        can_write: true,
        can_manage_privacy: true,
        can_manage_clones: true,
        can_invite_users: true,
        can_remove_users: true,
        can_manage_permissions: true,
        can_manage_team: true,
    };

    let member_role = NewTeamRole {
        team_id: team_id.clone(),
        name: "Member".to_string(),
        can_read: true,
        can_write: true,
        can_manage_privacy: false,
        can_manage_clones: false,
        can_invite_users: false,
        can_remove_users: false,
        can_manage_permissions: false,
        can_manage_team: false,
    };

    vec![admin_role, member_role]
}

pub async fn get_team_member(
    conn: &mut AsyncPgConnection,
    team_id: Uuid,
    user_id: Uuid,
) -> Result<(TeamMember, TeamRole), ApiError> {
    let member = match models::team::find_team_member_with_role(conn, team_id, user_id).await {
        Ok(m) => m,
        Err(_) => return Err(ApiError::InvalidAuthorizationToken),
    };

    Ok(member)
}

#[utoipa::path(
    post,
    path = "/teams/{team_id}/notebook/create",
    params(("team_id" = String, Path, description = "ID do Time")),
    responses((status = OK, body = String), (status = 401, body = ApiError))
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
        id: page_id.clone(),
        user_id: None,
        team_id: Some(team_id),
        title: "Nova Página".to_string(),
    };

    crate::models::notebook::create_notebook(conn, &new_page)
        .await
        .map_err(|e| ApiError::Database(e))?;

    Ok((StatusCode::OK, Json(page_id)))
}

#[utoipa::path(
    get,
    path = "/teams/{team_id}/notebooks",
    responses((status = 401, body = ApiError))
)]
pub async fn api_get_team_pages(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<Notebook>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "notebook.view").await?;

    let pages = models::notebook::get_team_notebooks(conn, &team_id)
        .await
        .map_err(|e| ApiError::Database(e))?;

    Ok(Json(pages))
}

#[utoipa::path(
    patch,
    path = "/teams/{team_id}",
    responses((status = OK), (status = 403, body = ApiError))
)]
pub async fn api_update_team(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateTeam>,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.edit_name").await?;

    let _ = models::team::update_team_data(conn, team_id, &payload)
        .await
        .map_err(|e| e)?;

    Ok(StatusCode::OK)
}

pub async fn api_get_team_roles(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<TeamRole>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.roles.edit_role_permissions").await?;

    let roles = models::team::find_roles_by_team(conn, team_id).await?;
    Ok(Json(roles))
}

pub async fn api_create_team_role(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<NewTeamRoleRequest>,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.roles.create_role").await?;

    let role_request = payload;
    let role = NewTeamRole::from_request(team_id, role_request);

    match models::team::create_team_role(conn, &role).await {
        Ok(_) => Ok(StatusCode::CREATED),
        Err(e) => Err(e),
    }
}

pub async fn api_get_user_teams(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<(Team, TeamRole)>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    match models::team::find_user_teams(conn, user_id).await {
        Ok(t) => Ok(Json(t)),
        Err(e) => Err(e),
    }
}

pub async fn api_update_team_role(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateTeamRole>,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    require_team_permission(conn, user_id, team_id, "team.roles.edit_role_name").await?;

    match models::team::update_team_role(conn, payload.id, &payload).await {
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

    match models::team::remove_user_from_team(conn, team_id, target).await {
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

    require_team_permission(conn, user_id, team_id, "team.manage").await?;

    let roles = models::team::find_roles_by_team(conn, team_id).await?;
    if !roles.iter().any(|r| r.id == payload.role_id) {
        return Err(ApiError::Request(
            "O cargo não pertence a este time".to_string(),
        ));
    }

    models::team::update_member_role(conn, team_id, payload.user_id, payload.role_id).await?;

    crate::controllers::permissions::broadcast_capability_change_for_team(
        &state.pool,
        &state.presence_registry,
        team_id,
    )
    .await;

    Ok(StatusCode::OK)
}

pub async fn api_get_team_members(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<(TeamMemberResponse, TeamRole)>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let _ = get_team_member(conn, team_id, user_id).await?;

    match models::team::find_team_members_with_roles(conn, team_id).await {
        Ok(members) => Ok(Json(members)),
        Err(e) => Err(e),
    }
}

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

    match models::team::find_team_by_id(conn, team_id).await {
        Ok(team) => Ok(Json(team)),
        Err(e) => Err(e),
    }
}

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

    match models::team::delete_team(conn, team_id).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err(e),
    }
}

pub async fn api_create_team(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(data): Json<NewTeam>,
) -> Result<Json<Team>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let team = match models::team::create_team(conn, &data).await {
        Ok(t) => t,
        Err(e) => return Err(e),
    };

    let default_roles = get_default_roles(&team.id);

    let mut team_roles: Vec<TeamRole> = vec![];
    for role in default_roles.iter() {
        match models::team::create_team_role(conn, &role).await {
            Ok(t) => {
                team_roles.push(t);
            }
            _ => {}
        }
    }

    let admin_role = team_roles.first().unwrap();

    match models::team::add_user_to_team(
        conn,
        &NewTeamMember {
            team_id: team.id.clone(),
            user_id,
            role_id: admin_role.id,
        },
    )
    .await
    {
        _ => {}
    }

    Ok(Json(team))
}

pub async fn api_get_user_team_permissions(
    State(state): State<Arc<AppState>>,
    Path(team_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<(TeamMember, TeamRole)>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let member = get_team_member(conn, team_id, user_id).await?;

    Ok(Json(member))
}
