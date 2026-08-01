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
    /// Instante de emissão. Opcional para que token emitido antes desta versão
    /// continue decodificando em vez de derrubar todas as sessões no deploy.
    #[serde(default)]
    pub iat: Option<i64>,
}
