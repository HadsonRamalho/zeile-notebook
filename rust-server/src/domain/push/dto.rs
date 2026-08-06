use serde::Deserialize;
use validator::Validate;

#[derive(Deserialize, Validate, utoipa::ToSchema)]
pub struct PushSubscriptionKeysRequest {
    #[validate(length(min = 1, message = "p256dh key is required"))]
    pub p256dh: String,
    #[validate(length(min = 1, message = "auth key is required"))]
    pub auth: String,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
pub struct PushSubscriptionRequest {
    #[validate(url(message = "Invalid push endpoint"))]
    pub endpoint: String,
    #[validate(nested)]
    pub keys: PushSubscriptionKeysRequest,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
pub struct PushUnsubscribeRequest {
    #[validate(url(message = "Invalid push endpoint"))]
    pub endpoint: String,
}
