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

    let aceitavel = raw
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');

    aceitavel.then(|| raw.to_string())
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

    fn headers_com(valor: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            REQUEST_ID_HEADER,
            HeaderValue::from_str(valor).expect("valor de header"),
        );
        headers
    }

    #[test]
    fn sem_header_nao_ha_id_de_entrada() {
        assert_eq!(incoming_request_id(&HeaderMap::new()), None);
    }

    #[test]
    fn id_bem_formado_e_reaproveitado() {
        let headers = headers_com("abc-123_DEF");

        assert_eq!(
            incoming_request_id(&headers),
            Some("abc-123_DEF".to_string())
        );
    }

    #[test]
    fn id_longo_demais_e_descartado() {
        let headers = headers_com(&"a".repeat(MAX_LEN + 1));

        assert_eq!(incoming_request_id(&headers), None);
    }

    #[test]
    fn id_com_caractere_fora_do_alfabeto_e_descartado() {
        let headers = headers_com("id com espaco");

        assert_eq!(incoming_request_id(&headers), None);
    }

    #[test]
    fn id_vazio_e_descartado() {
        let headers = headers_com("   ");

        assert_eq!(incoming_request_id(&headers), None);
    }
}
