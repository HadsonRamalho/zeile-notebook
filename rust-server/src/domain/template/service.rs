use diesel_async::AsyncPgConnection;
use uuid::Uuid;

use crate::controllers::permissions::require_team_permission;
use crate::domain::team::find_team_member_with_role;
use crate::models::error::ApiError;

use super::entity::Template;

pub const ALLOWED_KINDS: &[&str] = &["typst"];

pub async fn authorize_manage(
    conn: &mut AsyncPgConnection,
    template: &Template,
    user_id: Uuid,
) -> Result<(), ApiError> {
    if template.user_id == Some(user_id) {
        return Ok(());
    }
    if let Some(team_id) = template.team_id {
        return require_team_permission(conn, user_id, team_id, "notebook.edit").await;
    }
    Err(ApiError::PermissionDenied("template.manage".to_string()))
}

pub async fn authorize_use(
    conn: &mut AsyncPgConnection,
    template: &Template,
    user_id: Option<Uuid>,
) -> Result<(), ApiError> {
    if template.is_public {
        return Ok(());
    }
    if let (Some(owner), Some(uid)) = (template.user_id, user_id)
        && owner == uid
    {
        return Ok(());
    }
    if let (Some(team_id), Some(uid)) = (template.team_id, user_id)
        && find_team_member_with_role(conn, team_id, uid).await.is_ok()
    {
        return Ok(());
    }
    Err(ApiError::PermissionDenied("template.use".to_string()))
}
