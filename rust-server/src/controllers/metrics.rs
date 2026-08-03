//! realtime metrics in Prometheus format via `GET /api/metrics`

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};

use axum::extract::{ConnectInfo, Request, State};
use axum::response::{IntoResponse, Response};
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::deadpool::Pool;
use hyper::{HeaderMap, StatusCode};

use crate::controllers::utils::get_conn;
use crate::models::state::AppState;

pub struct Counter(AtomicU64);

impl Counter {
    pub const fn new() -> Self {
        Self(AtomicU64::new(0))
    }
    #[inline]
    pub fn inc(&self) {
        self.0.fetch_add(1, Ordering::Relaxed);
    }
    #[inline]
    pub fn add(&self, n: u64) {
        self.0.fetch_add(n, Ordering::Relaxed);
    }
    #[inline]
    pub fn get(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

pub struct Gauge(AtomicI64);

impl Gauge {
    pub const fn new() -> Self {
        Self(AtomicI64::new(0))
    }
    #[inline]
    pub fn inc(&self) {
        self.0.fetch_add(1, Ordering::Relaxed);
    }
    #[inline]
    pub fn dec(&self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
    #[inline]
    pub fn get(&self) -> i64 {
        self.0.load(Ordering::Relaxed)
    }
}

pub struct Metrics {
    pub ws_sync_connections_total: Counter,
    pub ws_sync_connection_errors_total: Counter,
    pub ws_sync_active: Gauge,
    pub ws_presence_connections_total: Counter,
    pub ws_presence_connection_errors_total: Counter,
    pub ws_presence_active: Gauge,
    pub active_notebooks: Gauge,
    pub presence_rooms: Gauge,
    pub sync_changes_applied_total: Counter,
    // passes << changes indicates broadcaster coalescing
    pub sync_peer_notifications_total: Counter,
    pub sync_channel_send_errors_total: Counter,
    pub sync_broadcast_passes_total: Counter,
    pub sync_broadcast_skips_total: Counter,
    pub notebook_saves_total: Counter,
}

impl Metrics {
    pub const fn new() -> Self {
        Self {
            ws_sync_connections_total: Counter::new(),
            ws_sync_connection_errors_total: Counter::new(),
            ws_sync_active: Gauge::new(),
            ws_presence_connections_total: Counter::new(),
            ws_presence_connection_errors_total: Counter::new(),
            ws_presence_active: Gauge::new(),
            active_notebooks: Gauge::new(),
            presence_rooms: Gauge::new(),
            sync_changes_applied_total: Counter::new(),
            sync_peer_notifications_total: Counter::new(),
            sync_channel_send_errors_total: Counter::new(),
            sync_broadcast_passes_total: Counter::new(),
            sync_broadcast_skips_total: Counter::new(),
            notebook_saves_total: Counter::new(),
        }
    }

    pub fn render_prometheus(&self) -> String {
        let mut out = String::with_capacity(2048);

        let counter = |out: &mut String, name: &str, help: &str, v: u64| {
            out.push_str(&format!("# HELP zeile_{name} {help}\n"));
            out.push_str(&format!("# TYPE zeile_{name} counter\n"));
            out.push_str(&format!("zeile_{name} {v}\n"));
        };
        let gauge = |out: &mut String, name: &str, help: &str, v: i64| {
            out.push_str(&format!("# HELP zeile_{name} {help}\n"));
            out.push_str(&format!("# TYPE zeile_{name} gauge\n"));
            out.push_str(&format!("zeile_{name} {v}\n"));
        };

        counter(
            &mut out,
            "ws_sync_connections_total",
            "Accepted sync connections.",
            self.ws_sync_connections_total.get(),
        );
        counter(
            &mut out,
            "ws_sync_connection_errors_total",
            "Sync connections refused at connect time.",
            self.ws_sync_connection_errors_total.get(),
        );
        gauge(
            &mut out,
            "ws_sync_active",
            "Open sync connections.",
            self.ws_sync_active.get(),
        );
        counter(
            &mut out,
            "ws_presence_connections_total",
            "Accepted presence connections.",
            self.ws_presence_connections_total.get(),
        );
        counter(
            &mut out,
            "ws_presence_connection_errors_total",
            "Presence connections refused at connect time.",
            self.ws_presence_connection_errors_total.get(),
        );
        gauge(
            &mut out,
            "ws_presence_active",
            "Open presence connections.",
            self.ws_presence_active.get(),
        );
        gauge(
            &mut out,
            "active_notebooks",
            "Notebooks with active sync peers.",
            self.active_notebooks.get(),
        );
        gauge(
            &mut out,
            "presence_rooms",
            "Active presence rooms.",
            self.presence_rooms.get(),
        );
        counter(
            &mut out,
            "sync_changes_applied_total",
            "Sync messages that advanced the document.",
            self.sync_changes_applied_total.get(),
        );
        counter(
            &mut out,
            "sync_peer_notifications_total",
            "Fan-out notifications sent to peers.",
            self.sync_peer_notifications_total.get(),
        );
        counter(
            &mut out,
            "sync_channel_send_errors_total",
            "Send failures on the peer's bounded channel (slow client).",
            self.sync_channel_send_errors_total.get(),
        );
        counter(
            &mut out,
            "sync_broadcast_passes_total",
            "Single-flight broadcaster passes.",
            self.sync_broadcast_passes_total.get(),
        );
        counter(
            &mut out,
            "sync_broadcast_skips_total",
            "Peers skipped due to backpressure in a broadcaster pass.",
            self.sync_broadcast_skips_total.get(),
        );
        counter(
            &mut out,
            "notebook_saves_total",
            "Completed document persistences.",
            self.notebook_saves_total.get(),
        );

        out
    }
}

pub static METRICS: Metrics = Metrics::new();

pub const TOKEN_HEADER: &str = "x-zeile-metrics-token";

pub const TOKEN_VAR: &str = "ZEILE_METRICS_TOKEN";

pub fn scrape_token() -> Option<String> {
    std::env::var(TOKEN_VAR)
        .ok()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

/// Who can scrape the metrics. Loopback gets in without a credential for the
/// same reason as /internal/shutdown: that's where local collectors run, and
/// a Prometheus doesn't carry a JWT — the scrape token exists for it.
pub async fn authorized_to_scrape(
    pool: &Pool<AsyncPgConnection>,
    headers: &HeaderMap,
    peer: Option<&SocketAddr>,
    expected: Option<&str>,
) -> bool {
    if peer.is_some_and(|addr| addr.ip().is_loopback()) {
        return true;
    }

    if let Some(expected) = expected {
        let received = headers
            .get(TOKEN_HEADER)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();

        if crate::controllers::shutdown::tokens_match(expected, received) {
            return true;
        }
    }

    let Ok(mut conn) = get_conn(pool).await else {
        return false;
    };

    crate::controllers::admin::check_admin_role(&mut conn, headers)
        .await
        .is_ok()
}

pub async fn metrics_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
) -> Response {
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0);

    if !authorized_to_scrape(&state.pool, &headers, peer.as_ref(), scrape_token().as_deref()).await
    {
        tracing::warn!("metrics scrape refused");
        return StatusCode::NOT_FOUND.into_response();
    }

    (
        [("content-type", "text/plain; version=0.0.4")],
        METRICS.render_prometheus(),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers_with_token(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(TOKEN_HEADER, value.parse().expect("header"));
        headers
    }

    fn peer(addr: &str) -> SocketAddr {
        addr.parse().expect("address")
    }

    #[test]
    fn scrape_token_ignores_blank_and_whitespace() {
        unsafe { std::env::set_var(TOKEN_VAR, "   ") };
        assert!(scrape_token().is_none());

        unsafe { std::env::set_var(TOKEN_VAR, "  secret  ") };
        assert_eq!(scrape_token().as_deref(), Some("secret"));

        unsafe { std::env::remove_var(TOKEN_VAR) };
        assert!(scrape_token().is_none());
    }

    #[test]
    fn render_does_not_carry_user_data() {
        let output = METRICS.render_prometheus();

        for suspect in ["@", "user_id", "email", "notebook_id"] {
            assert!(
                !output.contains(suspect),
                "metric exposed '{suspect}': the endpoint must be aggregate-only"
            );
        }
    }

    #[tokio::test]
    async fn loopback_scrapes_without_credential() {
        let (_router, state) = crate::routes::test_support::router_and_state().await;

        assert!(
            authorized_to_scrape(
                &state.pool,
                &HeaderMap::new(),
                Some(&peer("127.0.0.1:9100")),
                None
            )
            .await,
            "local collector should pass without a token"
        );
    }

    #[tokio::test]
    async fn external_origin_without_token_is_refused() {
        let (_router, state) = crate::routes::test_support::router_and_state().await;

        assert!(
            !authorized_to_scrape(
                &state.pool,
                &HeaderMap::new(),
                Some(&peer("203.0.113.7:9100")),
                None
            )
            .await,
            "external origin without a credential cannot scrape"
        );

        assert!(
            !authorized_to_scrape(
                &state.pool,
                &headers_with_token("scrape-token"),
                Some(&peer("203.0.113.7:9100")),
                None
            )
            .await,
            "without ZEILE_METRICS_TOKEN configured, the header must not open the door"
        );
    }

    #[tokio::test]
    async fn external_origin_depends_on_the_correct_token() {
        let (_router, state) = crate::routes::test_support::router_and_state().await;
        let outside = peer("203.0.113.7:9100");

        assert!(
            authorized_to_scrape(
                &state.pool,
                &headers_with_token("scrape-token"),
                Some(&outside),
                Some("scrape-token")
            )
            .await,
            "Prometheus with the token should scrape"
        );

        assert!(
            !authorized_to_scrape(
                &state.pool,
                &headers_with_token("wrong-token"),
                Some(&outside),
                Some("scrape-token")
            )
            .await,
            "wrong token cannot pass"
        );
    }
}
