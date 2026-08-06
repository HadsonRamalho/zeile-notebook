use serde::Deserialize;
use validator::Validate;

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnapshotRequest {
    #[validate(length(
        min = 1,
        max = 300,
        message = "Label must be between 1 and 300 characters"
    ))]
    pub label: String,
    pub note: Option<String>,
}
