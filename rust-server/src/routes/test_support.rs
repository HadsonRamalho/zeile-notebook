use axum::body::Body;
use axum::http::{Request, Response};
use http_body_util::BodyExt;
use tower::ServiceExt;

use crate::bootstrap;
use crate::routes::build_router;

static CRYPTO: std::sync::Once = std::sync::Once::new();

pub async fn router_com_banco_inalcancavel() -> axum::Router {
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

pub async fn responder(request: Request<Body>) -> Response<Body> {
    router_com_banco_inalcancavel()
        .await
        .oneshot(request)
        .await
        .expect("resposta")
}

pub async fn corpo_em_texto(response: Response<Body>) -> String {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("corpo")
        .to_bytes();

    String::from_utf8_lossy(&bytes).to_string()
}

pub fn get(path: &str) -> Request<Body> {
    Request::builder()
        .uri(path)
        .body(Body::empty())
        .expect("requisição")
}
