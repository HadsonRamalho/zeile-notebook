use std::sync::Arc;

use tokio::sync::watch;
use uuid::Uuid;

use crate::controllers::sync::ActiveNotebook;
use crate::models::notebook::{checkpoint_notebook_data, extract_search_text};
use crate::models::state::AppState;

const DEFAULT_GRACE_SECS: u64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    Signal,
    Internal,
}

impl Reason {
    fn as_str(self) -> &'static str {
        match self {
            Reason::Signal => "signal",
            Reason::Internal => "internal endpoint",
        }
    }
}

/// `watch` em vez de `Notify` porque quem espera depois do disparo também precisa
/// acordar — uma conexão que abriu no meio do encerramento não pode ficar pendurada.
#[derive(Clone)]
pub struct Shutdown {
    tx: Arc<watch::Sender<bool>>,
}

impl Default for Shutdown {
    fn default() -> Self {
        Self::new()
    }
}

impl Shutdown {
    pub fn new() -> Self {
        let (tx, _) = watch::channel(false);
        Self { tx: Arc::new(tx) }
    }

    /// devolve `false` quando o encerramento já estava em curso
    pub fn trigger(&self, reason: Reason) -> bool {
        if *self.tx.borrow() {
            return false;
        }

        // `send` falha sem inscritos e o disparo se perderia num servidor ocioso
        self.tx.send_replace(true);
        tracing::info!("shutdown requested ({})", reason.as_str());
        true
    }

    pub fn is_triggered(&self) -> bool {
        *self.tx.borrow()
    }

    pub async fn wait(&self) {
        let mut rx = self.tx.subscribe();

        if *rx.borrow_and_update() {
            return;
        }

        let _ = rx.changed().await;
    }
}

pub fn grace_period() -> std::time::Duration {
    let secs = crate::bootstrap::parse_env_number(
        "SHUTDOWN_GRACE_SECS",
        DEFAULT_GRACE_SECS,
        "um inteiro maior que zero",
        |n: &u64| *n > 0,
    )
    .unwrap_or(DEFAULT_GRACE_SECS);

    std::time::Duration::from_secs(secs)
}

pub async fn wait_for_os_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        let mut term = match signal(SignalKind::terminate()) {
            Ok(stream) => stream,
            Err(error) => {
                tracing::error!("could not listen for SIGTERM: {error}");
                return;
            }
        };

        tokio::select! {
            _ = term.recv() => {}
            _ = tokio::signal::ctrl_c() => {}
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

/// Persiste todo notebook ativo antes de soltar o pool: entre dois ciclos do
/// `checkpoint_loop` o documento Automerge vive só em memória.
pub async fn drain(state: &Arc<AppState>) {
    let saved = checkpoint_all(state).await;
    tracing::info!("shutdown: {saved} notebook(s) checkpointed");

    state.pool.close();
    tracing::info!("shutdown: connection pool closed");
}

async fn checkpoint_all(state: &Arc<AppState>) -> usize {
    let items: Vec<(Uuid, Arc<ActiveNotebook>)> = state
        .sync_registry
        .iter()
        .map(|entry| (*entry.key(), entry.value().clone()))
        .collect();

    let mut saved = 0;

    for (id, notebook) in items {
        let (data, search_text) = {
            let mut inner = notebook.inner.lock().await;
            (inner.doc.save(), extract_search_text(&inner.doc))
        };

        match state.pool.get().await {
            Ok(mut conn) => {
                checkpoint_notebook_data(&mut conn, id, data, search_text).await;
                saved += 1;
            }
            Err(error) => {
                tracing::error!("shutdown: could not checkpoint notebook {id}: {error}");
            }
        }
    }

    saved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn quem_espera_antes_do_disparo_acorda() {
        let shutdown = Shutdown::new();
        let esperando = shutdown.clone();

        let task = tokio::spawn(async move { esperando.wait().await });

        assert!(shutdown.trigger(Reason::Signal));

        tokio::time::timeout(std::time::Duration::from_secs(1), task)
            .await
            .expect("wait deveria retornar após o disparo")
            .expect("task não deveria falhar");
    }

    #[tokio::test]
    async fn quem_espera_depois_do_disparo_nao_fica_pendurado() {
        let shutdown = Shutdown::new();
        shutdown.trigger(Reason::Signal);

        tokio::time::timeout(std::time::Duration::from_secs(1), shutdown.wait())
            .await
            .expect("wait deveria retornar imediatamente");
    }

    #[tokio::test]
    async fn o_segundo_disparo_e_ignorado() {
        let shutdown = Shutdown::new();

        assert!(shutdown.trigger(Reason::Signal));
        assert!(!shutdown.trigger(Reason::Internal));
        assert!(shutdown.is_triggered());
    }

    #[test]
    fn sem_variavel_o_periodo_de_graca_tem_default() {
        unsafe { std::env::remove_var("SHUTDOWN_GRACE_SECS") };

        assert_eq!(grace_period(), std::time::Duration::from_secs(5));
    }
}
