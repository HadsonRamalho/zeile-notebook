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

        let decorrido = now.saturating_duration_since(entry.start);

        if decorrido >= quota.window {
            entry.start = now;
            entry.count = 1;
            return Decision::Allowed;
        }

        if entry.count >= quota.max {
            let restante = quota.window - decorrido;
            return Decision::Limited {
                retry_after: restante.as_secs().max(1),
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
        .unwrap_or_else(|| "sem-origem".to_string())
}

pub async fn enforce(State(config): State<RateLimit>, request: Request, next: Next) -> Response {
    let client = client_key(&request);

    match config
        .limiter
        .check(config.bucket, &client, config.quota, Instant::now())
    {
        Decision::Allowed => next.run(request).await,
        Decision::Limited { retry_after } => {
            tracing::warn!(
                "rate limit atingido em {} por {client}; libera em {retry_after}s",
                config.bucket
            );

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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TESTE: Quota = Quota::new(3, 60);

    #[test]
    fn permite_ate_o_teto_e_barra_depois() {
        let limiter = RateLimiter::new();
        let agora = Instant::now();

        for i in 0..TESTE.max {
            assert_eq!(
                limiter.check("login", "10.0.0.1", TESTE, agora),
                Decision::Allowed,
                "requisição {i} deveria passar"
            );
        }

        assert!(matches!(
            limiter.check("login", "10.0.0.1", TESTE, agora),
            Decision::Limited { .. }
        ));
    }

    #[test]
    fn a_janela_reabre_depois_do_periodo() {
        let limiter = RateLimiter::new();
        let agora = Instant::now();

        for _ in 0..TESTE.max {
            limiter.check("login", "10.0.0.1", TESTE, agora);
        }

        let depois = agora + TESTE.window;

        assert_eq!(
            limiter.check("login", "10.0.0.1", TESTE, depois),
            Decision::Allowed
        );
    }

    #[test]
    fn clientes_diferentes_nao_compartilham_cota() {
        let limiter = RateLimiter::new();
        let agora = Instant::now();

        for _ in 0..TESTE.max {
            limiter.check("login", "10.0.0.1", TESTE, agora);
        }

        assert_eq!(
            limiter.check("login", "10.0.0.2", TESTE, agora),
            Decision::Allowed
        );
    }

    #[test]
    fn rotas_diferentes_nao_compartilham_cota() {
        let limiter = RateLimiter::new();
        let agora = Instant::now();

        for _ in 0..TESTE.max {
            limiter.check("login", "10.0.0.1", TESTE, agora);
        }

        assert_eq!(
            limiter.check("password-reset", "10.0.0.1", TESTE, agora),
            Decision::Allowed
        );
    }

    #[test]
    fn retry_after_nunca_e_zero() {
        let limiter = RateLimiter::new();
        let agora = Instant::now();

        for _ in 0..TESTE.max {
            limiter.check("login", "10.0.0.1", TESTE, agora);
        }

        let quase_no_fim = agora + TESTE.window - Duration::from_millis(1);

        match limiter.check("login", "10.0.0.1", TESTE, quase_no_fim) {
            Decision::Limited { retry_after } => assert!(retry_after >= 1),
            Decision::Allowed => panic!("deveria estar limitado"),
        }
    }
}
