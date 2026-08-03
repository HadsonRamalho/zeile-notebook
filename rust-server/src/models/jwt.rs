use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::user::UserRole;
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Claims {
    pub id: Uuid,
    pub public_id: i32,
    pub role: UserRole,
    pub email: String,
    pub exp: usize,
    /// Issuance instant. Optional so a token issued before this version keeps
    /// decoding instead of dropping every session on deploy.
    #[serde(default)]
    pub iat: Option<i64>,
}
