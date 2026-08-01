use axum::Json;
use dotenvy::dotenv;
use hyper::StatusCode;
use pwhash::bcrypt;
use rand::Rng;
use std::env;
use std::time::{Duration, SystemTime};

use crate::models::error::ApiError;

const ONE_SECOND: u64 = 1000;
const ONE_MINUTE: u64 = 60 * ONE_SECOND;

pub fn validate_cpf(cpf: &str) -> bool {
    let cpf: Vec<u8> = cpf
        .chars()
        .filter(|c| c.is_digit(10))
        .map(|c| c.to_digit(10).unwrap() as u8)
        .collect();

    if cpf.len() != 11 || cpf.iter().all(|&d| d == cpf[0]) {
        return false;
    }

    let soma1: u32 = cpf
        .iter()
        .take(9)
        .enumerate()
        .map(|(i, &d)| (10 - i as u32) * d as u32)
        .sum();

    let dig1 = if soma1 % 11 < 2 { 0 } else { 11 - (soma1 % 11) };

    let soma2: u32 = cpf
        .iter()
        .take(10)
        .enumerate()
        .map(|(i, &d)| (11 - i as u32) * d as u32)
        .sum();

    let dig2 = if soma2 % 11 < 2 { 0 } else { 11 - (soma2 % 11) };

    cpf[9] == dig1 as u8 && cpf[10] == dig2 as u8
}

pub fn validate_cnpj(cnpj: &str) -> bool {
    let cnpj: Vec<u8> = cnpj
        .chars()
        .filter(|c| c.is_digit(10))
        .map(|c| c.to_digit(10).unwrap() as u8)
        .collect();

    if cnpj.len() != 14 || cnpj.windows(2).all(|w| w[0] == w[1]) {
        return false;
    }

    let calc_digito = |slice: &[u8], pesos: &[u8]| -> u8 {
        let soma: u32 = slice
            .iter()
            .zip(pesos.iter())
            .map(|(&d, &p)| (d as u32) * (p as u32))
            .sum();
        let resto = soma % 11;
        if resto < 2 { 0 } else { (11 - resto) as u8 }
    };

    let pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let d1 = calc_digito(&cnpj[0..12], &pesos1);
    let d2 = calc_digito(&[&cnpj[0..12], &[d1]].concat(), &pesos2);

    cnpj[12] == d1 && cnpj[13] == d2
}

pub fn format_cnpj(cnpj: &str) -> Result<String, String> {
    let cnpj_numeros: Vec<char> = cnpj.chars().filter(|c: &char| c.is_ascii_digit()).collect();
    if cnpj_numeros.len() != 14 {
        return Err("Invalid CNPJ length".to_string());
    }
    let mut cnpj: Vec<char> = cnpj_numeros;
    cnpj.insert(2, '.');
    cnpj.insert(6, '.');
    cnpj.insert(10, '/');
    cnpj.insert(15, '-');
    let mut cnpjfinal: String = "".to_string();
    for u in cnpj {
        cnpjfinal.push(u);
    }
    Ok(cnpjfinal)
}

pub fn format_cpf(cpf: &str) -> Result<String, String> {
    let cpf: Vec<char> = cpf.chars().filter(|c: &char| c.is_digit(10)).collect();
    if cpf.len() != 11 {
        return Err("Invalid CPF length".to_string());
    }
    let mut cpf: Vec<char> = cpf;
    cpf.insert(3, '.');
    cpf.insert(7, '.');
    cpf.insert(11, '-');
    let mut cpffinal: String = "".to_string();
    for u in cpf {
        cpffinal.push(u);
    }
    Ok(cpffinal)
}

pub fn format_document(documento_: &str) -> Result<String, String> {
    if let Ok(cpf) = format_cpf(documento_) {
        return Ok(cpf);
    }
    if let Ok(cnpj) = format_cnpj(documento_) {
        return Ok(cnpj);
    }
    Err("Invalid document".to_string())
}

pub fn random_hash() -> String {
    let now = chrono::Utc::now().to_string();
    bcrypt::hash(now).unwrap()
}

/// Prefixo PHC de um hash argon2. bcrypt usa `$2a$`/`$2b$`/`$2y$`, então o
/// prefixo distingue hash novo de hash legado sem precisar de coluna extra.
const PREFIXO_ARGON2: &str = "$argon2";

pub fn password_hash(input: &str) -> String {
    use argon2::password_hash::{SaltString, rand_core::OsRng};
    use argon2::{Argon2, PasswordHasher};

    let salt = SaltString::generate(&mut OsRng);

    match Argon2::default().hash_password(input.as_bytes(), &salt) {
        Ok(hash) => hash.to_string(),
        Err(e) => {
            // Não há como seguir com um hash fraco: sem isso o cadastro
            // gravaria credencial que não protege nada.
            panic!("falha ao derivar hash de senha: {e}");
        }
    }
}

pub fn password_verify(senha: &str, hash: &str) -> bool {
    if !hash.starts_with(PREFIXO_ARGON2) {
        return bcrypt::verify(senha, hash);
    }

    use argon2::password_hash::PasswordHash;
    use argon2::{Argon2, PasswordVerifier};

    PasswordHash::new(hash)
        .map(|esperado| {
            Argon2::default()
                .verify_password(senha.as_bytes(), &esperado)
                .is_ok()
        })
        .unwrap_or(false)
}

/// Hash legado que deve ser regravado em argon2id no próximo login bem-sucedido,
/// que é o único momento em que a senha em claro está disponível.
pub fn hash_precisa_migrar(hash: &str) -> bool {
    !hash.starts_with(PREFIXO_ARGON2)
}

pub fn random_public_id() -> i32 {
    let output = rand::thread_rng().gen_range(1000000..9999999);
    output
}

pub fn get_database_url_from_env() -> Result<String, (StatusCode, Json<String>)> {
    dotenv().ok();

    match env::var("DATABASE_URL") {
        Ok(secret) => Ok(secret),
        Err(error) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ApiError::DatabaseConnection(error.to_string()).to_string()),
            ));
        }
    }
}

pub fn get_var_from_env(var: &str) -> Result<String, ApiError> {
    dotenv().ok();

    match env::var(var) {
        Ok(secret) => Ok(secret),
        Err(_) => {
            return Err(ApiError::MissingEnv(var.to_string()));
        }
    }
}

pub fn get_frontend_url_from_env() -> Result<String, (StatusCode, Json<String>)> {
    dotenv().ok();

    match env::var("FRONTEND_URL") {
        Ok(secret) => Ok(secret),
        Err(_) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ApiError::FrontendUrl.to_string()),
            ));
        }
    }
}

use diesel_async::{
    AsyncPgConnection,
    pooled_connection::deadpool::{Object, Pool},
};

pub async fn get_conn(
    pool: &Pool<AsyncPgConnection>,
) -> Result<Object<AsyncPgConnection>, (StatusCode, Json<String>)> {
    pool.get()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(e.to_string())))
}

pub trait Sanitize {
    fn sanitize(&mut self);
}

pub fn extract_module_name(code: &str) -> Option<String> {
    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//#[mod=") && trimmed.ends_with("]") {
            let name = trimmed.trim_start_matches("//#[mod=").trim_end_matches("]");

            if name.chars().all(|c| c.is_alphanumeric() || c == '_') {
                return Some(name.to_string());
            }
        }
    }
    None
}

pub async fn auto_delete_files() {
    let mins = ONE_MINUTE * 20;
    let intervalo_verificacao = Duration::from_millis(mins);
    let tempo_maximo_vida = Duration::from_millis(mins);

    println!("LOG: Iniciando tarefa de limpeza automática");

    loop {
        tokio::time::sleep(intervalo_verificacao).await;

        println!("LOG: [GC] Iniciando varredura de limpeza...");

        let mut entradas = match tokio::fs::read_dir("files").await {
            Ok(e) => e,
            Err(_) => continue,
        };

        while let Ok(Some(entry)) = entradas.next_entry().await {
            let path = entry.path();

            if path.is_dir() {
                if let Ok(metadata) = tokio::fs::metadata(&path).await {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(idade) = SystemTime::now().duration_since(modified) {
                            if idade > tempo_maximo_vida {
                                println!("LOG: [GC] Removendo pasta antiga: {:?}", path);
                                if let Err(e) = tokio::fs::remove_dir_all(&path).await {
                                    eprintln!("ERRO: [GC] Falha ao deletar {:?}: {}", path, e);
                                }
                            }
                        }
                    }
                }
            }
        }
        println!("LOG: [GC] Varredura finalizada.");
    }
}

pub const LOG_DIR: &str = "logs";

pub const RETENCAO_LOGS_DIAS_PADRAO: u64 = 3;

const UM_DIA: Duration = Duration::from_secs(24 * 60 * 60);

pub fn retencao_de_logs() -> Duration {
    let dias = env::var("ZEILE_LOG_RETENTION_DAYS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|d| *d > 0)
        .unwrap_or(RETENCAO_LOGS_DIAS_PADRAO);

    UM_DIA * dias as u32
}

fn idade_de(metadata: &std::fs::Metadata) -> Option<Duration> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
}

/// Remove arquivos de log mais velhos que a retenção e depois as pastas de
/// sessão que ficaram vazias. Varre por arquivo, e não por pasta: uma sessão
/// ativa tem mtime recente na pasta mas pode guardar registros antigos dentro.
pub async fn limpar_logs_antigos(raiz: &str, retencao: Duration) -> u64 {
    let mut removidos = 0;

    let mut sessoes = match tokio::fs::read_dir(raiz).await {
        Ok(entradas) => entradas,
        Err(_) => return 0,
    };

    while let Ok(Some(sessao)) = sessoes.next_entry().await {
        let caminho = sessao.path();

        if !caminho.is_dir() {
            if let Ok(metadata) = tokio::fs::metadata(&caminho).await {
                if idade_de(&metadata).is_some_and(|idade| idade > retencao)
                    && tokio::fs::remove_file(&caminho).await.is_ok()
                {
                    removidos += 1;
                }
            }
            continue;
        }

        let mut registros = match tokio::fs::read_dir(&caminho).await {
            Ok(entradas) => entradas,
            Err(_) => continue,
        };

        let mut restantes = 0;

        while let Ok(Some(registro)) = registros.next_entry().await {
            let arquivo = registro.path();

            let Ok(metadata) = tokio::fs::metadata(&arquivo).await else {
                restantes += 1;
                continue;
            };

            if idade_de(&metadata).is_some_and(|idade| idade > retencao) {
                match tokio::fs::remove_file(&arquivo).await {
                    Ok(_) => removidos += 1,
                    Err(e) => {
                        eprintln!("ERRO: [GC] Falha ao remover log {:?}: {}", arquivo, e);
                        restantes += 1;
                    }
                }
                continue;
            }

            restantes += 1;
        }

        if restantes == 0 {
            let _ = tokio::fs::remove_dir(&caminho).await;
        }
    }

    removidos
}

pub async fn auto_delete_logs() {
    let retencao = retencao_de_logs();

    println!(
        "LOG: Iniciando retenção de logs em {} dia(s)",
        retencao.as_secs() / UM_DIA.as_secs()
    );

    loop {
        tokio::time::sleep(UM_DIA).await;

        let removidos = limpar_logs_antigos(LOG_DIR, retencao).await;

        println!("LOG: [GC] Retenção de logs concluída; {removidos} registro(s) removido(s).");
    }
}

pub fn get_email_credentials() -> Result<(String, String), String> {
    dotenv().ok();
    let smtp_username = match env::var("SMTP_USERNAME") {
        Ok(username) => username,
        Err(e) => return Err(format!("SMTP_USERNAME não definido no arquivo .env: {}", e)),
    };
    let smtp_password = match env::var("SMTP_PASSWORD") {
        Ok(password) => password,
        Err(e) => return Err(format!("SMTP_PASSWORD não definido no arquivo .env: {}", e)),
    };
    let credenciais = (smtp_username, smtp_password);
    Ok(credenciais)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn o_hash_novo_e_argon2id() {
        let hash = password_hash("senha-do-usuario");

        assert!(hash.starts_with("$argon2id$"), "{hash}");
        assert!(!hash_precisa_migrar(&hash));
    }

    #[test]
    fn dois_hashes_da_mesma_senha_diferem() {
        let a = password_hash("mesma-senha");
        let b = password_hash("mesma-senha");

        assert_ne!(a, b, "o salt deveria tornar cada hash único");
    }

    #[test]
    fn verifica_a_senha_certa_e_recusa_a_errada() {
        let hash = password_hash("senha-correta");

        assert!(password_verify("senha-correta", &hash));
        assert!(!password_verify("senha-errada", &hash));
        assert!(!password_verify("", &hash));
    }

    #[test]
    fn hash_bcrypt_legado_continua_validando() {
        let legado = bcrypt::hash("senha-antiga").expect("hash bcrypt");

        assert!(
            password_verify("senha-antiga", &legado),
            "usuário antigo ficaria trancado fora da conta"
        );
        assert!(!password_verify("outra", &legado));
        assert!(
            hash_precisa_migrar(&legado),
            "hash bcrypt precisa ser marcado para migração"
        );
    }

    #[test]
    fn hash_corrompido_nao_valida_nada() {
        assert!(!password_verify("qualquer", "$argon2id$lixo"));
        assert!(!password_verify("qualquer", ""));
    }

    const CURTA: Duration = Duration::from_millis(150);

    async fn raiz_temporaria(nome: &str) -> std::path::PathBuf {
        let raiz = std::env::temp_dir().join(format!("zeile_logs_{}_{}", nome, uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&raiz).await.expect("criar raiz");
        raiz
    }

    #[test]
    fn a_retencao_padrao_e_de_tres_dias() {
        unsafe { std::env::remove_var("ZEILE_LOG_RETENTION_DAYS") };

        assert_eq!(retencao_de_logs(), UM_DIA * 3);
    }

    #[test]
    fn a_retencao_e_configuravel_e_ignora_valor_invalido() {
        unsafe { std::env::set_var("ZEILE_LOG_RETENTION_DAYS", "7") };
        assert_eq!(retencao_de_logs(), UM_DIA * 7);

        unsafe { std::env::set_var("ZEILE_LOG_RETENTION_DAYS", "0") };
        assert_eq!(retencao_de_logs(), UM_DIA * 3);

        unsafe { std::env::set_var("ZEILE_LOG_RETENTION_DAYS", "abc") };
        assert_eq!(retencao_de_logs(), UM_DIA * 3);

        unsafe { std::env::remove_var("ZEILE_LOG_RETENTION_DAYS") };
    }

    #[tokio::test]
    async fn remove_registro_antigo_e_preserva_o_recente() {
        let raiz = raiz_temporaria("mistura").await;
        let sessao = raiz.join("sessao_a");
        tokio::fs::create_dir_all(&sessao).await.expect("sessão");

        let antigo = sessao.join("antigo.log");
        tokio::fs::write(&antigo, "código submetido antes").await.expect("escrever");

        tokio::time::sleep(Duration::from_millis(300)).await;

        let recente = sessao.join("recente.log");
        tokio::fs::write(&recente, "código de agora").await.expect("escrever");

        let removidos = limpar_logs_antigos(raiz.to_str().unwrap(), CURTA).await;

        assert_eq!(removidos, 1, "deveria remover exatamente o registro velho");
        assert!(!antigo.exists(), "registro além da retenção deveria sair");
        assert!(recente.exists(), "registro dentro da retenção não pode sair");
        assert!(sessao.exists(), "a pasta ainda tem registro vivo");

        let _ = tokio::fs::remove_dir_all(&raiz).await;
    }

    #[tokio::test]
    async fn a_pasta_da_sessao_some_quando_esvazia() {
        let raiz = raiz_temporaria("vazia").await;
        let sessao = raiz.join("sessao_b");
        tokio::fs::create_dir_all(&sessao).await.expect("sessão");
        tokio::fs::write(sessao.join("antigo.log"), "conteúdo").await.expect("escrever");

        tokio::time::sleep(Duration::from_millis(300)).await;

        limpar_logs_antigos(raiz.to_str().unwrap(), CURTA).await;

        assert!(!sessao.exists(), "pasta de sessão vazia deveria ser removida");

        let _ = tokio::fs::remove_dir_all(&raiz).await;
    }

    #[tokio::test]
    async fn nada_e_removido_dentro_da_retencao() {
        let raiz = raiz_temporaria("intacta").await;
        let sessao = raiz.join("sessao_c");
        tokio::fs::create_dir_all(&sessao).await.expect("sessão");
        let registro = sessao.join("agora.log");
        tokio::fs::write(&registro, "conteúdo").await.expect("escrever");

        let removidos = limpar_logs_antigos(raiz.to_str().unwrap(), UM_DIA * 3).await;

        assert_eq!(removidos, 0);
        assert!(registro.exists());

        let _ = tokio::fs::remove_dir_all(&raiz).await;
    }

    #[tokio::test]
    async fn uma_raiz_inexistente_nao_e_erro() {
        let inexistente = std::env::temp_dir().join(format!("zeile_ausente_{}", uuid::Uuid::new_v4()));

        assert_eq!(limpar_logs_antigos(inexistente.to_str().unwrap(), CURTA).await, 0);
    }
}
