use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use diesel_async::AsyncPgConnection;
use hyper::{HeaderMap, StatusCode};
use uuid::Uuid;
use validator::Validate;

use crate::{
    controllers::{
        jwt::extract_claims_from_header, permissions::require_team_permission, utils::get_conn,
    },
    domain::notebook::{NewNotebook, NotebookDto},
    models::{
        self,
        error::ApiError,
        state::AppState,
        team::{
            NewTeam, NewTeamMember, NewTeamRole, NewTeamRoleRequest, RolePermissions, Team,
            TeamMember, TeamMemberResponse, TeamRole, TeamRoleView, UpdateMemberRoleRequest,
            UpdateTeam, UpdateTeamRole,
        },
    },
};

pub fn get_default_roles(team_id: &Uuid) -> Vec<(NewTeamRole, RolePermissions)> {
    let admin_role = (
        NewTeamRole {
            team_id: *team_id,
            name: "Owner".to_string(),
        },
        RolePermissions::all(),
    );

    let member_role = (
        NewTeamRole {
            team_id: *team_id,
            name: "Member".to_string(),
        },
        RolePermissions {
            can_read: true,
            can_write: true,
            ..RolePermissions::default()
        },
    );

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

    let _ = models::team::update_team_data(conn, team_id, &payload).await?;

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

    let roles = models::team::find_roles_by_team(conn, team_id).await?;
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

    match models::team::create_team_role(conn, &role, payload.permissions).await {
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

    match models::team::find_user_teams(conn, user_id).await {
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

    let roles = models::team::find_roles_by_team(conn, team_id).await?;
    if !roles.iter().any(|r| r.id == payload.role_id) {
        return Err(ApiError::Request(
            "O cargo não pertence a este time".to_string(),
        ));
    }

    let previous_role = models::team::find_team_member_with_role(conn, team_id, payload.user_id)
        .await
        .map(|(_, role)| role.id)?;

    models::team::update_member_role(conn, team_id, payload.user_id, payload.role_id).await?;

    if let Err(e) =
        crate::controllers::permissions::ensure_team_not_locked(conn, team_id, None).await
    {
        models::team::update_member_role(conn, team_id, payload.user_id, previous_role).await?;
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

    match models::team::find_team_members_with_roles(conn, team_id).await {
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

    match models::team::find_team_by_id(conn, team_id).await {
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

    match models::team::delete_team(conn, team_id).await {
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

    let team = match models::team::create_team(conn, &data).await {
        Ok(t) => t,
        Err(e) => return Err(e),
    };

    let default_roles = get_default_roles(&team.id);

    let mut team_roles: Vec<TeamRole> = vec![];
    for (role, permissions) in default_roles.iter() {
        if let Ok(t) = models::team::create_team_role(conn, role, *permissions).await {
            team_roles.push(t);
        }
    }

    let admin_role = team_roles.first().unwrap();

    models::team::add_user_to_team(
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
    let view = models::team::build_role_view(conn, &role).await?;

    Ok(Json((member, view)))
}
