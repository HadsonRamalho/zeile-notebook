use hyper::Method;
use hyper::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderName, HeaderValue};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::middleware::request_id::REQUEST_ID_HEADER;

const ORIGINS_VAR: &str = "CORS_ALLOWED_ORIGINS";
const FALLBACK_ORIGINS: [&str; 2] = ["http://localhost:3000", "http://127.0.0.1:3000"];

pub fn allowed_origins_from(raw: Option<String>, frontend_url: Option<String>) -> Vec<String> {
    let declaradas: Vec<String> = raw
        .unwrap_or_default()
        .split(',')
        .map(|o| o.trim().trim_end_matches('/').to_string())
        .filter(|o| !o.is_empty())
        .collect();

    if !declaradas.is_empty() {
        return declaradas;
    }

    let mut origins: Vec<String> = FALLBACK_ORIGINS.iter().map(|o| o.to_string()).collect();

    if let Some(url) = frontend_url {
        let url = url.trim().trim_end_matches('/').to_string();
        if !url.is_empty() && !origins.contains(&url) {
            origins.push(url);
        }
    }

    origins
}

pub fn cors_layer() -> CorsLayer {
    let origins = allowed_origins_from(
        std::env::var(ORIGINS_VAR).ok(),
        std::env::var("FRONTEND_URL").ok(),
    );

    if std::env::var(ORIGINS_VAR).is_err() {
        tracing::warn!("{ORIGINS_VAR} not set; allowing only {origins:?}");
    }

    let valores: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|origin| match HeaderValue::from_str(origin) {
            Ok(value) => Some(value),
            Err(_) => {
                tracing::warn!("invalid origin in {ORIGINS_VAR}, ignored: {origin}");
                None
            }
        })
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(valores))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            ACCEPT,
            REQUEST_ID_HEADER,
            HeaderName::from_static("x-requested-with"),
        ])
        .allow_credentials(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn declared_list_wins_over_the_fallback() {
        let origins = allowed_origins_from(
            Some("https://zeile.app, https://beta.zeile.app/".to_string()),
            Some("http://localhost:3000".to_string()),
        );

        assert_eq!(origins, vec!["https://zeile.app", "https://beta.zeile.app"]);
    }

    #[test]
    fn without_a_variable_the_frontend_url_joins_the_fallback() {
        let origins = allowed_origins_from(None, Some("https://zeile.app/".to_string()));

        assert!(origins.contains(&"https://zeile.app".to_string()));
        assert!(origins.contains(&"http://localhost:3000".to_string()));
    }

    #[test]
    fn no_origin_is_a_wildcard() {
        let origins = allowed_origins_from(None, None);

        assert!(!origins.iter().any(|o| o == "*"));
        assert_eq!(origins.len(), FALLBACK_ORIGINS.len());
    }

    #[test]
    fn an_empty_entry_does_not_become_an_origin() {
        let origins = allowed_origins_from(Some(" , ,".to_string()), None);

        assert_eq!(origins.len(), FALLBACK_ORIGINS.len());
    }
}
