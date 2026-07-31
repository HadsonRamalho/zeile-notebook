use axum::body::Body;
use axum::http::{Request, Response};
use http_body_util::BodyExt;
use tower::ServiceExt;

use crate::bootstrap;
use crate::routes::build_router;

static CRYPTO: std::sync::Once = std::sync::Once::new();

pub async fn router_e_estado() -> (axum::Router, std::sync::Arc<crate::models::state::AppState>) {
    CRYPTO.call_once(|| {
        bootstrap::install_crypto_provider().expect("provedor de criptografia");
    });

    let pool = bootstrap::build_pool(
        "postgres://usuario:senha@127.0.0.1:1/banco-que-nao-existe".to_string(),
    )
    .expect("pool é preguiçoso e deve ser construído sem conectar");

    let state = bootstrap::build_state(pool).expect("estado");

    (build_router(state.clone()).await, state)
}

pub async fn router_com_banco_inalcancavel() -> axum::Router {
    router_e_estado().await.0
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

/// a extensão `ConnectInfo` é o que `into_make_service_with_connect_info` injeta em
/// produção; sem ela o handler não enxerga o peer
pub fn post_de(path: &str, peer: &str, headers: &[(&str, &str)]) -> Request<Body> {
    let peer: std::net::SocketAddr = peer.parse().expect("endereço do peer");

    let mut builder = Request::builder()
        .method("POST")
        .uri(path)
        .extension(axum::extract::ConnectInfo(peer));

    for (nome, valor) in headers {
        builder = builder.header(*nome, *valor);
    }

    builder.body(Body::empty()).expect("requisição")
}
