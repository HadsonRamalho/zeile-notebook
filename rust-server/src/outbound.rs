use std::time::Duration;

pub const HTTP_TIMEOUT_VAR: &str = "HTTP_CLIENT_TIMEOUT_SECS";
pub const SMTP_TIMEOUT_VAR: &str = "SMTP_TIMEOUT_SECS";

const HTTP_TIMEOUT_PADRAO: u64 = 10;
const SMTP_TIMEOUT_PADRAO: u64 = 15;
const TIMEOUT_MAXIMO: u64 = 120;

pub fn timeout_from(raw: Option<String>, padrao: u64) -> Duration {
    let segundos = raw
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|s| *s > 0 && *s <= TIMEOUT_MAXIMO)
        .unwrap_or(padrao);

    Duration::from_secs(segundos)
}

pub fn http_timeout() -> Duration {
    timeout_from(std::env::var(HTTP_TIMEOUT_VAR).ok(), HTTP_TIMEOUT_PADRAO)
}

pub fn smtp_timeout() -> Duration {
    timeout_from(std::env::var(SMTP_TIMEOUT_VAR).ok(), SMTP_TIMEOUT_PADRAO)
}

pub fn http_client() -> reqwest::Client {
    match reqwest::Client::builder().timeout(http_timeout()).build() {
        Ok(client) => client,
        Err(e) => {
            tracing::error!("cliente HTTP com timeout falhou ao construir: {e}");
            reqwest::Client::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sem_variavel_usa_o_padrao() {
        assert_eq!(timeout_from(None, 10), Duration::from_secs(10));
    }

    #[test]
    fn valor_valido_vence_o_padrao() {
        assert_eq!(
            timeout_from(Some(" 30 ".to_string()), 10),
            Duration::from_secs(30)
        );
    }

    #[test]
    fn zero_nao_desliga_o_timeout() {
        assert_eq!(
            timeout_from(Some("0".to_string()), 10),
            Duration::from_secs(10)
        );
    }

    #[test]
    fn valor_absurdo_cai_no_padrao() {
        assert_eq!(
            timeout_from(Some((TIMEOUT_MAXIMO + 1).to_string()), 10),
            Duration::from_secs(10)
        );
    }

    #[test]
    fn valor_ilegivel_cai_no_padrao() {
        assert_eq!(
            timeout_from(Some("dez".to_string()), 10),
            Duration::from_secs(10)
        );
    }
}
