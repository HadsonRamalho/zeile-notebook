//! métricas do realtime em formato prometheus por `GET /api/metrics`

use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};

use axum::response::IntoResponse;

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

pub async fn metrics_handler() -> impl IntoResponse {
    (
        [("content-type", "text/plain; version=0.0.4")],
        METRICS.render_prometheus(),
    )
}
