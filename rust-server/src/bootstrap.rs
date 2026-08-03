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
const DEFAULT_POOL_SIZE: usize = 10;
const DEFAULT_JUDGE_CONCURRENCY: usize = 2;

#[derive(Debug, Error)]
pub enum BootError {
    #[error(
        "could not install the rustls crypto provider; another provider is already installed in this process"
    )]
    CryptoProvider,

    #[error(
        "DATABASE_URL is not set; export the variable or fill in rust-server/.env before starting the server"
    )]
    MissingDatabaseUrl,

    #[error("failed to apply embedded migrations: {0}")]
    Migration(String),

    #[error("{0}")]
    MigrationDowngrade(String),

    #[error("failed to build the Postgres connection pool: {0}")]
    Pool(String),

    #[error("{var} has an invalid value ({value}); expected {expected}")]
    InvalidEnv {
        var: &'static str,
        value: String,
        expected: &'static str,
    },

    #[error("failed to open the socket at {addr}: {source}")]
    Bind {
        addr: String,
        #[source]
        source: std::io::Error,
    },

    #[error("the server exited with an error: {0}")]
    Serve(#[source] std::io::Error),
}

pub fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=warn".into()),
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
    parse_env_number("PORT", DEFAULT_PORT, "a port between 1 and 65535", |p| {
        *p > 0
    })
}

pub fn bind_host_from(raw: Option<String>) -> Result<String, BootError> {
    let value = raw.unwrap_or_default();
    let value = value.trim();

    if value.is_empty() {
        return Ok(DEFAULT_BIND_HOST.to_string());
    }

    value
        .parse::<std::net::IpAddr>()
        .map(|ip| ip.to_string())
        .map_err(|_| BootError::InvalidEnv {
            var: "BIND_ADDR",
            value: value.to_string(),
            expected: "an IP address, such as 127.0.0.1 or 0.0.0.0",
        })
}

pub fn bind_host() -> Result<String, BootError> {
    bind_host_from(std::env::var("BIND_ADDR").ok())
}

pub fn judge_concurrency() -> Result<usize, BootError> {
    parse_env_number(
        "JUDGE_CONCURRENCY",
        DEFAULT_JUDGE_CONCURRENCY,
        "an integer greater than zero",
        |n| *n > 0,
    )
}

pub fn pool_size() -> Result<usize, BootError> {
    parse_env_number(
        "DATABASE_POOL_SIZE",
        DEFAULT_POOL_SIZE,
        "an integer greater than zero",
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
        sessions: Arc::new(crate::controllers::session::SessionCache::new()),
        shutdown: crate::shutdown::Shutdown::new(),
    }))
}

pub fn spawn_background_tasks(state: &Arc<AppState>, db_url: String) {
    until_shutdown(state, crate::controllers::utils::auto_delete_files());

    until_shutdown(state, crate::controllers::utils::auto_delete_logs());

    until_shutdown(
        state,
        crate::controllers::utils::auto_delete_refresh_tokens(state.pool.clone()),
    );

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
            Err(e) => tracing::warn!("search_text backfill failed: {e}"),
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
    fn missing_variable_uses_the_default() {
        with_env("ZEILE_TEST_NUM", None, || {
            let value =
                parse_env_number("ZEILE_TEST_NUM", 7usize, "a positive integer", |n| *n > 0);
            assert_eq!(value.unwrap(), 7);
        });
    }

    #[test]
    fn empty_variable_uses_the_default() {
        with_env("ZEILE_TEST_NUM", Some("   "), || {
            let value =
                parse_env_number("ZEILE_TEST_NUM", 7usize, "a positive integer", |n| *n > 0);
            assert_eq!(value.unwrap(), 7);
        });
    }

    #[test]
    fn unparseable_value_fails_instead_of_falling_back_to_default() {
        with_env("ZEILE_TEST_NUM", Some("abc"), || {
            let err = parse_env_number("ZEILE_TEST_NUM", 7usize, "a positive integer", |n| *n > 0)
                .unwrap_err();

            match err {
                BootError::InvalidEnv { var, value, .. } => {
                    assert_eq!(var, "ZEILE_TEST_NUM");
                    assert_eq!(value, "abc");
                }
                other => panic!("unexpected error: {other}"),
            }
        });
    }

    #[test]
    fn out_of_range_value_fails() {
        with_env("JUDGE_CONCURRENCY", Some("0"), || {
            assert!(judge_concurrency().is_err());
        });
    }

    #[test]
    fn valid_value_wins_over_the_default() {
        with_env("JUDGE_CONCURRENCY", Some(" 8 "), || {
            assert_eq!(judge_concurrency().unwrap(), 8);
        });
    }

    #[test]
    fn empty_database_url_counts_as_missing() {
        with_env("DATABASE_URL", Some(""), || {
            assert!(matches!(database_url(), Err(BootError::MissingDatabaseUrl)));
        });
    }

    #[test]
    fn without_bind_addr_the_server_listens_on_all_interfaces() {
        assert_eq!(bind_host_from(None).unwrap(), "0.0.0.0");
    }

    #[test]
    fn loopback_bind_addr_is_honored() {
        assert_eq!(
            bind_host_from(Some(" 127.0.0.1 ".to_string())).unwrap(),
            "127.0.0.1"
        );
    }

    #[test]
    fn invalid_bind_addr_prevents_boot() {
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
    fn error_message_says_what_to_do() {
        let msg = BootError::MissingDatabaseUrl.to_string();
        assert!(msg.contains("DATABASE_URL"));
        assert!(msg.contains("rust-server/.env"));
    }
}
