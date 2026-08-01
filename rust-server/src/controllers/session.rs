//! validação de sessão contra o banco: um token assinado prova quem emitiu,
//! não que a conta ainda existe, ainda está ativa ou não teve a senha trocada.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use dashmap::DashMap;
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::deadpool::Pool;
use hyper::StatusCode;
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::models::jwt::Claims;
use crate::models::state::AppState;
use crate::models::user::UserRole;

/// Janela em que uma sessão já validada é aceita sem voltar ao banco. Sem isso,
/// toda requisição autenticada tomaria uma conexão do pool. Cinco segundos é o
/// atraso máximo para uma desativação passar a valer — contra os sete dias de
/// validade do token, que era o estado anterior.
const TTL_CACHE: Duration = Duration::from_secs(5);

#[derive(Clone, Copy)]
pub struct SessaoValida {
    pub role: UserRole,
}

struct Entrada {
    role: UserRole,
    visto_em: Instant,
}

#[derive(Default)]
pub struct CacheDeSessao {
    entradas: DashMap<(Uuid, i64), Entrada>,
}

impl CacheDeSessao {
    pub fn new() -> Self {
        Self::default()
    }

    fn buscar(&self, user_id: Uuid, iat: i64, agora: Instant) -> Option<UserRole> {
        let entrada = self.entradas.get(&(user_id, iat))?;

        if agora.saturating_duration_since(entrada.visto_em) >= TTL_CACHE {
            return None;
        }

        Some(entrada.role)
    }

    fn guardar(&self, user_id: Uuid, iat: i64, role: UserRole, agora: Instant) {
        if self.entradas.len() > 50_000 {
            self.entradas
                .retain(|_, e| agora.saturating_duration_since(e.visto_em) < TTL_CACHE);
        }

        self.entradas.insert(
            (user_id, iat),
            Entrada {
                role,
                visto_em: agora,
            },
        );
    }

    pub fn invalidar(&self, user_id: Uuid) {
        self.entradas.retain(|(id, _), _| *id != user_id);
    }
}

/// Confere a conta no banco. O papel devolvido é o do banco, não o do token:
/// um admin rebaixado mantinha privilégio até o token expirar.
pub async fn validar_no_banco(
    conn: &mut AsyncPgConnection,
    claims: &Claims,
) -> Result<SessaoValida, ApiError> {
    let user = crate::models::user::find_user_by_id(conn, &claims.id)
        .await
        .map_err(|_| ApiError::InvalidAuthorizationToken)?;

    if !user.is_active || user.deleted_at.is_some() {
        return Err(ApiError::NotActiveUser);
    }

    if sessao_revogada(claims, user.password_changed_at) {
        return Err(ApiError::InvalidAuthorizationToken);
    }

    Ok(SessaoValida { role: user.role })
}

/// Token emitido antes da última troca de senha não vale mais. Token antigo sem
/// `iat` não pode ser datado, então sobrevive até expirar — o alcance disso
/// termina quando os tokens emitidos antes desta versão caducam.
pub fn sessao_revogada(claims: &Claims, password_changed_at: chrono::DateTime<chrono::Utc>) -> bool {
    claims
        .iat
        .is_some_and(|iat| iat < password_changed_at.timestamp())
}

pub async fn validar_sessao(
    pool: &Pool<AsyncPgConnection>,
    cache: &CacheDeSessao,
    claims: &Claims,
) -> Result<SessaoValida, ApiError> {
    let agora = Instant::now();
    let iat = claims.iat.unwrap_or(0);

    if let Some(role) = cache.buscar(claims.id, iat, agora) {
        return Ok(SessaoValida { role });
    }

    let mut conn = crate::controllers::utils::get_conn(pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    let sessao = validar_no_banco(&mut conn, claims).await?;

    cache.guardar(claims.id, iat, sessao.role, agora);

    Ok(sessao)
}

/// Recusa um token que decodifica mas cuja conta não existe mais, está inativa
/// ou teve a senha trocada. Requisição sem token, ou com token que nem
/// decodifica, segue em frente: a rota decide se aceita anônimo.
pub async fn enforce_session(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Response {
    let Ok((_, claims)) =
        crate::controllers::jwt::extract_claims_from_header(request.headers()).await
    else {
        return next.run(request).await;
    };

    match validar_sessao(&state.pool, &state.sessoes, &claims).await {
        Ok(_) => next.run(request).await,
        Err(e) => {
            tracing::warn!("sessão recusada para {}: {e}", claims.id);
            (StatusCode::UNAUTHORIZED, axum::Json(e.to_string())).into_response()
        }
    }
}

/// Papel vindo do banco, para decisão de autorização. `claims.role` é uma foto
/// do momento da emissão e não acompanha rebaixamento.
pub async fn papel_no_banco(
    conn: &mut AsyncPgConnection,
    user_id: &Uuid,
) -> Result<UserRole, ApiError> {
    let user = crate::models::user::find_user_by_id(conn, user_id).await?;

    Ok(user.role)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims_com_iat(iat: Option<i64>) -> Claims {
        Claims {
            id: Uuid::new_v4(),
            public_id: 1234567,
            role: UserRole::Admin,
            email: "pessoa@exemplo.test".to_string(),
            exp: (chrono::Utc::now().timestamp() + 3600) as usize,
            iat,
        }
    }

    #[test]
    fn token_emitido_antes_da_troca_de_senha_esta_revogado() {
        let claims = claims_com_iat(Some(chrono::Utc::now().timestamp()));
        let trocou_depois = chrono::Utc::now() + chrono::Duration::seconds(60);

        assert!(sessao_revogada(&claims, trocou_depois));
    }

    #[test]
    fn token_emitido_depois_da_troca_continua_valendo() {
        let claims = claims_com_iat(Some(chrono::Utc::now().timestamp()));
        let trocou_antes = chrono::Utc::now() - chrono::Duration::days(2);

        assert!(!sessao_revogada(&claims, trocou_antes));
    }

    #[test]
    fn token_antigo_sem_iat_nao_pode_ser_datado() {
        let claims = claims_com_iat(None);

        assert!(
            !sessao_revogada(&claims, chrono::Utc::now()),
            "sem iat não há como datar; o token sobrevive até expirar"
        );
    }

    #[test]
    fn o_cache_responde_dentro_da_janela_e_expira_depois() {
        let cache = CacheDeSessao::new();
        let user = Uuid::new_v4();
        let agora = Instant::now();

        assert!(cache.buscar(user, 10, agora).is_none(), "cache começa vazio");

        cache.guardar(user, 10, UserRole::User, agora);

        assert_eq!(cache.buscar(user, 10, agora), Some(UserRole::User));
        assert_eq!(
            cache.buscar(user, 10, agora + TTL_CACHE - Duration::from_millis(1)),
            Some(UserRole::User)
        );
        assert!(
            cache.buscar(user, 10, agora + TTL_CACHE).is_none(),
            "passada a janela, precisa voltar ao banco"
        );
    }

    #[test]
    fn o_cache_separa_emissoes_diferentes_do_mesmo_usuario() {
        let cache = CacheDeSessao::new();
        let user = Uuid::new_v4();
        let agora = Instant::now();

        cache.guardar(user, 100, UserRole::Admin, agora);

        assert_eq!(cache.buscar(user, 100, agora), Some(UserRole::Admin));
        assert!(
            cache.buscar(user, 200, agora).is_none(),
            "token reemitido não pode herdar a validação do anterior"
        );
    }

    #[test]
    fn invalidar_derruba_todas_as_emissoes_do_usuario() {
        let cache = CacheDeSessao::new();
        let user = Uuid::new_v4();
        let outro = Uuid::new_v4();
        let agora = Instant::now();

        cache.guardar(user, 1, UserRole::User, agora);
        cache.guardar(user, 2, UserRole::User, agora);
        cache.guardar(outro, 1, UserRole::User, agora);

        cache.invalidar(user);

        assert!(cache.buscar(user, 1, agora).is_none());
        assert!(cache.buscar(user, 2, agora).is_none());
        assert_eq!(
            cache.buscar(outro, 1, agora),
            Some(UserRole::User),
            "invalidar um usuário não pode derrubar outro"
        );
    }
}
