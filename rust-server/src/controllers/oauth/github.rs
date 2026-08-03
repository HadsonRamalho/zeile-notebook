use reqwest::Client as ReqwestClient;
use tracing::error;

use crate::{
    controllers::oauth::provider::{OAuthError, OAuthIdentity},
    models::oauth::{GithubEmail, GithubUser},
};

const USER_AGENT: &str = "rust-notebook-app";

pub async fn identidade(
    http_client: &ReqwestClient,
    access_token: &str,
) -> Result<OAuthIdentity, OAuthError> {
    let response = http_client
        .get("https://api.github.com/user")
        .header("User-Agent", USER_AGENT)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| {
            error!("falha ao chamar a API do GitHub: {e}");
            OAuthError::RequestFailed
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        error!("Erro na API do GitHub: Status: {} | Body: {}", status, text);

        return Err(OAuthError::ResponseError);
    }

    let user = response.json::<GithubUser>().await.map_err(|e| {
        error!("Erro ao decodificar JSON: {:?}", e);
        OAuthError::DecodeError
    })?;

    let email = match user.email.clone() {
        Some(email) => email,
        None => email_primario(http_client, access_token).await?,
    };

    Ok(OAuthIdentity {
        external_id: user.id.to_string(),
        name: user.login,
        email,
        email_verified: true,
        avatar_url: Some(user.avatar_url),
    })
}

async fn email_primario(
    http_client: &ReqwestClient,
    access_token: &str,
) -> Result<String, OAuthError> {
    let emails: Vec<GithubEmail> = http_client
        .get("https://api.github.com/user/emails")
        .header("User-Agent", USER_AGENT)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| {
            error!("falha ao listar e-mails do GitHub: {e}");
            OAuthError::RequestFailed
        })?
        .json()
        .await
        .map_err(|e| {
            error!("falha ao decodificar e-mails do GitHub: {e}");
            OAuthError::EmailNotFound
        })?;

    emails
        .into_iter()
        .find(|email| email.primary && email.verified)
        .map(|email| email.email)
        .ok_or(OAuthError::EmailNotFound)
}
