use axum::body::Body;
use axum::http::{Request, StatusCode, header};

use crate::middleware::rate_limit::LOGIN;
use crate::middleware::request_id::REQUEST_ID_HEADER;
use crate::routes::BODY_LIMIT_PADRAO;
use crate::routes::test_support::{get, responder, router_com_banco_inalcancavel};
use tower::ServiceExt;

fn post_json(path: &str, corpo: Vec<u8>) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corpo))
        .expect("requisição")
}

#[tokio::test]
async fn toda_resposta_carrega_um_request_id() {
    let response = responder(get("/health/live")).await;

    let id = response
        .headers()
        .get(&REQUEST_ID_HEADER)
        .expect("x-request-id na resposta")
        .to_str()
        .expect("id em ascii")
        .to_string();

    assert!(!id.is_empty());
}

#[tokio::test]
async fn request_id_de_entrada_e_propagado() {
    let mut request = get("/health/live");
    request
        .headers_mut()
        .insert(REQUEST_ID_HEADER, "cliente-123".parse().expect("header"));

    let response = responder(request).await;

    assert_eq!(
        response
            .headers()
            .get(&REQUEST_ID_HEADER)
            .and_then(|v| v.to_str().ok()),
        Some("cliente-123")
    );
}

#[tokio::test]
async fn request_id_forjado_e_substituido() {
    let mut request = get("/health/live");
    request.headers_mut().insert(
        REQUEST_ID_HEADER,
        "id\tcom\tcontrole".parse().expect("header"),
    );

    let response = responder(request).await;
    let id = response
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .expect("id na resposta");

    assert_ne!(id, "id\tcom\tcontrole");
}

#[tokio::test]
async fn corpo_acima_de_1mb_e_recusado_na_rota_comum() {
    let corpo = vec![b'a'; BODY_LIMIT_PADRAO + 1];

    let response = responder(post_json("/api/user/register", corpo)).await;

    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn rota_de_conteudo_aceita_mais_que_o_limite_padrao() {
    let corpo = vec![b'a'; BODY_LIMIT_PADRAO + 1];

    let request = Request::builder()
        .method("PUT")
        .uri("/api/notebook/00000000-0000-0000-0000-000000000000/content")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(corpo))
        .expect("requisição");

    let response = responder(request).await;

    assert_ne!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn login_passa_a_responder_429_depois_da_cota() {
    let router = router_com_banco_inalcancavel().await;

    for _ in 0..LOGIN.max {
        let response = router
            .clone()
            .oneshot(post_json("/api/user/login", b"{}".to_vec()))
            .await
            .expect("resposta");

        assert_ne!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    }

    let response = router
        .oneshot(post_json("/api/user/login", b"{}".to_vec()))
        .await
        .expect("resposta");

    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(response.headers().contains_key(header::RETRY_AFTER));
}

#[tokio::test]
async fn origem_desconhecida_nao_recebe_liberacao_de_cors() {
    let mut request = get("/health/live");
    request
        .headers_mut()
        .insert(header::ORIGIN, "https://atacante.test".parse().expect("h"));

    let response = responder(request).await;

    assert!(
        !response
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN)
    );
}
