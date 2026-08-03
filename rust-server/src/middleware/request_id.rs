use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;
use hyper::HeaderMap;
use hyper::header::{HeaderName, HeaderValue};
use tracing::Instrument;
use uuid::Uuid;

pub const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

const MAX_LEN: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequestId(pub String);

pub fn incoming_request_id(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(&REQUEST_ID_HEADER)?.to_str().ok()?.trim();

    if raw.is_empty() || raw.len() > MAX_LEN {
        return None;
    }

    let acceptable = raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');

    acceptable.then(|| raw.to_string())
}

pub async fn propagate(mut request: Request, next: Next) -> Response {
    let id = incoming_request_id(request.headers())
        .unwrap_or_else(|| Uuid::new_v4().simple().to_string());

    request.extensions_mut().insert(RequestId(id.clone()));

    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let span = tracing::info_span!("request", request_id = %id, %method, path = %path);

    let mut response = next.run(request).instrument(span).await;

    if let Ok(value) = HeaderValue::from_str(&id) {
        response.headers_mut().insert(REQUEST_ID_HEADER, value);
    }

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers_with(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            REQUEST_ID_HEADER,
            HeaderValue::from_str(value).expect("header value"),
        );
        headers
    }

    #[test]
    fn without_a_header_there_is_no_incoming_id() {
        assert_eq!(incoming_request_id(&HeaderMap::new()), None);
    }

    #[test]
    fn a_well_formed_id_is_reused() {
        let headers = headers_with("abc-123_DEF");

        assert_eq!(
            incoming_request_id(&headers),
            Some("abc-123_DEF".to_string())
        );
    }

    #[test]
    fn an_id_that_is_too_long_is_discarded() {
        let headers = headers_with(&"a".repeat(MAX_LEN + 1));

        assert_eq!(incoming_request_id(&headers), None);
    }

    #[test]
    fn an_id_with_a_character_outside_the_alphabet_is_discarded() {
        let headers = headers_with("id with space");

        assert_eq!(incoming_request_id(&headers), None);
    }

    #[test]
    fn an_empty_id_is_discarded() {
        let headers = headers_with("   ");

        assert_eq!(incoming_request_id(&headers), None);
    }
}
