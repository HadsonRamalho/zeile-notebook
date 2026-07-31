use axum::http::StatusCode;

use crate::routes::test_support::{corpo_em_texto, get, responder};

async fn resposta(path: &str) -> (StatusCode, String) {
    let response = responder(get(path)).await;
    let status = response.status();

    (status, corpo_em_texto(response).await)
}

#[tokio::test]
async fn live_responde_ok_sem_depender_do_banco() {
    let (status, corpo) = resposta("/health/live").await;

    assert_eq!(status, StatusCode::OK);
    assert!(corpo.contains("live"), "corpo inesperado: {corpo}");
}

#[tokio::test]
async fn ready_responde_503_quando_o_banco_nao_responde() {
    let (status, corpo) = resposta("/health/ready").await;

    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(corpo.contains("not_ready"), "corpo inesperado: {corpo}");
}

#[tokio::test]
async fn health_fica_fora_do_prefixo_api() {
    let (status, _) = resposta("/api/health/live").await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}
