use std::sync::Arc;

use axum::routing::{delete, get, patch, post};
use utoipa_axum::router::OpenApiRouter;

use crate::{
    controllers::{
        grants::{api_create_team_grant, api_delete_team_grant, api_list_team_grants},
        permissions::api_get_team_capabilities,
        team::{
            api_create_team, api_create_team_page, api_create_team_role, api_delete_team,
            api_get_team, api_get_team_members, api_get_team_pages, api_get_team_roles,
            api_get_user_team_permissions, api_get_user_teams, api_remove_user_from_team,
            api_update_member_role, api_update_team, api_update_team_role,
        },
        team_invitation::{api_accept_invite, api_invite_member},
    },
    models::state::AppState,
};

pub async fn team_routes() -> OpenApiRouter<Arc<AppState>> {
    let routes = OpenApiRouter::new()
        .route("/{id}/notebooks", post(api_create_team_page))
        .route("/{id}/notebooks", get(api_get_team_pages))
        .route("/{id}/roles", get(api_get_team_roles))
        .route("/{id}/roles", post(api_create_team_role))
        .route("/{id}/roles", patch(api_update_team_role))
        .route("/{id}/capabilities", get(api_get_team_capabilities))
        .route("/{id}/grants", get(api_list_team_grants))
        .route("/{id}/grants", post(api_create_team_grant))
        .route("/{id}/grants/{grant_id}", delete(api_delete_team_grant))
        .route("/{id}/members", delete(api_remove_user_from_team))
        .route("/{id}/members", get(api_get_team_members))
        .route("/{id}/members", patch(api_update_member_role))
        .route(
            "/{id}/members/permissions",
            get(api_get_user_team_permissions),
        )
        .route("/{id}", patch(api_update_team))
        .route("/{id}", get(api_get_team))
        .route("/{id}", delete(api_delete_team))
        .route("/invites/accept", post(api_accept_invite))
        .route("/{id}/invites", post(api_invite_member))
        .route("/", post(api_create_team))
        .route("/", get(api_get_user_teams));

    routes
}
