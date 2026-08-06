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
        .filter(|c| c.is_ascii_digit())
        .map(|c| c.to_digit(10).unwrap() as u8)
        .collect();

    if cpf.len() != 11 || cpf.iter().all(|&d| d == cpf[0]) {
        return false;
    }

    let sum1: u32 = cpf
        .iter()
        .take(9)
        .enumerate()
        .map(|(i, &d)| (10 - i as u32) * d as u32)
        .sum();

    let digit1 = if sum1 % 11 < 2 { 0 } else { 11 - (sum1 % 11) };

    let sum2: u32 = cpf
        .iter()
        .take(10)
        .enumerate()
        .map(|(i, &d)| (11 - i as u32) * d as u32)
        .sum();

    let digit2 = if sum2 % 11 < 2 { 0 } else { 11 - (sum2 % 11) };

    cpf[9] == digit1 as u8 && cpf[10] == digit2 as u8
}

pub fn validate_cnpj(cnpj: &str) -> bool {
    let cnpj: Vec<u8> = cnpj
        .chars()
        .filter(|c| c.is_ascii_digit())
        .map(|c| c.to_digit(10).unwrap() as u8)
        .collect();

    if cnpj.len() != 14 || cnpj.windows(2).all(|w| w[0] == w[1]) {
        return false;
    }

    let calc_digit = |slice: &[u8], weights: &[u8]| -> u8 {
        let sum: u32 = slice
            .iter()
            .zip(weights.iter())
            .map(|(&d, &w)| (d as u32) * (w as u32))
            .sum();
        let remainder = sum % 11;
        if remainder < 2 {
            0
        } else {
            (11 - remainder) as u8
        }
    };

    let weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let d1 = calc_digit(&cnpj[0..12], &weights1);
    let d2 = calc_digit(&[&cnpj[0..12], &[d1]].concat(), &weights2);

    cnpj[12] == d1 && cnpj[13] == d2
}

pub fn format_cnpj(cnpj: &str) -> Result<String, String> {
    let cnpj_digits: Vec<char> = cnpj.chars().filter(|c: &char| c.is_ascii_digit()).collect();
    if cnpj_digits.len() != 14 {
        return Err("Invalid CNPJ length".to_string());
    }
    let mut cnpj: Vec<char> = cnpj_digits;
    cnpj.insert(2, '.');
    cnpj.insert(6, '.');
    cnpj.insert(10, '/');
    cnpj.insert(15, '-');
    let mut cnpj_final: String = "".to_string();
    for u in cnpj {
        cnpj_final.push(u);
    }
    Ok(cnpj_final)
}

pub fn format_cpf(cpf: &str) -> Result<String, String> {
    let cpf: Vec<char> = cpf.chars().filter(|c: &char| c.is_ascii_digit()).collect();
    if cpf.len() != 11 {
        return Err("Invalid CPF length".to_string());
    }
    let mut cpf: Vec<char> = cpf;
    cpf.insert(3, '.');
    cpf.insert(7, '.');
    cpf.insert(11, '-');
    let mut cpf_final: String = "".to_string();
    for u in cpf {
        cpf_final.push(u);
    }
    Ok(cpf_final)
}

pub fn format_document(document: &str) -> Result<String, String> {
    if let Ok(cpf) = format_cpf(document) {
        return Ok(cpf);
    }
    if let Ok(cnpj) = format_cnpj(document) {
        return Ok(cnpj);
    }
    Err("Invalid document".to_string())
}

pub fn random_hash() -> String {
    let now = chrono::Utc::now().to_string();
    bcrypt::hash(now).unwrap()
}

/// PHC prefix of an argon2 hash. bcrypt uses `$2a$`/`$2b$`/`$2y$`, so the
/// prefix distinguishes a new hash from a legacy one without an extra column.
const ARGON2_PREFIX: &str = "$argon2";

pub fn password_hash(input: &str) -> String {
    use argon2::password_hash::{SaltString, rand_core::OsRng};
    use argon2::{Argon2, PasswordHasher};

    let salt = SaltString::generate(&mut OsRng);

    match Argon2::default().hash_password(input.as_bytes(), &salt) {
        Ok(hash) => hash.to_string(),
        Err(e) => {
            // There's no way to proceed with a weak hash: without this,
            // signup would store a credential that protects nothing.
            panic!("failed to derive password hash: {e}");
        }
    }
}

pub fn password_verify(password: &str, hash: &str) -> bool {
    if !hash.starts_with(ARGON2_PREFIX) {
        return bcrypt::verify(password, hash);
    }

    use argon2::password_hash::PasswordHash;
    use argon2::{Argon2, PasswordVerifier};

    PasswordHash::new(hash)
        .map(|expected| {
            Argon2::default()
                .verify_password(password.as_bytes(), &expected)
                .is_ok()
        })
        .unwrap_or(false)
}

/// Legacy hash that must be rewritten as argon2id on the next successful
/// login, which is the only moment the plaintext password is available.
pub fn hash_needs_migration(hash: &str) -> bool {
    !hash.starts_with(ARGON2_PREFIX)
}

pub fn random_public_id() -> i32 {
    rand::thread_rng().gen_range(1000000..9999999)
}

pub fn get_database_url_from_env() -> Result<String, (StatusCode, Json<String>)> {
    dotenv().ok();

    match env::var("DATABASE_URL") {
        Ok(secret) => Ok(secret),
        Err(error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ApiError::DatabaseConnection(error.to_string()).to_string()),
        )),
    }
}

pub fn get_var_from_env(var: &str) -> Result<String, ApiError> {
    dotenv().ok();

    match env::var(var) {
        Ok(secret) => Ok(secret),
        Err(_) => Err(ApiError::MissingEnv(var.to_string())),
    }
}

pub fn get_frontend_url_from_env() -> Result<String, (StatusCode, Json<String>)> {
    dotenv().ok();

    match env::var("FRONTEND_URL") {
        Ok(secret) => Ok(secret),
        Err(_) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ApiError::FrontendUrl.to_string()),
        )),
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
    let check_interval = Duration::from_millis(mins);
    let max_lifetime = Duration::from_millis(mins);

    println!("LOG: starting automatic cleanup task");

    loop {
        tokio::time::sleep(check_interval).await;

        println!("LOG: [GC] starting cleanup scan...");

        let mut entries = match tokio::fs::read_dir("files").await {
            Ok(e) => e,
            Err(_) => continue,
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            if path.is_dir()
                && let Ok(metadata) = tokio::fs::metadata(&path).await
                && let Ok(modified) = metadata.modified()
                && let Ok(age) = SystemTime::now().duration_since(modified)
                && age > max_lifetime
            {
                println!("LOG: [GC] removing old folder: {:?}", path);
                if let Err(e) = tokio::fs::remove_dir_all(&path).await {
                    eprintln!("ERROR: [GC] failed to delete {:?}: {}", path, e);
                }
            }
        }
        println!("LOG: [GC] scan finished.");
    }
}

pub const LOG_DIR: &str = "logs";

pub const DEFAULT_LOG_RETENTION_DAYS: u64 = 3;

const ONE_DAY: Duration = Duration::from_secs(24 * 60 * 60);

pub fn log_retention() -> Duration {
    let days = env::var("ZEILE_LOG_RETENTION_DAYS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|d| *d > 0)
        .unwrap_or(DEFAULT_LOG_RETENTION_DAYS);

    ONE_DAY * days as u32
}

fn age_of(metadata: &std::fs::Metadata) -> Option<Duration> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
}

/// Removes log files older than the retention period, then the session
/// folders left empty. Scans by file, not by folder: an active session has a
/// recent mtime on the folder but may hold old records inside it.
pub async fn clean_old_logs(root: &str, retention: Duration) -> u64 {
    let mut removed = 0;

    let mut sessions = match tokio::fs::read_dir(root).await {
        Ok(entries) => entries,
        Err(_) => return 0,
    };

    while let Ok(Some(session)) = sessions.next_entry().await {
        let path = session.path();

        if !path.is_dir() {
            if let Ok(metadata) = tokio::fs::metadata(&path).await
                && age_of(&metadata).is_some_and(|age| age > retention)
                && tokio::fs::remove_file(&path).await.is_ok()
            {
                removed += 1;
            }
            continue;
        }

        let mut records = match tokio::fs::read_dir(&path).await {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        let mut remaining = 0;

        while let Ok(Some(record)) = records.next_entry().await {
            let file = record.path();

            let Ok(metadata) = tokio::fs::metadata(&file).await else {
                remaining += 1;
                continue;
            };

            if age_of(&metadata).is_some_and(|age| age > retention) {
                match tokio::fs::remove_file(&file).await {
                    Ok(_) => removed += 1,
                    Err(e) => {
                        eprintln!("ERROR: [GC] failed to remove log {:?}: {}", file, e);
                        remaining += 1;
                    }
                }
                continue;
            }

            remaining += 1;
        }

        if remaining == 0 {
            tokio::fs::remove_dir(&path).await.ok();
        }
    }

    removed
}

/// Removes expired refresh tokens. Without this the table grows forever with
/// rows that no longer authorize anything.
pub async fn auto_delete_refresh_tokens(
    pool: diesel_async::pooled_connection::deadpool::Pool<AsyncPgConnection>,
) {
    loop {
        tokio::time::sleep(ONE_DAY).await;

        let Ok(mut conn) = pool.get().await else {
            continue;
        };

        match crate::domain::user::delete_expired_refresh_tokens(&mut conn).await {
            Ok(count) => println!("LOG: [GC] {count} expired refresh token(s) removed."),
            Err(e) => eprintln!("ERROR: [GC] failed to clean refresh tokens: {e}"),
        }
    }
}

pub async fn auto_delete_logs() {
    let retention = log_retention();

    println!(
        "LOG: starting log retention at {} day(s)",
        retention.as_secs() / ONE_DAY.as_secs()
    );

    loop {
        tokio::time::sleep(ONE_DAY).await;

        let removed = clean_old_logs(LOG_DIR, retention).await;

        println!("LOG: [GC] log retention finished; {removed} record(s) removed.");
    }
}

pub fn get_email_credentials() -> Result<(String, String), String> {
    dotenv().ok();
    let smtp_username = match env::var("SMTP_USERNAME") {
        Ok(username) => username,
        Err(e) => return Err(format!("SMTP_USERNAME not set in .env file: {}", e)),
    };
    let smtp_password = match env::var("SMTP_PASSWORD") {
        Ok(password) => password,
        Err(e) => return Err(format!("SMTP_PASSWORD not set in .env file: {}", e)),
    };
    let credentials = (smtp_username, smtp_password);
    Ok(credentials)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_hash_is_argon2id() {
        let hash = password_hash("user-password");

        assert!(hash.starts_with("$argon2id$"), "{hash}");
        assert!(!hash_needs_migration(&hash));
    }

    #[test]
    fn two_hashes_of_the_same_password_differ() {
        let a = password_hash("same-password");
        let b = password_hash("same-password");

        assert_ne!(a, b, "the salt should make each hash unique");
    }

    #[test]
    fn verifies_the_right_password_and_rejects_the_wrong_one() {
        let hash = password_hash("correct-password");

        assert!(password_verify("correct-password", &hash));
        assert!(!password_verify("wrong-password", &hash));
        assert!(!password_verify("", &hash));
    }

    #[test]
    fn legacy_bcrypt_hash_still_validates() {
        let legacy = bcrypt::hash("old-password").expect("bcrypt hash");

        assert!(
            password_verify("old-password", &legacy),
            "an old user would be locked out of their account"
        );
        assert!(!password_verify("other", &legacy));
        assert!(
            hash_needs_migration(&legacy),
            "bcrypt hash needs to be flagged for migration"
        );
    }

    #[test]
    fn corrupted_hash_does_not_validate_anything() {
        assert!(!password_verify("anything", "$argon2id$garbage"));
        assert!(!password_verify("anything", ""));
    }

    const SHORT: Duration = Duration::from_millis(150);

    async fn temp_root(name: &str) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("zeile_logs_{}_{}", name, uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&root).await.expect("create root");
        root
    }

    #[test]
    fn default_retention_is_three_days() {
        unsafe { std::env::remove_var("ZEILE_LOG_RETENTION_DAYS") };

        assert_eq!(log_retention(), ONE_DAY * 3);
    }

    #[test]
    fn retention_is_configurable_and_ignores_invalid_value() {
        unsafe { std::env::set_var("ZEILE_LOG_RETENTION_DAYS", "7") };
        assert_eq!(log_retention(), ONE_DAY * 7);

        unsafe { std::env::set_var("ZEILE_LOG_RETENTION_DAYS", "0") };
        assert_eq!(log_retention(), ONE_DAY * 3);

        unsafe { std::env::set_var("ZEILE_LOG_RETENTION_DAYS", "abc") };
        assert_eq!(log_retention(), ONE_DAY * 3);

        unsafe { std::env::remove_var("ZEILE_LOG_RETENTION_DAYS") };
    }

    #[tokio::test]
    async fn removes_old_record_and_keeps_the_recent_one() {
        let root = temp_root("mix").await;
        let session = root.join("session_a");
        tokio::fs::create_dir_all(&session).await.expect("session");

        let old = session.join("old.log");
        tokio::fs::write(&old, "code submitted earlier")
            .await
            .expect("write");

        tokio::time::sleep(Duration::from_millis(300)).await;

        let recent = session.join("recent.log");
        tokio::fs::write(&recent, "code from now")
            .await
            .expect("write");

        let removed = clean_old_logs(root.to_str().unwrap(), SHORT).await;

        assert_eq!(removed, 1, "should remove exactly the old record");
        assert!(!old.exists(), "record beyond retention should be gone");
        assert!(
            recent.exists(),
            "record within retention should not be gone"
        );
        assert!(session.exists(), "the folder still has a live record");

        tokio::fs::remove_dir_all(&root).await.ok();
    }

    #[tokio::test]
    async fn session_folder_disappears_when_empty() {
        let root = temp_root("empty").await;
        let session = root.join("session_b");
        tokio::fs::create_dir_all(&session).await.expect("session");
        tokio::fs::write(session.join("old.log"), "content")
            .await
            .expect("write");

        tokio::time::sleep(Duration::from_millis(300)).await;

        clean_old_logs(root.to_str().unwrap(), SHORT).await;

        assert!(!session.exists(), "empty session folder should be removed");

        tokio::fs::remove_dir_all(&root).await.ok();
    }

    #[tokio::test]
    async fn nothing_is_removed_within_retention() {
        let root = temp_root("intact").await;
        let session = root.join("session_c");
        tokio::fs::create_dir_all(&session).await.expect("session");
        let record = session.join("now.log");
        tokio::fs::write(&record, "content").await.expect("write");

        let removed = clean_old_logs(root.to_str().unwrap(), ONE_DAY * 3).await;

        assert_eq!(removed, 0);
        assert!(record.exists());

        tokio::fs::remove_dir_all(&root).await.ok();
    }

    #[tokio::test]
    async fn a_nonexistent_root_is_not_an_error() {
        let missing = std::env::temp_dir().join(format!("zeile_missing_{}", uuid::Uuid::new_v4()));

        assert_eq!(clean_old_logs(missing.to_str().unwrap(), SHORT).await, 0);
    }
}
