use std::path::PathBuf;

use postgresql_embedded::{PostgreSQL, Settings};

const DB_NAME: &str = "zeile";

pub async fn ensure_running() -> Option<PostgreSQL> {
    if std::env::var("DATABASE_URL").is_ok() {
        tracing::info!("DATABASE_URL definido; usando Postgres externo (embarcado ignorado)");
        return None;
    }

    let data_dir = std::env::var("ZEILE_PG_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("zeile-pgdata"));

    let settings = Settings {
        data_dir,
        password: "zeile".to_string(),
        temporary: false,
        ..Default::default()
    };

    let mut postgresql = PostgreSQL::new(settings);
    postgresql
        .setup()
        .await
        .expect("falha ao instalar PostgreSQL embarcado");
    postgresql
        .start()
        .await
        .expect("falha ao iniciar PostgreSQL embarcado");

    if !postgresql
        .database_exists(DB_NAME)
        .await
        .expect("falha ao verificar database")
    {
        postgresql
            .create_database(DB_NAME)
            .await
            .expect("falha ao criar database");
    }

    let url = postgresql.settings().url(DB_NAME);
    unsafe {
        std::env::set_var("DATABASE_URL", url);
        std::env::set_var("DATABASE_TLS", "off");
    }

    tracing::info!("PostgreSQL embarcado pronto em {DB_NAME}");
    Some(postgresql)
}
