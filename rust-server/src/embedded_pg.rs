use std::path::{Path, PathBuf};

use postgresql_embedded::{PostgreSQL, Settings};

const DB_NAME: &str = "zeile";
const PASSWORD_FILE: &str = "pg_password";

pub fn data_dir_from(raw: Option<String>) -> Result<PathBuf, String> {
    let caminho = raw.unwrap_or_default();
    let caminho = caminho.trim();

    if caminho.is_empty() {
        return Err(
            "ZEILE_PG_DATA não está definida; aponte-a para um diretório persistente do usuário \
             (o shell desktop faz isso) em vez de deixar o banco no diretório temporário"
                .to_string(),
        );
    }

    Ok(PathBuf::from(caminho))
}

fn gerar_senha() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

#[cfg(unix)]
fn restringir_permissao(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)
}

#[cfg(not(unix))]
fn restringir_permissao(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

pub fn senha_persistida(diretorio: &Path) -> std::io::Result<String> {
    let arquivo = diretorio.join(PASSWORD_FILE);

    if let Ok(existente) = std::fs::read_to_string(&arquivo) {
        let existente = existente.trim().to_string();
        if !existente.is_empty() {
            return Ok(existente);
        }
    }

    std::fs::create_dir_all(diretorio)?;

    let senha = gerar_senha();
    std::fs::write(&arquivo, &senha)?;
    restringir_permissao(&arquivo)?;

    Ok(senha)
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
        "diretório de dados do PostgreSQL incompleto em {}; recriando",
        data_dir.display()
    );
    if let Err(e) = std::fs::remove_dir_all(data_dir) {
        tracing::error!("falha ao limpar {}: {e}", data_dir.display());
    }
}

async fn provision() -> Result<PostgreSQL, Box<dyn std::error::Error>> {
    let data_dir = data_dir_from(std::env::var("ZEILE_PG_DATA").ok())?;

    let diretorio_de_segredo = data_dir.parent().unwrap_or(&data_dir).to_path_buf();
    let password = senha_persistida(&diretorio_de_segredo)?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sem_zeile_pg_data_o_banco_nao_vai_para_o_temporario() {
        let erro = data_dir_from(None).expect_err("deveria exigir a variável");

        assert!(erro.contains("ZEILE_PG_DATA"));
    }

    #[test]
    fn valor_em_branco_conta_como_ausente() {
        assert!(data_dir_from(Some("   ".to_string())).is_err());
    }

    #[test]
    fn caminho_declarado_e_respeitado() {
        let dir = data_dir_from(Some(" /var/lib/zeile/pg ".to_string())).expect("caminho");

        assert_eq!(dir, PathBuf::from("/var/lib/zeile/pg"));
    }

    #[test]
    fn a_senha_e_gerada_uma_vez_e_reaproveitada() {
        let base = std::env::temp_dir().join(format!("zeile-pg-teste-{}", uuid::Uuid::new_v4()));

        let primeira = senha_persistida(&base).expect("primeira senha");
        let segunda = senha_persistida(&base).expect("segunda senha");

        assert_eq!(primeira, segunda);
        assert!(primeira.len() >= 32);

        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn senhas_de_instalacoes_diferentes_nao_coincidem() {
        let a = std::env::temp_dir().join(format!("zeile-pg-teste-{}", uuid::Uuid::new_v4()));
        let b = std::env::temp_dir().join(format!("zeile-pg-teste-{}", uuid::Uuid::new_v4()));

        let senha_a = senha_persistida(&a).expect("senha a");
        let senha_b = senha_persistida(&b).expect("senha b");

        assert_ne!(senha_a, senha_b);

        std::fs::remove_dir_all(&a).ok();
        std::fs::remove_dir_all(&b).ok();
    }

    #[cfg(unix)]
    #[test]
    fn o_arquivo_de_senha_fica_0600() {
        use std::os::unix::fs::PermissionsExt;

        let base = std::env::temp_dir().join(format!("zeile-pg-teste-{}", uuid::Uuid::new_v4()));
        senha_persistida(&base).expect("senha");

        let modo = std::fs::metadata(base.join(PASSWORD_FILE))
            .expect("metadados")
            .permissions()
            .mode();

        assert_eq!(modo & 0o777, 0o600);

        std::fs::remove_dir_all(&base).ok();
    }
}
