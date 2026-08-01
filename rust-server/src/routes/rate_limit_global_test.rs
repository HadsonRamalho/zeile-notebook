use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use tower::ServiceExt;

use crate::middleware::rate_limit::{
    DESLIGA_VAR, GLOBAL_ORIGEM, caminho_livre, limite_global_desligado,
};
use crate::routes::test_support::router_com_banco_inalcancavel;

fn anonima(path: &str, peer: &str) -> Request<Body> {
    let peer: std::net::SocketAddr = peer.parse().expect("endereço do peer");

    Request::builder()
        .method("GET")
        .uri(path)
        .extension(axum::extract::ConnectInfo(peer))
        .body(Body::empty())
        .expect("requisição")
}

#[test]
fn a_saude_do_servico_nao_entra_na_cota() {
    for livre in ["/health/live", "/health/ready", "/internal/shutdown"] {
        assert!(caminho_livre(livre), "{livre} deveria ficar fora da cota");
    }

    assert!(!caminho_livre("/api/notebook/create"));
}

#[test]
fn o_teto_global_pode_ser_desligado_para_carga() {
    unsafe { std::env::set_var(DESLIGA_VAR, "1") };
    assert!(limite_global_desligado());

    unsafe { std::env::set_var(DESLIGA_VAR, "off") };
    assert!(!limite_global_desligado());

    unsafe { std::env::remove_var(DESLIGA_VAR) };
    assert!(!limite_global_desligado());
}

#[tokio::test]
async fn trafego_anonimo_tem_teto_por_origem() {
    let router = router_com_banco_inalcancavel().await;
    let peer = "203.0.113.10:5000";

    for i in 0..GLOBAL_ORIGEM.max {
        let response = router
            .clone()
            .oneshot(anonima("/api/common", peer))
            .await
            .expect("resposta");

        assert_ne!(
            response.status(),
            StatusCode::TOO_MANY_REQUESTS,
            "cortou na requisição {i}, antes do teto de {}",
            GLOBAL_ORIGEM.max
        );
    }

    let excedente = router
        .oneshot(anonima("/api/common", peer))
        .await
        .expect("resposta");

    assert_eq!(excedente.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn a_saude_continua_respondendo_depois_do_teto() {
    let router = router_com_banco_inalcancavel().await;
    let peer = "203.0.113.11:5000";

    for _ in 0..GLOBAL_ORIGEM.max + 5 {
        let _ = router
            .clone()
            .oneshot(anonima("/api/common", peer))
            .await
            .expect("resposta");
    }

    let saude = router
        .oneshot(anonima("/health/live", peer))
        .await
        .expect("resposta");

    assert_ne!(
        saude.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "o health check foi barrado pela cota; o orquestrador mataria o pod"
    );
}

#[tokio::test]
async fn uma_origem_esgotada_nao_afeta_outra() {
    let router = router_com_banco_inalcancavel().await;

    for _ in 0..GLOBAL_ORIGEM.max + 5 {
        let _ = router
            .clone()
            .oneshot(anonima("/api/common", "203.0.113.12:5000"))
            .await
            .expect("resposta");
    }

    let outra = router
        .oneshot(anonima("/api/common", "203.0.113.13:5000"))
        .await
        .expect("resposta");

    assert_ne!(outra.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn cadastro_em_massa_e_barrado() {
    let router = router_com_banco_inalcancavel().await;
    let peer: std::net::SocketAddr = "203.0.113.20:5000".parse().expect("peer");

    let cadastro = || {
        Request::builder()
            .method("POST")
            .uri("/api/user/register")
            .header(header::CONTENT_TYPE, "application/json")
            .extension(axum::extract::ConnectInfo(peer))
            .body(Body::from(br#"{}"#.to_vec()))
            .expect("requisição")
    };

    let mut limitou = false;

    for _ in 0..crate::middleware::rate_limit::REGISTER.max + 3 {
        let response = router.clone().oneshot(cadastro()).await.expect("resposta");

        if response.status() == StatusCode::TOO_MANY_REQUESTS {
            limitou = true;
            break;
        }
    }

    assert!(limitou, "/register aceitou cadastro em massa sem cota");
}
