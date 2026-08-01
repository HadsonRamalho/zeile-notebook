use crate::schema::team_invitations;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct InviteRequest {
    pub email: String,
    #[serde(rename = "roleId")]
    pub role_id: Uuid,
}

#[derive(Deserialize)]
pub struct AcceptInviteRequest {
    pub token: String,
}

#[derive(Queryable, Selectable, Insertable, Serialize, Deserialize, Debug)]
#[diesel(table_name = team_invitations)]
pub struct TeamInvitation {
    pub id: Uuid,
    pub team_id: Uuid,
    pub role_id: Uuid,
    pub email: String,
    pub token: String,
    pub expires_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable)]
#[diesel(table_name = team_invitations)]
pub struct NewTeamInvitation {
    pub team_id: Uuid,
    pub role_id: Uuid,
    pub email: String,
    pub token: String,
    pub expires_at: NaiveDateTime,
}

pub async fn create_invitation(
    conn: &mut AsyncPgConnection,
    data: &NewTeamInvitation,
) -> Result<TeamInvitation, String> {
    match diesel::insert_into(team_invitations::table)
        .values(data)
        .get_result(conn)
        .await
    {
        Ok(inv) => Ok(inv),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn find_invitation_by_token(
    conn: &mut AsyncPgConnection,
    token_param: &str,
) -> Result<TeamInvitation, String> {
    match team_invitations::table
        .filter(team_invitations::token.eq(token_param))
        .select(TeamInvitation::as_select())
        .first(conn)
        .await
    {
        Ok(inv) => Ok(inv),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn delete_invitation(
    conn: &mut AsyncPgConnection,
    id_param: Uuid,
) -> Result<(), String> {
    match diesel::delete(team_invitations::table.filter(team_invitations::id.eq(id_param)))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// O convite é endereçado a um e-mail. Sem esta comparação, qualquer conta
/// autenticada que obtenha o link entra no time com o papel concedido — e o
/// link circula por e-mail encaminhado, push e histórico do navegador.
pub fn email_corresponde(convidado: &str, usuario: &str) -> bool {
    convidado.trim().eq_ignore_ascii_case(usuario.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn o_mesmo_email_corresponde() {
        assert!(email_corresponde("pessoa@exemplo.test", "pessoa@exemplo.test"));
    }

    #[test]
    fn a_caixa_e_o_espaco_nao_impedem_a_correspondencia() {
        assert!(email_corresponde("Pessoa@Exemplo.Test", "pessoa@exemplo.test"));
        assert!(email_corresponde("  pessoa@exemplo.test  ", "pessoa@exemplo.test"));
        assert!(email_corresponde("pessoa@exemplo.test", " PESSOA@exemplo.TEST "));
    }

    #[test]
    fn email_diferente_nao_corresponde() {
        assert!(!email_corresponde("convidado@exemplo.test", "intruso@exemplo.test"));
    }

    #[test]
    fn um_prefixo_nao_passa_por_correspondencia() {
        assert!(!email_corresponde("pessoa@exemplo.test", "pessoa@exemplo.test.br"));
        assert!(!email_corresponde("pessoa@exemplo.test", "pessoa"));
        assert!(!email_corresponde("", "pessoa@exemplo.test"));
    }
}

/// Fluxo de aceite contra Postgres real. Sem TEST_MIGRATION_DATABASE_URL o
/// teste é pulado, como os demais que pedem banco.
#[cfg(test)]
mod tests_com_banco {
    use super::*;
    use diesel_async::AsyncConnection;

    async fn conexao() -> Option<AsyncPgConnection> {
        let url = std::env::var("TEST_MIGRATION_DATABASE_URL").ok()?;
        AsyncPgConnection::establish(&url).await.ok()
    }

    /// Time e papel reais: as chaves estrangeiras recusam UUID solto.
    async fn time_com_papel(conn: &mut AsyncPgConnection) -> (Uuid, Uuid) {
        let team_id = Uuid::new_v4();
        let role_id = Uuid::new_v4();

        diesel::sql_query(format!(
            "INSERT INTO teams (id, name) VALUES ('{team_id}', 'Time de teste')"
        ))
        .execute(conn)
        .await
        .expect("criar time");

        diesel::sql_query(format!(
            "INSERT INTO team_roles (id, team_id, name) VALUES ('{role_id}', '{team_id}', 'Membro')"
        ))
        .execute(conn)
        .await
        .expect("criar papel");

        (team_id, role_id)
    }

    async fn convite(conn: &mut AsyncPgConnection, email: &str, dias: i64) -> TeamInvitation {
        let (team_id, role_id) = time_com_papel(conn).await;

        let dados = NewTeamInvitation {
            team_id,
            role_id,
            email: email.to_string(),
            token: Uuid::new_v4().to_string(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(dias)).naive_utc(),
        };

        create_invitation(conn, &dados)
            .await
            .expect("criar convite")
    }

    #[tokio::test]
    async fn encontrar_nao_consome_o_convite() {
        let Some(mut conn) = conexao().await else {
            eprintln!("TEST_MIGRATION_DATABASE_URL ausente; teste pulado");
            return;
        };

        let criado = convite(&mut conn, "convidado@exemplo.test", 7).await;

        let primeiro = find_invitation_by_token(&mut conn, &criado.token)
            .await
            .expect("primeira busca");
        let segundo = find_invitation_by_token(&mut conn, &criado.token)
            .await
            .expect("o convite precisa sobreviver a uma busca");

        assert_eq!(primeiro.id, segundo.id);
        assert_eq!(segundo.email, "convidado@exemplo.test");
    }

    #[tokio::test]
    async fn deletar_consome_o_convite() {
        let Some(mut conn) = conexao().await else {
            return;
        };

        let criado = convite(&mut conn, "convidado@exemplo.test", 7).await;

        delete_invitation(&mut conn, criado.id)
            .await
            .expect("deletar");

        assert!(
            find_invitation_by_token(&mut conn, &criado.token)
                .await
                .is_err(),
            "convite consumido não pode ser reutilizado"
        );
    }

    #[tokio::test]
    async fn token_desconhecido_nao_encontra_convite() {
        let Some(mut conn) = conexao().await else {
            return;
        };

        assert!(
            find_invitation_by_token(&mut conn, &Uuid::new_v4().to_string())
                .await
                .is_err()
        );
    }
}
