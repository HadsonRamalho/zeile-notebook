use serde::Deserialize;
use uuid::Uuid;
use validator::Validate;

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    #[validate(length(
        min = 1,
        max = 10000,
        message = "Message must be between 1 and 10000 characters"
    ))]
    pub content: String,
    pub parent_id: Option<Uuid>,
    pub quoted_message_id: Option<Uuid>,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
pub struct EditMessageRequest {
    #[validate(length(
        min = 1,
        max = 10000,
        message = "Message must be between 1 and 10000 characters"
    ))]
    pub content: String,
}
