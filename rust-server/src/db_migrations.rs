use diesel::Connection;
use diesel::pg::PgConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

pub fn run_pending_migrations() {
    let db_url = match crate::controllers::utils::get_database_url_from_env() {
        Ok(url) => url,
        Err(_) => {
            tracing::warn!("DATABASE_URL ausente; migrações embutidas não serão aplicadas");
            return;
        }
    };

    let mut conn =
        PgConnection::establish(&db_url).expect("Falha ao conectar ao banco para migrações");

    let applied = conn
        .run_pending_migrations(MIGRATIONS)
        .expect("Falha ao aplicar migrações pendentes");

    if applied.is_empty() {
        tracing::info!("Nenhuma migração pendente");
    } else {
        for migration in applied {
            tracing::info!("Migração aplicada: {}", migration);
        }
    }
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
