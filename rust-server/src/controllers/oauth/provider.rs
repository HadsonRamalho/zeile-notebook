use crate::{controllers::utils::get_var_from_env, models::user::AuthProvider};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Github,
    Google,
}

impl Provider {
    pub const ALL: &'static [Provider] = &[Provider::Github, Provider::Google];

    pub fn slug(self) -> &'static str {
        match self {
            Provider::Github => "github",
            Provider::Google => "google",
        }
    }

    pub fn from_slug(slug: &str) -> Option<Self> {
        Provider::ALL
            .iter()
            .copied()
            .find(|provider| provider.slug() == slug)
    }

    pub fn auth_provider(self) -> AuthProvider {
        match self {
            Provider::Github => AuthProvider::Github,
            Provider::Google => AuthProvider::Google,
        }
    }

    pub fn auth_url(self) -> &'static str {
        match self {
            Provider::Github => "https://github.com/login/oauth/authorize",
            Provider::Google => "https://accounts.google.com/o/oauth2/v2/auth",
        }
    }

    pub fn token_url(self) -> &'static str {
        match self {
            Provider::Github => "https://github.com/login/oauth/access_token",
            Provider::Google => "https://oauth2.googleapis.com/token",
        }
    }

    pub fn scopes(self) -> &'static [&'static str] {
        match self {
            Provider::Github => &["read:user", "user:email"],
            Provider::Google => &["openid", "email", "profile"],
        }
    }

    pub fn client_id_var(self) -> &'static str {
        match self {
            Provider::Github => "GITHUB_CLIENT_ID",
            Provider::Google => "GOOGLE_CLIENT_ID",
        }
    }

    pub fn client_secret_var(self) -> &'static str {
        match self {
            Provider::Github => "GITHUB_CLIENT_SECRET",
            Provider::Google => "GOOGLE_CLIENT_SECRET",
        }
    }

    pub fn is_configured(self) -> bool {
        ["API_URL", self.client_id_var(), self.client_secret_var()]
            .iter()
            .all(|key| get_var_from_env(key).is_ok())
    }

    pub fn configured() -> Vec<Provider> {
        Provider::ALL
            .iter()
            .copied()
            .filter(|provider| provider.is_configured())
            .collect()
    }
}

pub struct OAuthIdentity {
    pub external_id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OAuthError {
    UnknownProvider,
    Unavailable,
    TokenExchange,
    RequestFailed,
    ResponseError,
    DecodeError,
    EmailNotFound,
    EmailNotVerified,
    InvalidState,
    Session,
}

impl OAuthError {
    pub fn code(self, provider: Option<Provider>) -> String {
        let slug = provider.map(Provider::slug).unwrap_or("oauth");

        match self {
            OAuthError::UnknownProvider => "unknown_provider".to_string(),
            OAuthError::Unavailable => "oauth_unavailable".to_string(),
            OAuthError::TokenExchange => "token_failed".to_string(),
            OAuthError::Session => "token".to_string(),
            OAuthError::InvalidState => "invalid_state".to_string(),
            OAuthError::EmailNotVerified => format!("{slug}_email_not_verified"),
            OAuthError::RequestFailed => format!("{slug}_response_failed"),
            OAuthError::ResponseError => format!("{slug}_response_error"),
            OAuthError::DecodeError => format!("{slug}_data_error"),
            OAuthError::EmailNotFound => format!("{slug}_emails_not_found"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_round_trip() {
        for provider in Provider::ALL {
            assert_eq!(Provider::from_slug(provider.slug()), Some(*provider));
        }
    }

    #[test]
    fn unknown_slug_does_not_resolve() {
        assert_eq!(Provider::from_slug("gitlab"), None);
        assert_eq!(Provider::from_slug(""), None);
    }

    #[test]
    fn github_error_codes_are_the_ones_the_front_already_translates() {
        let github = Some(Provider::Github);

        assert_eq!(OAuthError::TokenExchange.code(github), "token_failed");
        assert_eq!(
            OAuthError::RequestFailed.code(github),
            "github_response_failed"
        );
        assert_eq!(
            OAuthError::ResponseError.code(github),
            "github_response_error"
        );
        assert_eq!(OAuthError::DecodeError.code(github), "github_data_error");
        assert_eq!(
            OAuthError::EmailNotFound.code(github),
            "github_emails_not_found"
        );
        assert_eq!(OAuthError::Unavailable.code(github), "oauth_unavailable");
        assert_eq!(OAuthError::Session.code(github), "token");
    }

    #[test]
    fn google_has_its_own_code_for_unverified_email() {
        let google = Some(Provider::Google);

        assert_eq!(
            OAuthError::EmailNotVerified.code(google),
            "google_email_not_verified"
        );
        assert_eq!(
            OAuthError::RequestFailed.code(google),
            "google_response_failed"
        );
        assert_eq!(OAuthError::InvalidState.code(google), "invalid_state");
    }

    #[test]
    fn google_requests_the_minimum_scope() {
        assert_eq!(Provider::Google.scopes(), &["openid", "email", "profile"]);
    }

    #[test]
    fn error_without_a_provider_does_not_leak_an_empty_slug() {
        assert_eq!(
            OAuthError::RequestFailed.code(None),
            "oauth_response_failed"
        );
        assert_eq!(OAuthError::UnknownProvider.code(None), "unknown_provider");
    }
}
