use std::time::Duration;

pub const HTTP_TIMEOUT_VAR: &str = "HTTP_CLIENT_TIMEOUT_SECS";
pub const SMTP_TIMEOUT_VAR: &str = "SMTP_TIMEOUT_SECS";

const DEFAULT_HTTP_TIMEOUT: u64 = 10;
const DEFAULT_SMTP_TIMEOUT: u64 = 15;
const MAX_TIMEOUT: u64 = 120;

pub fn timeout_from(raw: Option<String>, default: u64) -> Duration {
    let seconds = raw
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|s| *s > 0 && *s <= MAX_TIMEOUT)
        .unwrap_or(default);

    Duration::from_secs(seconds)
}

pub fn http_timeout() -> Duration {
    timeout_from(std::env::var(HTTP_TIMEOUT_VAR).ok(), DEFAULT_HTTP_TIMEOUT)
}

pub fn smtp_timeout() -> Duration {
    timeout_from(std::env::var(SMTP_TIMEOUT_VAR).ok(), DEFAULT_SMTP_TIMEOUT)
}

pub fn http_client() -> reqwest::Client {
    match reqwest::Client::builder().timeout(http_timeout()).build() {
        Ok(client) => client,
        Err(e) => {
            tracing::error!("HTTP client with timeout failed to build: {e}");
            reqwest::Client::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_a_variable_uses_the_default() {
        assert_eq!(timeout_from(None, 10), Duration::from_secs(10));
    }

    #[test]
    fn valid_value_wins_over_the_default() {
        assert_eq!(
            timeout_from(Some(" 30 ".to_string()), 10),
            Duration::from_secs(30)
        );
    }

    #[test]
    fn zero_does_not_turn_off_the_timeout() {
        assert_eq!(
            timeout_from(Some("0".to_string()), 10),
            Duration::from_secs(10)
        );
    }

    #[test]
    fn absurd_value_falls_back_to_the_default() {
        assert_eq!(
            timeout_from(Some((MAX_TIMEOUT + 1).to_string()), 10),
            Duration::from_secs(10)
        );
    }

    #[test]
    fn unparseable_value_falls_back_to_the_default() {
        assert_eq!(
            timeout_from(Some("ten".to_string()), 10),
            Duration::from_secs(10)
        );
    }
}
