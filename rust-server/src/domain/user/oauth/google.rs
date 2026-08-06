use reqwest::Client as ReqwestClient;
use tracing::error;

use super::entity::GoogleUser;
use super::provider::{OAuthError, OAuthIdentity};

const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";

pub async fn identity(
    http_client: &ReqwestClient,
    access_token: &str,
) -> Result<OAuthIdentity, OAuthError> {
    let response = http_client
        .get(USERINFO_URL)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| {
            error!("failed to call Google userinfo: {e}");
            OAuthError::RequestFailed
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        error!("Google API error: Status: {} | Body: {}", status, text);

        return Err(OAuthError::ResponseError);
    }

    let user = response.json::<GoogleUser>().await.map_err(|e| {
        error!("failed to decode Google userinfo: {e:?}");
        OAuthError::DecodeError
    })?;

    let email = user.email.ok_or(OAuthError::EmailNotFound)?;
    let name = user
        .name
        .or_else(|| email.split('@').next().map(str::to_string))
        .unwrap_or_else(|| email.clone());

    Ok(OAuthIdentity {
        external_id: user.sub,
        name,
        email,
        email_verified: user.email_verified.unwrap_or(false),
        avatar_url: user.picture,
    })
}
