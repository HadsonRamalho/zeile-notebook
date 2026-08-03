use diesel::Connection;
use diesel::pg::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

pub fn run_pending_migrations(db_url: &str) -> Result<(), String> {
    let mut conn = PgConnection::establish(db_url)
        .map_err(|e| format!("could not connect to the database to migrate: {e}"))?;

    let applied = conn
        .run_pending_migrations(MIGRATIONS)
        .map_err(|e| format!("pending migration failed: {e}"))?;

    if applied.is_empty() {
        tracing::info!("No pending migrations");
    } else {
        for migration in applied {
            tracing::info!("Migration applied: {}", migration);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_migrations_apply_from_scratch_and_are_idempotent() {
        let db_url = match std::env::var("TEST_MIGRATION_DATABASE_URL") {
            Ok(url) => url,
            Err(_) => return,
        };

        let mut conn = PgConnection::establish(&db_url).expect("test connection");

        let first = conn
            .run_pending_migrations(MIGRATIONS)
            .expect("first application");
        assert!(
            !first.is_empty(),
            "expected to apply migrations on an empty database"
        );

        let second = conn
            .run_pending_migrations(MIGRATIONS)
            .expect("second application");
        assert!(
            second.is_empty(),
            "second run should be idempotent (nothing pending)"
        );
    }
}
