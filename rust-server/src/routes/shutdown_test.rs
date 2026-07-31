use axum::http::StatusCode;
use tower::ServiceExt;

use crate::controllers::shutdown::{TOKEN_HEADER, TOKEN_VAR};
use crate::routes::test_support::{post_de, router_e_estado};

const TOKEN: &str = "3f6b1e2c-0000-4000-8000-abcdefabcdef";

static ENV_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct TokenDeSessao(Option<String>);

impl TokenDeSessao {
    fn definido(valor: Option<&str>) -> Self {
        let anterior = std::env::var(TOKEN_VAR).ok();
        unsafe {
            match valor {
                Some(v) => std::env::set_var(TOKEN_VAR, v),
                None => std::env::remove_var(TOKEN_VAR),
            }
        }
        Self(anterior)
    }
}

impl Drop for TokenDeSessao {
    fn drop(&mut self) {
        unsafe {
            match self.0.take() {
                Some(v) => std::env::set_var(TOKEN_VAR, v),
                None => std::env::remove_var(TOKEN_VAR),
            }
        }
    }
}

async fn tentativa(
    token_do_processo: Option<&str>,
    peer: &str,
    headers: &[(&str, &str)],
) -> (StatusCode, bool) {
    let _guard = ENV_LOCK.lock().await;
    let _token = TokenDeSessao::definido(token_do_processo);

    let (router, state) = router_e_estado().await;

    let response = router
        .oneshot(post_de("/internal/shutdown", peer, headers))
        .await
        .expect("resposta");

    (response.status(), state.shutdown.is_triggered())
}

#[tokio::test]
async fn sem_token_no_processo_a_rota_nao_existe() {
    let (status, disparou) = tentativa(None, "127.0.0.1:52000", &[(TOKEN_HEADER, TOKEN)]).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(!disparou);
}

#[tokio::test]
async fn chamada_de_fora_do_loopback_nao_derruba_o_servidor() {
    let (status, disparou) =
        tentativa(Some(TOKEN), "192.168.0.10:52000", &[(TOKEN_HEADER, TOKEN)]).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(!disparou);
}

#[tokio::test]
async fn loopback_sem_o_token_e_recusado() {
    let (status, disparou) = tentativa(Some(TOKEN), "127.0.0.1:52000", &[]).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(!disparou);
}

#[tokio::test]
async fn loopback_com_token_errado_e_recusado() {
    let (status, disparou) = tentativa(
        Some(TOKEN),
        "127.0.0.1:52000",
        &[(TOKEN_HEADER, "3f6b1e2c-0000-4000-8000-abcdefabcdee")],
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(!disparou);
}

#[tokio::test]
async fn loopback_com_o_token_correto_inicia_o_encerramento() {
    let (status, disparou) =
        tentativa(Some(TOKEN), "127.0.0.1:52000", &[(TOKEN_HEADER, TOKEN)]).await;

    assert_eq!(status, StatusCode::ACCEPTED);
    assert!(disparou);
}

#[tokio::test]
async fn a_rota_fica_fora_do_prefixo_api() {
    let (status, _) = tentativa(Some(TOKEN), "127.0.0.1:52000", &[(TOKEN_HEADER, TOKEN)]).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    let _guard = ENV_LOCK.lock().await;
    let _token = TokenDeSessao::definido(Some(TOKEN));
    let (router, _) = router_e_estado().await;

    let response = router
        .oneshot(post_de(
            "/api/internal/shutdown",
            "127.0.0.1:52000",
            &[(TOKEN_HEADER, TOKEN)],
        ))
        .await
        .expect("resposta");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
