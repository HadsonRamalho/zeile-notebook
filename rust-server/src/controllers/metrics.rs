//! métricas do realtime em formato prometheus por `GET /api/metrics`

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
    // passadas << changes indica coalescência do broadcaster
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
            "Conexoes de sync aceitas.",
            self.ws_sync_connections_total.get(),
        );
        counter(
            &mut out,
            "ws_sync_connection_errors_total",
            "Conexoes de sync recusadas no connect.",
            self.ws_sync_connection_errors_total.get(),
        );
        gauge(
            &mut out,
            "ws_sync_active",
            "Conexoes de sync abertas.",
            self.ws_sync_active.get(),
        );
        counter(
            &mut out,
            "ws_presence_connections_total",
            "Conexoes de presenca aceitas.",
            self.ws_presence_connections_total.get(),
        );
        counter(
            &mut out,
            "ws_presence_connection_errors_total",
            "Conexoes de presenca recusadas no connect.",
            self.ws_presence_connection_errors_total.get(),
        );
        gauge(
            &mut out,
            "ws_presence_active",
            "Conexoes de presenca abertas.",
            self.ws_presence_active.get(),
        );
        gauge(
            &mut out,
            "active_notebooks",
            "Notebooks com peers de sync ativos.",
            self.active_notebooks.get(),
        );
        gauge(
            &mut out,
            "presence_rooms",
            "Salas de presenca ativas.",
            self.presence_rooms.get(),
        );
        counter(
            &mut out,
            "sync_changes_applied_total",
            "Mensagens de sync que avancaram o documento.",
            self.sync_changes_applied_total.get(),
        );
        counter(
            &mut out,
            "sync_peer_notifications_total",
            "Notificacoes de fan-out disparadas para peers.",
            self.sync_peer_notifications_total.get(),
        );
        counter(
            &mut out,
            "sync_channel_send_errors_total",
            "Falhas de envio no canal bounded do peer (cliente lento).",
            self.sync_channel_send_errors_total.get(),
        );
        counter(
            &mut out,
            "sync_broadcast_passes_total",
            "Passadas do broadcaster single-flight.",
            self.sync_broadcast_passes_total.get(),
        );
        counter(
            &mut out,
            "sync_broadcast_skips_total",
            "Peers pulados por backpressure numa passada do broadcaster.",
            self.sync_broadcast_skips_total.get(),
        );
        counter(
            &mut out,
            "notebook_saves_total",
            "Persistencias de documento concluidas.",
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

/// Quem pode raspar as métricas. Loopback entra sem credencial pelo mesmo
/// motivo do /internal/shutdown: é onde rodam os coletores locais, e um
/// Prometheus não carrega JWT — para ele existe o token de scrape.
pub async fn autorizado_a_raspar(
    pool: &Pool<AsyncPgConnection>,
    headers: &HeaderMap,
    peer: Option<&SocketAddr>,
    esperado: Option<&str>,
) -> bool {
    if peer.is_some_and(|addr| addr.ip().is_loopback()) {
        return true;
    }

    if let Some(esperado) = esperado {
        let recebido = headers
            .get(TOKEN_HEADER)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();

        if crate::controllers::shutdown::tokens_match(esperado, recebido) {
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

    if !autorizado_a_raspar(&state.pool, &headers, peer.as_ref(), scrape_token().as_deref()).await
    {
        tracing::warn!("scrape de métricas recusado");
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

    fn headers_com_token(valor: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(TOKEN_HEADER, valor.parse().expect("header"));
        headers
    }

    fn peer(addr: &str) -> SocketAddr {
        addr.parse().expect("endereço")
    }

    #[test]
    fn o_token_de_scrape_ignora_vazio_e_espaco() {
        unsafe { std::env::set_var(TOKEN_VAR, "   ") };
        assert!(scrape_token().is_none());

        unsafe { std::env::set_var(TOKEN_VAR, "  segredo  ") };
        assert_eq!(scrape_token().as_deref(), Some("segredo"));

        unsafe { std::env::remove_var(TOKEN_VAR) };
        assert!(scrape_token().is_none());
    }

    #[test]
    fn o_render_nao_carrega_dado_de_usuario() {
        let saida = METRICS.render_prometheus();

        for suspeito in ["@", "user_id", "email", "notebook_id"] {
            assert!(
                !saida.contains(suspeito),
                "métrica expôs '{suspeito}': o endpoint deve ser só agregado"
            );
        }
    }

    #[tokio::test]
    async fn loopback_raspa_sem_credencial() {
        let (_router, state) = crate::routes::test_support::router_e_estado().await;

        assert!(
            autorizado_a_raspar(
                &state.pool,
                &HeaderMap::new(),
                Some(&peer("127.0.0.1:9100")),
                None
            )
            .await,
            "coletor local deveria passar sem token"
        );
    }

    #[tokio::test]
    async fn origem_externa_sem_token_e_recusada() {
        let (_router, state) = crate::routes::test_support::router_e_estado().await;

        assert!(
            !autorizado_a_raspar(
                &state.pool,
                &HeaderMap::new(),
                Some(&peer("203.0.113.7:9100")),
                None
            )
            .await,
            "origem externa sem credencial não pode raspar"
        );

        assert!(
            !autorizado_a_raspar(
                &state.pool,
                &headers_com_token("token-de-scrape"),
                Some(&peer("203.0.113.7:9100")),
                None
            )
            .await,
            "sem ZEILE_METRICS_TOKEN configurado, header nao deve abrir a porta"
        );
    }

    #[tokio::test]
    async fn origem_externa_depende_do_token_correto() {
        let (_router, state) = crate::routes::test_support::router_e_estado().await;
        let de_fora = peer("203.0.113.7:9100");

        assert!(
            autorizado_a_raspar(
                &state.pool,
                &headers_com_token("token-de-scrape"),
                Some(&de_fora),
                Some("token-de-scrape")
            )
            .await,
            "Prometheus com token deveria raspar"
        );

        assert!(
            !autorizado_a_raspar(
                &state.pool,
                &headers_com_token("token-errado"),
                Some(&de_fora),
                Some("token-de-scrape")
            )
            .await,
            "token errado não pode passar"
        );
    }
}
