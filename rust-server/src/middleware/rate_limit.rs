use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use dashmap::DashMap;
use hyper::StatusCode;
use hyper::header::HeaderValue;
use serde_json::json;

const MAX_BUCKETS: usize = 50_000;

#[derive(Clone, Copy, Debug)]
pub struct Quota {
    pub max: u32,
    pub window: Duration,
}

impl Quota {
    pub const fn new(max: u32, window_secs: u64) -> Self {
        Self {
            max,
            window: Duration::from_secs(window_secs),
        }
    }
}

pub const LOGIN: Quota = Quota::new(10, 60);
pub const PASSWORD_RESET: Quota = Quota::new(5, 300);
pub const TEAM_INVITE: Quota = Quota::new(20, 3600);
pub const JUDGE: Quota = Quota::new(10, 60);
pub const REGISTER: Quota = Quota::new(5, 3600);

/// Legitimate rotation happens every 15 minutes per session; the slack covers
/// several tabs of the same user without becoming an oracle for token brute force.
pub const REFRESH: Quota = Quota::new(60, 3600);

pub const GLOBAL_USER: Quota = Quota::new(600, 60);

pub const GLOBAL_ORIGIN: Quota = Quota::new(2000, 60);

pub const OFF_VAR: &str = "ZEILE_RATE_LIMIT_OFF";

const EXEMPT_PATHS: [&str; 3] = ["/health/live", "/health/ready", "/internal/shutdown"];

pub fn global_limit_off() -> bool {
    std::env::var(OFF_VAR).is_ok_and(|value| {
        let value = value.trim().to_ascii_lowercase();
        value == "1" || value == "true" || value == "on" || value == "yes"
    })
}

pub fn exempt_path(path: &str) -> bool {
    EXEMPT_PATHS.contains(&path)
}

#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    Allowed,
    Limited { retry_after: u64 },
}

struct Window {
    start: Instant,
    count: u32,
}

#[derive(Default)]
pub struct RateLimiter {
    buckets: DashMap<(&'static str, String), Window>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn check(
        &self,
        bucket: &'static str,
        client: &str,
        quota: Quota,
        now: Instant,
    ) -> Decision {
        self.purge_if_needed(now, quota.window);

        let mut entry = self
            .buckets
            .entry((bucket, client.to_string()))
            .or_insert(Window {
                start: now,
                count: 0,
            });

        let elapsed = now.saturating_duration_since(entry.start);

        if elapsed >= quota.window {
            entry.start = now;
            entry.count = 1;
            return Decision::Allowed;
        }

        if entry.count >= quota.max {
            let remaining = quota.window - elapsed;
            return Decision::Limited {
                retry_after: remaining.as_secs().max(1),
            };
        }

        entry.count += 1;
        Decision::Allowed
    }

    fn purge_if_needed(&self, now: Instant, window: Duration) {
        if self.buckets.len() <= MAX_BUCKETS {
            return;
        }

        self.buckets
            .retain(|_, w| now.saturating_duration_since(w.start) < window);
    }
}

static SHARED: std::sync::OnceLock<Arc<RateLimiter>> = std::sync::OnceLock::new();

pub fn shared() -> Arc<RateLimiter> {
    SHARED.get_or_init(|| Arc::new(RateLimiter::new())).clone()
}

#[macro_export]
macro_rules! rate_limit {
    ($bucket:expr, $quota:expr) => {
        axum::middleware::from_fn_with_state(
            $crate::middleware::rate_limit::RateLimit::new(
                $crate::middleware::rate_limit::shared(),
                $bucket,
                $quota,
            ),
            $crate::middleware::rate_limit::enforce,
        )
    };
}

#[derive(Clone)]
pub struct RateLimit {
    limiter: Arc<RateLimiter>,
    bucket: &'static str,
    quota: Quota,
}

impl RateLimit {
    pub fn new(limiter: Arc<RateLimiter>, bucket: &'static str, quota: Quota) -> Self {
        Self {
            limiter,
            bucket,
            quota,
        }
    }
}

pub fn client_key(request: &Request) -> String {
    request
        .extensions()
        .get::<axum::extract::ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip().to_string())
        .unwrap_or_else(|| "no-origin".to_string())
}

fn limited_response(bucket: &str, client: &str, retry_after: u64) -> Response {
    tracing::warn!("rate limit hit on {bucket} by {client}; releases in {retry_after}s");

    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        axum::Json(json!({
            "error": "Too many requests",
            "errorCode": "RATE_LIMITED",
            "retryAfter": retry_after,
        })),
    )
        .into_response();

    if let Ok(value) = HeaderValue::from_str(&retry_after.to_string()) {
        response
            .headers_mut()
            .insert(hyper::header::RETRY_AFTER, value);
    }

    response
}

pub async fn enforce(State(config): State<RateLimit>, request: Request, next: Next) -> Response {
    let client = client_key(&request);

    match config
        .limiter
        .check(config.bucket, &client, config.quota, Instant::now())
    {
        Decision::Allowed => next.run(request).await,
        Decision::Limited { retry_after } => {
            limited_response(config.bucket, &client, retry_after)
        }
    }
}

/// Global request ceiling. Authenticated traffic is counted per user, not per
/// IP: a classroom behind a NAT shares an IP, so a per-origin ceiling would
/// choke legitimate use. The per-origin bucket only covers anonymous traffic,
/// where there's no identity to charge against.
pub async fn enforce_global(request: Request, next: Next) -> Response {
    if global_limit_off() || exempt_path(request.uri().path()) {
        return next.run(request).await;
    }

    let limiter = shared();
    let now = Instant::now();

    let headers = request.headers().clone();

    let (bucket, key, quota) = match request_user(&headers).await {
        Some(user_id) => ("global-user", user_id, GLOBAL_USER),
        None => ("global-origin", client_key(&request), GLOBAL_ORIGIN),
    };

    match limiter.check(bucket, &key, quota, now) {
        Decision::Allowed => next.run(request).await,
        Decision::Limited { retry_after } => limited_response(bucket, &key, retry_after),
    }
}

async fn request_user(headers: &hyper::HeaderMap) -> Option<String> {
    crate::controllers::jwt::extract_claims_from_header(headers)
        .await
        .ok()
        .map(|(_, claims)| claims.id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST: Quota = Quota::new(3, 60);

    #[test]
    fn allows_up_to_the_ceiling_and_blocks_after() {
        let limiter = RateLimiter::new();
        let now = Instant::now();

        for i in 0..TEST.max {
            assert_eq!(
                limiter.check("login", "10.0.0.1", TEST, now),
                Decision::Allowed,
                "request {i} should pass"
            );
        }

        assert!(matches!(
            limiter.check("login", "10.0.0.1", TEST, now),
            Decision::Limited { .. }
        ));
    }

    #[test]
    fn the_window_reopens_after_the_period() {
        let limiter = RateLimiter::new();
        let now = Instant::now();

        for _ in 0..TEST.max {
            limiter.check("login", "10.0.0.1", TEST, now);
        }

        let after = now + TEST.window;

        assert_eq!(
            limiter.check("login", "10.0.0.1", TEST, after),
            Decision::Allowed
        );
    }

    #[test]
    fn different_clients_do_not_share_quota() {
        let limiter = RateLimiter::new();
        let now = Instant::now();

        for _ in 0..TEST.max {
            limiter.check("login", "10.0.0.1", TEST, now);
        }

        assert_eq!(
            limiter.check("login", "10.0.0.2", TEST, now),
            Decision::Allowed
        );
    }

    #[test]
    fn different_routes_do_not_share_quota() {
        let limiter = RateLimiter::new();
        let now = Instant::now();

        for _ in 0..TEST.max {
            limiter.check("login", "10.0.0.1", TEST, now);
        }

        assert_eq!(
            limiter.check("password-reset", "10.0.0.1", TEST, now),
            Decision::Allowed
        );
    }

    #[test]
    fn retry_after_is_never_zero() {
        let limiter = RateLimiter::new();
        let now = Instant::now();

        for _ in 0..TEST.max {
            limiter.check("login", "10.0.0.1", TEST, now);
        }

        let almost_at_the_end = now + TEST.window - Duration::from_millis(1);

        match limiter.check("login", "10.0.0.1", TEST, almost_at_the_end) {
            Decision::Limited { retry_after } => assert!(retry_after >= 1),
            Decision::Allowed => panic!("should be limited"),
        }
    }
}
