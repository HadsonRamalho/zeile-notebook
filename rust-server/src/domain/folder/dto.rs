use serde::Deserialize;
use uuid::Uuid;
use validator::Validate;

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FolderNameRequest {
    #[validate(length(
        min = 1,
        max = 300,
        message = "Name must be between 1 and 300 characters"
    ))]
    pub name: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveFolderRequest {
    pub folder_id: Option<Uuid>,
}
