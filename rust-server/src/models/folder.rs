use crate::models::error::ApiError;
use crate::schema::{folders, notebooks};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::folders)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: Uuid,
    pub name: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub tags: serde_json::Value,
}

#[derive(Insertable)]
#[diesel(table_name = folders)]
pub struct NewFolder {
    pub id: Uuid,
    pub name: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FolderNameRequest {
    pub name: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveFolderRequest {
    pub folder_id: Option<Uuid>,
}

pub async fn create_folder(
    conn: &mut AsyncPgConnection,
    new_folder: &NewFolder,
) -> Result<Folder, ApiError> {
    diesel::insert_into(folders::table)
        .values(new_folder)
        .get_result::<Folder>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn get_folder(conn: &mut AsyncPgConnection, folder_id: Uuid) -> Result<Folder, ApiError> {
    folders::table
        .find(folder_id)
        .get_result::<Folder>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_personal_folders(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
) -> Result<Vec<Folder>, ApiError> {
    folders::table
        .filter(folders::user_id.eq(param_user_id))
        .order(folders::name.asc())
        .load::<Folder>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_team_folders(
    conn: &mut AsyncPgConnection,
    param_team_id: Uuid,
) -> Result<Vec<Folder>, ApiError> {
    folders::table
        .filter(folders::team_id.eq(param_team_id))
        .order(folders::name.asc())
        .load::<Folder>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn rename_folder(
    conn: &mut AsyncPgConnection,
    folder_id: Uuid,
    new_name: &str,
) -> Result<Folder, ApiError> {
    diesel::update(folders::table.find(folder_id))
        .set((
            folders::name.eq(new_name),
            folders::updated_at.eq(Utc::now()),
        ))
        .get_result::<Folder>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn delete_folder(conn: &mut AsyncPgConnection, folder_id: Uuid) -> Result<(), ApiError> {
    diesel::delete(folders::table.find(folder_id))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(ApiError::from)
}

pub async fn set_folder_tags(
    conn: &mut AsyncPgConnection,
    folder_id: Uuid,
    new_tags: &[String],
) -> Result<Folder, ApiError> {
    let value = serde_json::to_value(new_tags).unwrap_or_else(|_| serde_json::Value::Array(vec![]));
    diesel::update(folders::table.find(folder_id))
        .set((folders::tags.eq(value), folders::updated_at.eq(Utc::now())))
        .get_result::<Folder>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn set_notebook_folder(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
    folder_id: Option<Uuid>,
) -> Result<(), ApiError> {
    diesel::update(notebooks::table.find(notebook_id))
        .set(notebooks::folder_id.eq(folder_id))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(ApiError::from)
}
