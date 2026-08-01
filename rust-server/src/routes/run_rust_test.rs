use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use tower::ServiceExt;

use crate::middleware::rate_limit::JUDGE;
use crate::routes::test_support::{corpo_em_texto, responder, router_com_banco_inalcancavel};

const ROTAS: [&str; 4] = ["/api/run", "/api/run/go", "/api/run/cpp", "/api/run/zig"];

fn submissao(path: &str, peer: &str) -> Request<Body> {
    let peer: std::net::SocketAddr = peer.parse().expect("endereço do peer");

    Request::builder()
        .method("POST")
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .extension(axum::extract::ConnectInfo(peer))
        .body(Body::from(br#"{"code":"fn main(){}"}"#.to_vec()))
        .expect("requisição")
}

#[tokio::test]
async fn a_sessao_e_derivada_do_usuario_e_do_notebook() {
    let user = uuid::Uuid::new_v4();
    let notebook = uuid::Uuid::new_v4();

    let sessao = crate::http::sessao_de_execucao(user, notebook);

    assert!(
        sessao.chars().all(|c| c.is_alphanumeric() || c == '_'),
        "sessão precisa ser segura como nome de diretório: {sessao}"
    );
    assert_eq!(
        sessao,
        crate::http::sessao_de_execucao(user, notebook),
        "a sessão precisa ser estável para o módulo Rust persistir entre requisições"
    );
    assert_ne!(
        sessao,
        crate::http::sessao_de_execucao(user, uuid::Uuid::new_v4()),
        "notebooks diferentes não podem compartilhar workspace"
    );
    assert_ne!(
        sessao,
        crate::http::sessao_de_execucao(uuid::Uuid::new_v4(), notebook),
        "usuários diferentes não podem compartilhar workspace"
    );
}

#[tokio::test]
async fn a_sessao_nunca_colide_com_o_workspace_do_juiz() {
    let sessao = crate::http::sessao_de_execucao(uuid::Uuid::new_v4(), uuid::Uuid::new_v4());

    for prefixo in ["judge_ref_", "judge_sub_", "run_"] {
        assert!(
            !sessao.starts_with(prefixo),
            "a sessão de /api/run invadiu o espaço do juiz ({prefixo}): {sessao}"
        );
    }
}

#[tokio::test]
async fn execucao_anonima_e_recusada_em_todas_as_linguagens() {
    for rota in ROTAS {
        let response = responder(submissao(rota, "10.0.0.1:5000")).await;
        let corpo = corpo_em_texto(response).await;

        assert!(
            corpo.contains("autenticado"),
            "{rota} aceitou execução anônima: {corpo}"
        );
    }
}

#[tokio::test]
async fn execucao_sem_notebook_e_recusada() {
    let peer: std::net::SocketAddr = "10.0.0.2:5000".parse().expect("peer");

    let request = Request::builder()
        .method("POST")
        .uri("/api/run")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, "Bearer token-invalido")
        .extension(axum::extract::ConnectInfo(peer))
        .body(Body::from(br#"{"code":"fn main(){}"}"#.to_vec()))
        .expect("requisição");

    let corpo = corpo_em_texto(responder(request).await).await;

    assert!(
        corpo.contains("autenticado") || corpo.contains("notebook"),
        "execução sem notebook não foi barrada: {corpo}"
    );
}

#[tokio::test]
async fn as_rotas_de_execucao_tem_rate_limit() {
    let router = router_com_banco_inalcancavel().await;
    let peer = "10.0.0.3:5000";

    for _ in 0..JUDGE.max {
        let response = router
            .clone()
            .oneshot(submissao("/api/run/go", peer))
            .await
            .expect("resposta");

        assert_ne!(
            response.status(),
            StatusCode::TOO_MANY_REQUESTS,
            "o rate limit disparou antes do teto de {} requisições",
            JUDGE.max
        );
    }

    let excedente = router
        .oneshot(submissao("/api/run/go", peer))
        .await
        .expect("resposta");

    assert_eq!(excedente.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn o_rate_limit_de_execucao_e_por_linguagem_e_por_origem() {
    let router = router_com_banco_inalcancavel().await;

    for _ in 0..JUDGE.max {
        let _ = router
            .clone()
            .oneshot(submissao("/api/run/cpp", "10.0.0.4:5000"))
            .await
            .expect("resposta");
    }

    let outra_origem = router
        .clone()
        .oneshot(submissao("/api/run/cpp", "10.0.0.5:5000"))
        .await
        .expect("resposta");

    assert_ne!(
        outra_origem.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "o limite de uma origem vazou para outra"
    );

    let outra_rota = router
        .oneshot(submissao("/api/run/zig", "10.0.0.4:5000"))
        .await
        .expect("resposta");

    assert_ne!(
        outra_rota.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "o limite de uma linguagem vazou para outra"
    );
}
