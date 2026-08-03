//! Session validation against the database: a signed token proves who issued
//! it, not that the account still exists, is still active, or hasn't had its
//! password changed since.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use dashmap::DashMap;
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::deadpool::Pool;
use hyper::StatusCode;
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::models::jwt::Claims;
use crate::models::state::AppState;
use crate::models::user::UserRole;

/// Window in which an already-validated session is accepted without going
/// back to the database. Without this, every authenticated request would
/// take a connection from the pool. Five seconds is the maximum delay for a
/// deactivation to take effect — against the token's seven-day validity,
/// which was the previous state.
const CACHE_TTL: Duration = Duration::from_secs(5);

#[derive(Clone, Copy)]
pub struct ValidSession {
    pub role: UserRole,
}

struct Entry {
    role: UserRole,
    seen_at: Instant,
}

#[derive(Default)]
pub struct SessionCache {
    entries: DashMap<(Uuid, i64), Entry>,
}

impl SessionCache {
    pub fn new() -> Self {
        Self::default()
    }

    fn find(&self, user_id: Uuid, iat: i64, now: Instant) -> Option<UserRole> {
        let entry = self.entries.get(&(user_id, iat))?;

        if now.saturating_duration_since(entry.seen_at) >= CACHE_TTL {
            return None;
        }

        Some(entry.role)
    }

    fn store(&self, user_id: Uuid, iat: i64, role: UserRole, now: Instant) {
        if self.entries.len() > 50_000 {
            self.entries
                .retain(|_, e| now.saturating_duration_since(e.seen_at) < CACHE_TTL);
        }

        self.entries.insert(
            (user_id, iat),
            Entry {
                role,
                seen_at: now,
            },
        );
    }

    pub fn invalidate(&self, user_id: Uuid) {
        self.entries.retain(|(id, _), _| *id != user_id);
    }
}

/// Checks the account against the database. The role returned is the one in
/// the database, not the token's: a demoted admin kept its privilege until
/// the token expired.
pub async fn validate_in_db(
    conn: &mut AsyncPgConnection,
    claims: &Claims,
) -> Result<ValidSession, ApiError> {
    let user = crate::models::user::find_user_by_id(conn, &claims.id)
        .await
        .map_err(|_| ApiError::InvalidAuthorizationToken)?;

    if !user.is_active || user.deleted_at.is_some() {
        return Err(ApiError::NotActiveUser);
    }

    if session_revoked(claims, user.password_changed_at) {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    Ok(ValidSession { role: user.role })
}

/// A token issued before the last password change no longer counts. An old
/// token without `iat` can't be dated, so it survives until it expires — the
/// reach of that ends once tokens issued before this version expire.
pub fn session_revoked(claims: &Claims, password_changed_at: chrono::DateTime<chrono::Utc>) -> bool {
    claims
        .iat
        .is_some_and(|iat| iat < password_changed_at.timestamp())
}

pub async fn validate_session(
    pool: &Pool<AsyncPgConnection>,
    cache: &SessionCache,
    claims: &Claims,
) -> Result<ValidSession, ApiError> {
    let now = Instant::now();
    let iat = claims.iat.unwrap_or(0);

    if let Some(role) = cache.find(claims.id, iat, now) {
        return Ok(ValidSession { role });
    }

    let mut conn = crate::controllers::utils::get_conn(pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let session = validate_in_db(&mut conn, claims).await?;

    cache.store(claims.id, iat, session.role, now);

    Ok(session)
}

/// Rejects a token that decodes but whose account no longer exists, is
/// inactive, or had its password changed. A request without a token, or
/// with a token that doesn't even decode, passes through: the route decides
/// whether to accept it as anonymous.
pub async fn enforce_session(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Response {
    let Ok((_, claims)) =
        crate::controllers::jwt::extract_claims_from_header(request.headers()).await
    else {
        return next.run(request).await;
    };

    match validate_session(&state.pool, &state.sessions, &claims).await {
        Ok(_) => next.run(request).await,
        Err(e) => {
            tracing::warn!("session refused for {}: {e}", claims.id);
            (StatusCode::UNAUTHORIZED, axum::Json(e.to_string())).into_response()
        }
    }
}

/// Role from the database, for authorization decisions. `claims.role` is a
/// snapshot from issuance time and doesn't track demotion.
pub async fn role_in_db(
    conn: &mut AsyncPgConnection,
    user_id: &Uuid,
) -> Result<UserRole, ApiError> {
    let user = crate::models::user::find_user_by_id(conn, user_id).await?;

    Ok(user.role)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims_with_iat(iat: Option<i64>) -> Claims {
        Claims {
            id: Uuid::new_v4(),
            public_id: 1234567,
            role: UserRole::Admin,
            email: "person@example.test".to_string(),
            exp: (chrono::Utc::now().timestamp() + 3600) as usize,
            iat,
        }
    }

    #[test]
    fn token_issued_before_password_change_is_revoked() {
        let claims = claims_with_iat(Some(chrono::Utc::now().timestamp()));
        let changed_after = chrono::Utc::now() + chrono::Duration::seconds(60);

        assert!(session_revoked(&claims, changed_after));
    }

    #[test]
    fn token_issued_after_the_change_still_counts() {
        let claims = claims_with_iat(Some(chrono::Utc::now().timestamp()));
        let changed_before = chrono::Utc::now() - chrono::Duration::days(2);

        assert!(!session_revoked(&claims, changed_before));
    }

    #[test]
    fn old_token_without_iat_cannot_be_dated() {
        let claims = claims_with_iat(None);

        assert!(
            !session_revoked(&claims, chrono::Utc::now()),
            "without iat there's no way to date it; the token survives until it expires"
        );
    }

    #[test]
    fn cache_responds_within_the_window_and_expires_after() {
        let cache = SessionCache::new();
        let user = Uuid::new_v4();
        let now = Instant::now();

        assert!(cache.find(user, 10, now).is_none(), "cache starts empty");

        cache.store(user, 10, UserRole::User, now);

        assert_eq!(cache.find(user, 10, now), Some(UserRole::User));
        assert_eq!(
            cache.find(user, 10, now + CACHE_TTL - Duration::from_millis(1)),
            Some(UserRole::User)
        );
        assert!(
            cache.find(user, 10, now + CACHE_TTL).is_none(),
            "past the window, it must go back to the database"
        );
    }

    #[test]
    fn cache_separates_different_issuances_of_the_same_user() {
        let cache = SessionCache::new();
        let user = Uuid::new_v4();
        let now = Instant::now();

        cache.store(user, 100, UserRole::Admin, now);

        assert_eq!(cache.find(user, 100, now), Some(UserRole::Admin));
        assert!(
            cache.find(user, 200, now).is_none(),
            "a reissued token cannot inherit the previous one's validation"
        );
    }

    #[test]
    fn invalidate_drops_all_issuances_of_the_user() {
        let cache = SessionCache::new();
        let user = Uuid::new_v4();
        let other = Uuid::new_v4();
        let now = Instant::now();

        cache.store(user, 1, UserRole::User, now);
        cache.store(user, 2, UserRole::User, now);
        cache.store(other, 1, UserRole::User, now);

        cache.invalidate(user);

        assert!(cache.find(user, 1, now).is_none());
        assert!(cache.find(user, 2, now).is_none());
        assert_eq!(
            cache.find(other, 1, now),
            Some(UserRole::User),
            "invalidating one user cannot drop another"
        );
    }
}
