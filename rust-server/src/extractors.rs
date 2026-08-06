use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Object};
use uuid::Uuid;

use crate::controllers::jwt::extract_claims_from_header;
use crate::controllers::utils::get_conn;
use crate::models::error::ApiError;
use crate::models::state::AppState;

pub struct AuthUser(pub Uuid);

pub struct OptionalAuthUser(pub Option<Uuid>);

pub struct DbConn(pub Object<AsyncPgConnection>);

impl Deref for DbConn {
    type Target = AsyncPgConnection;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for DbConn {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl FromRequestParts<Arc<AppState>> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let (_, claims) = extract_claims_from_header(&parts.headers).await?;
        Ok(AuthUser(claims.id))
    }
}

impl FromRequestParts<Arc<AppState>> for OptionalAuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let id = match extract_claims_from_header(&parts.headers).await {
            Ok((_, claims)) => Some(claims.id),
            Err(_) => None,
        };
        Ok(OptionalAuthUser(id))
    }
}

impl FromRequestParts<Arc<AppState>> for DbConn {
    type Rejection = ApiError;

    async fn from_request_parts(
        _parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let conn = get_conn(&state.pool)
            .await
            .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
        Ok(DbConn(conn))
    }
}
