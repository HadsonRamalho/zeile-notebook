use serde::Deserialize;

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecordEditRequest {
    pub block_id: Option<String>,
}
