use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Pool};
use uuid::Uuid;

use crate::controllers::utils::get_conn;
use crate::domain::team::{
    RolePermissions, TeamRoleView, build_role_view, find_team_member_with_role,
};
use crate::models::error::ApiError;

pub fn get_user_owner_permissions() -> TeamRoleView {
    TeamRoleView::synthetic("Notebook Owner", RolePermissions::all())
}

pub async fn get_user_notebook_permissions(
    pool: &Pool<AsyncPgConnection>,
    notebook_id: &Uuid,
    user_id: Option<Uuid>,
) -> Result<axum::Json<TeamRoleView>, ApiError> {
    let conn = &mut get_conn(pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let notebook = crate::domain::notebook::find_notebook_by_id(conn, notebook_id).await?;

    if let Some(notebook_user_id) = notebook.user_id
        && let Some(id) = user_id
        && notebook_user_id == id
    {
        return Ok(axum::Json(get_user_owner_permissions()));
    }

    let team_id = match notebook.team_id {
        Some(id) => id,
        None => {
            if notebook.is_public {
                return Ok(axum::Json(TeamRoleView::view_only()));
            }
            return Ok(axum::Json(TeamRoleView::all_false()));
        }
    };

    let Some(id) = user_id else {
        if notebook.is_public {
            return Ok(axum::Json(TeamRoleView::view_only()));
        }
        return Ok(axum::Json(TeamRoleView::all_false()));
    };

    let role = match find_team_member_with_role(conn, team_id, id).await {
        Ok((_, role)) => role,
        Err(e) => {
            if notebook.is_public {
                return Ok(axum::Json(TeamRoleView::view_only()));
            }
            return Err(e);
        }
    };

    Ok(axum::Json(build_role_view(conn, &role).await?))
}
