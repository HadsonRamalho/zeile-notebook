use std::path::{Path, PathBuf};

use postgresql_embedded::{PostgreSQL, Settings};

const DB_NAME: &str = "zeile";
const PASSWORD_FILE: &str = "pg_password";

pub fn data_dir_from(raw: Option<String>) -> Result<PathBuf, String> {
    let path = raw.unwrap_or_default();
    let path = path.trim();

    if path.is_empty() {
        return Err(
            "ZEILE_PG_DATA is not set; point it to a persistent user directory \
             (the desktop shell does this) instead of leaving the database in the temp directory"
                .to_string(),
        );
    }

    Ok(PathBuf::from(path))
}

fn generate_password() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

pub fn persisted_password(directory: &Path) -> std::io::Result<String> {
    let file = directory.join(PASSWORD_FILE);

    if let Ok(existing) = std::fs::read_to_string(&file) {
        let existing = existing.trim().to_string();
        if !existing.is_empty() {
            return Ok(existing);
        }
    }

    std::fs::create_dir_all(directory)?;

    let password = generate_password();
    std::fs::write(&file, &password)?;
    restrict_permissions(&file)?;

    Ok(password)
}

fn clean_stale_data_dir(data_dir: &PathBuf) {
    if !data_dir.exists() || data_dir.join("PG_VERSION").exists() {
        return;
    }

    let empty = std::fs::read_dir(data_dir)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false);
    if empty {
        return;
    }

    tracing::warn!(
        "incomplete PostgreSQL data directory at {}; recreating",
        data_dir.display()
    );
    if let Err(e) = std::fs::remove_dir_all(data_dir) {
        tracing::error!("failed to clean {}: {e}", data_dir.display());
    }
}

async fn provision() -> Result<PostgreSQL, Box<dyn std::error::Error>> {
    let data_dir = data_dir_from(std::env::var("ZEILE_PG_DATA").ok())?;

    let secret_dir = data_dir.parent().unwrap_or(&data_dir).to_path_buf();
    let password = persisted_password(&secret_dir)?;

    clean_stale_data_dir(&data_dir);

    let settings = Settings {
        data_dir,
        password,
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
        tracing::info!("DATABASE_URL set; using external Postgres (embedded skipped)");
        return None;
    }

    match provision().await {
        Ok(postgresql) => {
            tracing::info!("embedded PostgreSQL ready at {DB_NAME}");
            Some(postgresql)
        }
        Err(e) => {
            tracing::error!(
                "embedded PostgreSQL unavailable: {e}. Set DATABASE_URL to use an external Postgres."
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_zeile_pg_data_the_db_does_not_fall_back_to_temp() {
        let error = data_dir_from(None).expect_err("should require the variable");

        assert!(error.contains("ZEILE_PG_DATA"));
    }

    #[test]
    fn blank_value_counts_as_missing() {
        assert!(data_dir_from(Some("   ".to_string())).is_err());
    }

    #[test]
    fn declared_path_is_honored() {
        let dir = data_dir_from(Some(" /var/lib/zeile/pg ".to_string())).expect("path");

        assert_eq!(dir, PathBuf::from("/var/lib/zeile/pg"));
    }

    #[test]
    fn password_is_generated_once_and_reused() {
        let base = std::env::temp_dir().join(format!("zeile-pg-test-{}", uuid::Uuid::new_v4()));

        let first = persisted_password(&base).expect("first password");
        let second = persisted_password(&base).expect("second password");

        assert_eq!(first, second);
        assert!(first.len() >= 32);

        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn passwords_from_different_installs_do_not_match() {
        let a = std::env::temp_dir().join(format!("zeile-pg-test-{}", uuid::Uuid::new_v4()));
        let b = std::env::temp_dir().join(format!("zeile-pg-test-{}", uuid::Uuid::new_v4()));

        let password_a = persisted_password(&a).expect("password a");
        let password_b = persisted_password(&b).expect("password b");

        assert_ne!(password_a, password_b);

        std::fs::remove_dir_all(&a).ok();
        std::fs::remove_dir_all(&b).ok();
    }

    #[cfg(unix)]
    #[test]
    fn password_file_is_0600() {
        use std::os::unix::fs::PermissionsExt;

        let base = std::env::temp_dir().join(format!("zeile-pg-test-{}", uuid::Uuid::new_v4()));
        persisted_password(&base).expect("password");

        let mode = std::fs::metadata(base.join(PASSWORD_FILE))
            .expect("metadata")
            .permissions()
            .mode();

        assert_eq!(mode & 0o777, 0o600);

        std::fs::remove_dir_all(&base).ok();
    }
}
