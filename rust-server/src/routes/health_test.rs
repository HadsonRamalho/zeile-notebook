use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use crate::bootstrap;
use crate::routes::build_router;

static CRYPTO: std::sync::Once = std::sync::Once::new();

async fn router_com_banco_inalcancavel() -> axum::Router {
    CRYPTO.call_once(|| {
        bootstrap::install_crypto_provider().expect("provedor de criptografia");
    });

    let pool = bootstrap::build_pool(
        "postgres://usuario:senha@127.0.0.1:1/banco-que-nao-existe".to_string(),
    )
    .expect("pool é preguiçoso e deve ser construído sem conectar");

    let state = bootstrap::build_state(pool).expect("estado");

    build_router(state).await
}

async fn resposta(path: &str) -> (StatusCode, String) {
    let router = router_com_banco_inalcancavel().await;

    let response = router
        .oneshot(
            Request::builder()
                .uri(path)
                .body(Body::empty())
                .expect("requisição"),
        )
        .await
        .expect("resposta");

    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("corpo")
        .to_bytes();

    (status, String::from_utf8_lossy(&bytes).to_string())
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
