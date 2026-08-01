//! refresh tokens persistidos. O token em si nunca é gravado: guardamos o
//! SHA-256 dele, para que um dump do banco não vire uma pilha de sessões vivas.

use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use rand::RngCore;
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::refresh_tokens;
use crate::schema::refresh_tokens::dsl;

pub const VALIDADE_DIAS: i64 = 30;

const BYTES_DO_TOKEN: usize = 32;

#[derive(Debug, Queryable, Selectable, Identifiable)]
#[diesel(table_name = refresh_tokens)]
pub struct RefreshToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub replaced_by: Option<Uuid>,
}

#[derive(Insertable)]
#[diesel(table_name = refresh_tokens)]
struct NovoRefreshToken {
    id: Uuid,
    user_id: Uuid,
    token_hash: String,
    expires_at: DateTime<Utc>,
}

impl RefreshToken {
    pub fn utilizavel(&self, agora: DateTime<Utc>) -> bool {
        self.revoked_at.is_none() && self.expires_at > agora
    }
}

/// Segredo opaco de 32 bytes. Não é JWT de propósito: quem valida precisa
/// consultar o banco, que é onde a revogação vive.
pub fn gerar_token() -> String {
    let mut bytes = [0u8; BYTES_DO_TOKEN];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn hash_do_token(token: &str) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub async fn emitir(
    conn: &mut AsyncPgConnection,
    user: Uuid,
) -> Result<(Uuid, String), ApiError> {
    let token = gerar_token();
    let id = Uuid::new_v4();

    let novo = NovoRefreshToken {
        id,
        user_id: user,
        token_hash: hash_do_token(&token),
        expires_at: Utc::now() + Duration::days(VALIDADE_DIAS),
    };

    diesel::insert_into(refresh_tokens::table)
        .values(&novo)
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok((id, token))
}

pub async fn buscar_por_token(
    conn: &mut AsyncPgConnection,
    token: &str,
) -> Result<RefreshToken, ApiError> {
    dsl::refresh_tokens
        .filter(dsl::token_hash.eq(hash_do_token(token)))
        .select(RefreshToken::as_select())
        .first(conn)
        .await
        .map_err(|_| ApiError::InvalidAuthorizationToken)
}

pub async fn revogar(conn: &mut AsyncPgConnection, id_token: Uuid) -> Result<(), ApiError> {
    diesel::update(dsl::refresh_tokens.filter(dsl::id.eq(id_token)))
        .set(dsl::revoked_at.eq(Utc::now()))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok(())
}

/// Rotação: o token usado é revogado e aponta para o que o substituiu, de modo
/// que reuso de um token já rotacionado seja detectável.
pub async fn rotacionar(
    conn: &mut AsyncPgConnection,
    anterior: &RefreshToken,
) -> Result<(Uuid, String), ApiError> {
    let (novo_id, token) = emitir(conn, anterior.user_id).await?;

    diesel::update(dsl::refresh_tokens.filter(dsl::id.eq(anterior.id)))
        .set((
            dsl::revoked_at.eq(Utc::now()),
            dsl::replaced_by.eq(Some(novo_id)),
        ))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok((novo_id, token))
}

pub async fn revogar_do_usuario(
    conn: &mut AsyncPgConnection,
    user: Uuid,
) -> Result<usize, ApiError> {
    diesel::update(
        dsl::refresh_tokens
            .filter(dsl::user_id.eq(user))
            .filter(dsl::revoked_at.is_null()),
    )
    .set(dsl::revoked_at.eq(Utc::now()))
    .execute(conn)
    .await
    .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn limpar_expirados(conn: &mut AsyncPgConnection) -> Result<usize, ApiError> {
    diesel::delete(dsl::refresh_tokens.filter(dsl::expires_at.lt(Utc::now())))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn o_token_tem_entropia_de_32_bytes_em_hex() {
        let token = gerar_token();

        assert_eq!(token.len(), BYTES_DO_TOKEN * 2);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn dois_tokens_nunca_saem_iguais() {
        let a = gerar_token();
        let b = gerar_token();

        assert_ne!(a, b);
    }

    #[test]
    fn o_hash_e_estavel_e_nao_devolve_o_token() {
        let token = gerar_token();
        let hash = hash_do_token(&token);

        assert_eq!(hash, hash_do_token(&token), "hash precisa ser determinístico");
        assert_ne!(hash, token, "o banco não pode guardar o segredo em claro");
        assert_eq!(hash.len(), 64);
        assert!(!hash.contains(&token[..8]));
    }

    fn token_de_teste(revoked_at: Option<DateTime<Utc>>, expira_em: Duration) -> RefreshToken {
        RefreshToken {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            token_hash: "hash".to_string(),
            expires_at: Utc::now() + expira_em,
            created_at: Utc::now(),
            revoked_at,
            replaced_by: None,
        }
    }

    #[test]
    fn token_valido_e_utilizavel() {
        let token = token_de_teste(None, Duration::days(1));

        assert!(token.utilizavel(Utc::now()));
    }

    #[test]
    fn token_revogado_nao_e_utilizavel() {
        let token = token_de_teste(Some(Utc::now()), Duration::days(1));

        assert!(!token.utilizavel(Utc::now()));
    }

    #[test]
    fn token_expirado_nao_e_utilizavel() {
        let token = token_de_teste(None, Duration::days(-1));

        assert!(!token.utilizavel(Utc::now()));
    }
}

/// Exercita rotação e detecção de reuso contra Postgres real. Sem
/// TEST_MIGRATION_DATABASE_URL o teste é pulado, como os demais que pedem banco.
#[cfg(test)]
mod tests_com_banco {
    use super::*;
    use diesel_async::AsyncConnection;

    async fn conexao() -> Option<AsyncPgConnection> {
        let url = std::env::var("TEST_MIGRATION_DATABASE_URL").ok()?;

        AsyncPgConnection::establish(&url).await.ok()
    }

    async fn usuario_de_teste(conn: &mut AsyncPgConnection) -> Uuid {
        let id = Uuid::new_v4();

        diesel::sql_query(format!(
            "INSERT INTO users (id, public_id, name, email, primary_provider, role, is_active) \
             VALUES ('{id}', {}, 'Teste', 'teste_{id}@exemplo.test', 'email', 'user', true)",
            rand::random::<u16>() as i32 + 1_000_000
        ))
        .execute(conn)
        .await
        .expect("inserir usuário de teste");

        id
    }

    #[tokio::test]
    async fn emitir_encontra_o_token_pelo_segredo() {
        let Some(mut conn) = conexao().await else {
            eprintln!("TEST_MIGRATION_DATABASE_URL ausente; teste pulado");
            return;
        };

        let user = usuario_de_teste(&mut conn).await;
        let (id, token) = emitir(&mut conn, user).await.expect("emitir");

        let encontrado = buscar_por_token(&mut conn, &token).await.expect("buscar");

        assert_eq!(encontrado.id, id);
        assert_eq!(encontrado.user_id, user);
        assert!(encontrado.utilizavel(Utc::now()));
        assert_ne!(
            encontrado.token_hash, token,
            "o banco guardou o segredo em claro"
        );
    }

    #[tokio::test]
    async fn rotacionar_revoga_o_anterior_e_aponta_o_substituto() {
        let Some(mut conn) = conexao().await else {
            return;
        };

        let user = usuario_de_teste(&mut conn).await;
        let (id_antigo, antigo) = emitir(&mut conn, user).await.expect("emitir");
        let atual = buscar_por_token(&mut conn, &antigo).await.expect("buscar");

        let (id_novo, novo) = rotacionar(&mut conn, &atual).await.expect("rotacionar");

        let gasto = buscar_por_token(&mut conn, &antigo).await.expect("buscar");

        assert!(!gasto.utilizavel(Utc::now()), "o anterior deveria estar gasto");
        assert_eq!(gasto.replaced_by, Some(id_novo));
        assert_ne!(id_antigo, id_novo);

        let vigente = buscar_por_token(&mut conn, &novo).await.expect("buscar");
        assert!(vigente.utilizavel(Utc::now()));
    }

    #[tokio::test]
    async fn revogar_do_usuario_derruba_todas_as_sessoes() {
        let Some(mut conn) = conexao().await else {
            return;
        };

        let user = usuario_de_teste(&mut conn).await;
        let (_, a) = emitir(&mut conn, user).await.expect("emitir a");
        let (_, b) = emitir(&mut conn, user).await.expect("emitir b");

        let outro = usuario_de_teste(&mut conn).await;
        let (_, alheio) = emitir(&mut conn, outro).await.expect("emitir alheio");

        let quantos = revogar_do_usuario(&mut conn, user).await.expect("revogar");

        assert_eq!(quantos, 2);
        assert!(!buscar_por_token(&mut conn, &a).await.unwrap().utilizavel(Utc::now()));
        assert!(!buscar_por_token(&mut conn, &b).await.unwrap().utilizavel(Utc::now()));
        assert!(
            buscar_por_token(&mut conn, &alheio)
                .await
                .unwrap()
                .utilizavel(Utc::now()),
            "revogar um usuário não pode derrubar sessão de outro"
        );
    }

    #[tokio::test]
    async fn token_desconhecido_nao_e_encontrado() {
        let Some(mut conn) = conexao().await else {
            return;
        };

        assert!(buscar_por_token(&mut conn, &gerar_token()).await.is_err());
    }
}
