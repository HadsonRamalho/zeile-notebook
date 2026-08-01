use std::sync::Arc;

use dashmap::DashMap;
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::pooled_connection::ManagerConfig;
use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Pool};
use thiserror::Error;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::controllers::sync::{PresenceRegistry, SyncRegistry};
use crate::models::state::AppState;
use crate::routes::establish_connection;

const DEFAULT_PORT: u16 = 3099;
const DEFAULT_BIND_HOST: &str = "0.0.0.0";
const DEFAULT_POOL_SIZE: usize = 50;
const DEFAULT_JUDGE_CONCURRENCY: usize = 2;

#[derive(Debug, Error)]
pub enum BootError {
    #[error(
        "não foi possível instalar o provedor de criptografia rustls; outro provedor já foi instalado no processo"
    )]
    CryptoProvider,

    #[error(
        "DATABASE_URL não está definida; exporte a variável ou preencha rust-server/.env antes de subir o servidor"
    )]
    MissingDatabaseUrl,

    #[error("falha ao aplicar as migrações embutidas: {0}")]
    Migration(String),

    #[error("falha ao criar o pool de conexões do Postgres: {0}")]
    Pool(String),

    #[error("{var} tem valor inválido ({value}); esperado {expected}")]
    InvalidEnv {
        var: &'static str,
        value: String,
        expected: &'static str,
    },

    #[error("falha ao abrir o socket em {addr}: {source}")]
    Bind {
        addr: String,
        #[source]
        source: std::io::Error,
    },

    #[error("o servidor encerrou com erro: {0}")]
    Serve(#[source] std::io::Error),
}

pub fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

pub fn install_crypto_provider() -> Result<(), BootError> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .map_err(|_| BootError::CryptoProvider)
}

pub fn database_url() -> Result<String, BootError> {
    dotenvy::dotenv().ok();
    std::env::var("DATABASE_URL")
        .ok()
        .filter(|url| !url.trim().is_empty())
        .ok_or(BootError::MissingDatabaseUrl)
}

pub fn parse_env_number<T: std::str::FromStr>(
    var: &'static str,
    default: T,
    expected: &'static str,
    valid: impl Fn(&T) -> bool,
) -> Result<T, BootError> {
    let raw = match std::env::var(var) {
        Ok(raw) => raw,
        Err(_) => return Ok(default),
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(default);
    }

    trimmed
        .parse::<T>()
        .ok()
        .filter(&valid)
        .ok_or_else(|| BootError::InvalidEnv {
            var,
            value: trimmed.to_string(),
            expected,
        })
}

pub fn port() -> Result<u16, BootError> {
    parse_env_number("PORT", DEFAULT_PORT, "uma porta entre 1 e 65535", |p| {
        *p > 0
    })
}

pub fn bind_host_from(raw: Option<String>) -> Result<String, BootError> {
    let valor = raw.unwrap_or_default();
    let valor = valor.trim();

    if valor.is_empty() {
        return Ok(DEFAULT_BIND_HOST.to_string());
    }

    valor
        .parse::<std::net::IpAddr>()
        .map(|ip| ip.to_string())
        .map_err(|_| BootError::InvalidEnv {
            var: "BIND_ADDR",
            value: valor.to_string(),
            expected: "um endereço IP, como 127.0.0.1 ou 0.0.0.0",
        })
}

pub fn bind_host() -> Result<String, BootError> {
    bind_host_from(std::env::var("BIND_ADDR").ok())
}

pub fn judge_concurrency() -> Result<usize, BootError> {
    parse_env_number(
        "JUDGE_CONCURRENCY",
        DEFAULT_JUDGE_CONCURRENCY,
        "um inteiro maior que zero",
        |n| *n > 0,
    )
}

pub fn pool_size() -> Result<usize, BootError> {
    parse_env_number(
        "DATABASE_POOL_SIZE",
        DEFAULT_POOL_SIZE,
        "um inteiro maior que zero",
        |n| *n > 0,
    )
}

pub fn build_pool(db_url: String) -> Result<Pool<AsyncPgConnection>, BootError> {
    let mut config = ManagerConfig::default();
    config.custom_setup = Box::new(establish_connection);

    let manager =
        AsyncDieselConnectionManager::<AsyncPgConnection>::new_with_config(db_url, config);

    Pool::builder(manager)
        .max_size(pool_size()?)
        .build()
        .map_err(|e| BootError::Pool(e.to_string()))
}

pub fn build_state(pool: Pool<AsyncPgConnection>) -> Result<Arc<AppState>, BootError> {
    let sync_registry: SyncRegistry = Arc::new(DashMap::new());
    let presence_registry: PresenceRegistry = Arc::new(DashMap::new());

    Ok(Arc::new(AppState {
        presence_registry,
        pool,
        sync_registry,
        push: crate::controllers::push::load_push_state(),
        judge_semaphore: Arc::new(tokio::sync::Semaphore::new(judge_concurrency()?)),
        shutdown: crate::shutdown::Shutdown::new(),
    }))
}

pub fn spawn_background_tasks(state: &Arc<AppState>, db_url: String) {
    until_shutdown(state, crate::controllers::utils::auto_delete_files());

    until_shutdown(state, crate::controllers::utils::auto_delete_logs());

    until_shutdown(
        state,
        crate::controllers::websocket::checkpoint_loop(
            state.sync_registry.clone(),
            state.pool.clone(),
        ),
    );

    let pool = state.pool.clone();
    until_shutdown(state, async move {
        match crate::models::notebook::backfill_search_text(&pool).await {
            Ok(n) if n > 0 => tracing::info!("search_text backfill: {n} notebooks"),
            Ok(_) => {}
            Err(e) => tracing::warn!("search_text backfill falhou: {e}"),
        }
    });

    until_shutdown(
        state,
        crate::controllers::permissions::caps_listen_loop(db_url, state.presence_registry.clone()),
    );
}

fn until_shutdown<F>(state: &Arc<AppState>, task: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    let shutdown = state.shutdown.clone();

    tokio::spawn(async move {
        tokio::select! {
            _ = task => {}
            _ = shutdown.wait() => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn with_env<T>(var: &str, value: Option<&str>, f: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let previous = std::env::var(var).ok();
        unsafe {
            match value {
                Some(v) => std::env::set_var(var, v),
                None => std::env::remove_var(var),
            }
        }
        let out = f();
        unsafe {
            match previous {
                Some(v) => std::env::set_var(var, v),
                None => std::env::remove_var(var),
            }
        }
        out
    }

    #[test]
    fn variavel_ausente_usa_o_default() {
        with_env("ZEILE_TEST_NUM", None, || {
            let value =
                parse_env_number("ZEILE_TEST_NUM", 7usize, "um inteiro positivo", |n| *n > 0);
            assert_eq!(value.unwrap(), 7);
        });
    }

    #[test]
    fn variavel_vazia_usa_o_default() {
        with_env("ZEILE_TEST_NUM", Some("   "), || {
            let value =
                parse_env_number("ZEILE_TEST_NUM", 7usize, "um inteiro positivo", |n| *n > 0);
            assert_eq!(value.unwrap(), 7);
        });
    }

    #[test]
    fn valor_ilegivel_falha_em_vez_de_cair_no_default() {
        with_env("ZEILE_TEST_NUM", Some("abc"), || {
            let err = parse_env_number("ZEILE_TEST_NUM", 7usize, "um inteiro positivo", |n| *n > 0)
                .unwrap_err();

            match err {
                BootError::InvalidEnv { var, value, .. } => {
                    assert_eq!(var, "ZEILE_TEST_NUM");
                    assert_eq!(value, "abc");
                }
                other => panic!("erro inesperado: {other}"),
            }
        });
    }

    #[test]
    fn valor_fora_da_faixa_falha() {
        with_env("JUDGE_CONCURRENCY", Some("0"), || {
            assert!(judge_concurrency().is_err());
        });
    }

    #[test]
    fn valor_valido_vence_o_default() {
        with_env("JUDGE_CONCURRENCY", Some(" 8 "), || {
            assert_eq!(judge_concurrency().unwrap(), 8);
        });
    }

    #[test]
    fn database_url_vazia_conta_como_ausente() {
        with_env("DATABASE_URL", Some(""), || {
            assert!(matches!(database_url(), Err(BootError::MissingDatabaseUrl)));
        });
    }

    #[test]
    fn sem_bind_addr_o_servidor_escuta_em_todas_as_interfaces() {
        assert_eq!(bind_host_from(None).unwrap(), "0.0.0.0");
    }

    #[test]
    fn bind_addr_de_loopback_e_respeitado() {
        assert_eq!(
            bind_host_from(Some(" 127.0.0.1 ".to_string())).unwrap(),
            "127.0.0.1"
        );
    }

    #[test]
    fn bind_addr_invalido_impede_o_boot() {
        let err = bind_host_from(Some("localhost".to_string())).unwrap_err();

        assert!(matches!(
            err,
            BootError::InvalidEnv {
                var: "BIND_ADDR",
                ..
            }
        ));
    }

    #[test]
    fn a_mensagem_de_erro_diz_o_que_fazer() {
        let msg = BootError::MissingDatabaseUrl.to_string();
        assert!(msg.contains("DATABASE_URL"));
        assert!(msg.contains("rust-server/.env"));
    }
}
