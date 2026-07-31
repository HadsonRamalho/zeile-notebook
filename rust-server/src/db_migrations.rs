use diesel::Connection;
use diesel::pg::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

pub fn run_pending_migrations(db_url: &str) -> Result<(), String> {
    let mut conn = PgConnection::establish(db_url)
        .map_err(|e| format!("não foi possível conectar ao banco para migrar: {e}"))?;

    let applied = conn
        .run_pending_migrations(MIGRATIONS)
        .map_err(|e| format!("migração pendente falhou: {e}"))?;

    if applied.is_empty() {
        tracing::info!("Nenhuma migração pendente");
    } else {
        for migration in applied {
            tracing::info!("Migração aplicada: {}", migration);
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

        let mut conn = PgConnection::establish(&db_url).expect("conexão de teste");

        let first = conn
            .run_pending_migrations(MIGRATIONS)
            .expect("primeira aplicação");
        assert!(
            !first.is_empty(),
            "esperava aplicar migrações em um banco vazio"
        );

        let second = conn
            .run_pending_migrations(MIGRATIONS)
            .expect("segunda aplicação");
        assert!(
            second.is_empty(),
            "segunda execução deveria ser idempotente (nada pendente)"
        );
    }
}
