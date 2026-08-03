use axum::http::StatusCode;

use crate::routes::test_support::{get, responder};

async fn destino(path: &str) -> (StatusCode, String) {
    let response = responder(get(path)).await;
    let status = response.status();
    let location = response
        .headers()
        .get("location")
        .map(|valor| valor.to_str().unwrap_or_default().to_string())
        .unwrap_or_default();

    (status, location)
}

#[tokio::test]
async fn as_rotas_do_github_continuam_no_mesmo_caminho() {
    for path in [
        "/api/user/login/github",
        "/api/user/link/github",
        "/api/user/link/github/callback?code=x&state=y",
        "/api/user/auth/callback/github?code=x&state=y",
    ] {
        let (status, _) = destino(path).await;

        assert_ne!(
            status,
            StatusCode::NOT_FOUND,
            "callback registrado no GitHub App deixaria de existir: {path}"
        );
    }
}

#[tokio::test]
async fn provider_desconhecido_volta_para_o_login_com_erro() {
    let (status, location) = destino("/api/user/login/gitlab").await;

    assert_eq!(status, StatusCode::SEE_OTHER);
    assert!(
        location.contains("auth_error=unknown_provider"),
        "destino inesperado: {location}"
    );
}

#[tokio::test]
async fn callback_de_provider_desconhecido_nao_chega_no_banco() {
    let (status, location) = destino("/api/user/auth/callback/gitlab?code=x&state=y").await;

    assert_eq!(status, StatusCode::SEE_OTHER);
    assert!(
        location.contains("auth_error=unknown_provider"),
        "destino inesperado: {location}"
    );
}
