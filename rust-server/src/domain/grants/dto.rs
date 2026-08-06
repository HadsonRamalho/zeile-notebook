use serde::Deserialize;
use uuid::Uuid;

use super::entity::{GrantEffect, GrantSubjectKind, GrantTargetKind};

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicGrantRequest {
    #[serde(alias = "permission_key")]
    pub permission_key: String,
    pub effect: GrantEffect,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateGrantRequest {
    #[serde(alias = "subject_kind")]
    pub subject_kind: GrantSubjectKind,
    #[serde(alias = "subject_id")]
    pub subject_id: Option<Uuid>,
    #[serde(alias = "permission_key")]
    pub permission_key: String,
    #[serde(alias = "target_kind")]
    pub target_kind: GrantTargetKind,
    #[serde(alias = "target_id")]
    pub target_id: Option<Uuid>,
    #[serde(alias = "target_value")]
    pub target_value: Option<String>,
    pub effect: GrantEffect,
}
