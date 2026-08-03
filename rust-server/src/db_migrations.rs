use diesel::Connection;
use diesel::migration::MigrationSource;
use diesel::pg::{Pg, PgConnection};
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

/// Refuses to boot if the database has a migration applied that this binary
/// does not know about. `run_pending_migrations` only ever applies forward,
/// so installing an older binary after a newer one has already migrated the
/// database is otherwise undetected and leaves the schema in an undefined
/// state for the older binary.
pub fn guard_against_migration_downgrade(db_url: &str) -> Result<(), String> {
    let mut conn = PgConnection::establish(db_url)
        .map_err(|e| format!("could not connect to the database to check migrations: {e}"))?;

    let latest_applied = conn
        .applied_migrations()
        .map_err(|e| format!("could not read applied migrations: {e}"))?
        .into_iter()
        .max();

    let Some(latest_applied) = latest_applied else {
        return Ok(());
    };

    let latest_embedded = MigrationSource::<Pg>::migrations(&MIGRATIONS)
        .map_err(|e| format!("could not read embedded migrations: {e}"))?
        .into_iter()
        .map(|m| m.name().version().as_owned())
        .max();

    match latest_embedded {
        Some(latest_embedded) if latest_applied > latest_embedded => Err(format!(
            "database has migration {latest_applied} applied, but this binary only knows migrations up to {latest_embedded}; refusing to start against a newer schema"
        )),
        _ => Ok(()),
    }
}

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

    #[test]
    fn guard_accepts_a_database_migrated_up_to_the_binary() {
        let db_url = match std::env::var("TEST_MIGRATION_DATABASE_URL") {
            Ok(url) => url,
            Err(_) => return,
        };

        let mut conn = PgConnection::establish(&db_url).expect("test connection");
        conn.run_pending_migrations(MIGRATIONS)
            .expect("apply migrations before checking the guard");

        assert!(guard_against_migration_downgrade(&db_url).is_ok());
    }

    #[test]
    fn guard_rejects_a_database_ahead_of_the_binary() {
        use diesel::RunQueryDsl;

        let db_url = match std::env::var("TEST_MIGRATION_DATABASE_URL") {
            Ok(url) => url,
            Err(_) => return,
        };

        let mut conn = PgConnection::establish(&db_url).expect("test connection");
        conn.run_pending_migrations(MIGRATIONS)
            .expect("apply migrations before checking the guard");

        diesel::sql_query(
            "insert into __diesel_schema_migrations (version) values ('99999999999999')",
        )
        .execute(&mut conn)
        .expect("insert a migration version from the future");

        let result = guard_against_migration_downgrade(&db_url);

        diesel::sql_query(
            "delete from __diesel_schema_migrations where version = '99999999999999'",
        )
        .execute(&mut conn)
        .expect("clean up the inserted future migration version");

        assert!(
            result.is_err(),
            "expected the guard to reject a database ahead of the binary"
        );
    }
}
