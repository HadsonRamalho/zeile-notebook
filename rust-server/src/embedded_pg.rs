use std::path::PathBuf;

use postgresql_embedded::{PostgreSQL, Settings};

const DB_NAME: &str = "zeile";

async fn provision() -> Result<PostgreSQL, Box<dyn std::error::Error>> {
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
    postgresql.setup().await?;
    postgresql.start().await?;

    if !postgresql.database_exists(DB_NAME).await? {
        postgresql.create_database(DB_NAME).await?;
    }

    let url = postgresql.settings().url(DB_NAME);
    unsafe {
        std::env::set_var("DATABASE_URL", url);
        std::env::set_var("DATABASE_TLS", "off");
    }

    Ok(postgresql)
}

pub async fn ensure_running() -> Option<PostgreSQL> {
    dotenvy::dotenv().ok();

    if std::env::var("DATABASE_URL").is_ok() {
        tracing::info!("DATABASE_URL definido; usando Postgres externo (embarcado ignorado)");
        return None;
    }

    match provision().await {
        Ok(postgresql) => {
            tracing::info!("PostgreSQL embarcado pronto em {DB_NAME}");
            Some(postgresql)
        }
        Err(e) => {
            tracing::error!(
                "PostgreSQL embarcado indisponível: {e}. Defina DATABASE_URL para usar um Postgres externo."
            );
            None
        }
    }
}
