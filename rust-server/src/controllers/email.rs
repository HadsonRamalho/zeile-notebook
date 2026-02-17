use hyper::StatusCode;
use lettre::{
    Address, Message, SmtpTransport, Transport,
    message::{Mailbox, header::ContentType},
    transport::smtp::authentication::{Credentials, Mechanism},
};
use std::str::FromStr;

use crate::{
    controllers::utils::get_email_credentials,
    models::{error::ApiError, user::User},
};

pub async fn send_email(transport: &SmtpTransport, email: &Message) -> Result<(), ApiError> {
    match transport.send(&email) {
        Ok(_) => Ok(()),
        Err(_) => Err(ApiError::InvalidData),
    }
}

pub fn get_smtp_data(credentials: (String, String)) -> SmtpTransport {
    let smtp_username = credentials.0;
    let smtp_password = credentials.1;

    let smtp_server = "smtp.gmail.com";
    let smtp_credentials = Credentials::new(smtp_username.to_string(), smtp_password.to_string());

    let smtp_transport = SmtpTransport::starttls_relay(&smtp_server)
        .unwrap()
        .credentials(smtp_credentials)
        .authentication(vec![Mechanism::Plain])
        .build();

    smtp_transport
}

pub async fn send_team_invitation_email(
    user: &User,
    magic_link: &str,
    team_name: &str,
    invited_by: &str,
) -> Result<StatusCode, ApiError> {
    let credentials = match get_email_credentials() {
        Ok(credentials) => credentials,
        Err(_) => return Err(ApiError::SendingEmail),
    };

    let from_email = credentials.0.clone();

    let smtp_transport = get_smtp_data(credentials);

    let email = Message::builder()
        .from(Mailbox { name: Some("Zeile Notebook".to_string()), email: Address::from_str(&from_email).unwrap() })
        .to(Mailbox::from_str(&user.email).unwrap())
        .subject(format!("Zeile Notebook | Convite para Equipe {}", team_name))
        .header(ContentType::parse("text/html").unwrap())
        .body(format!(
            r#"
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <style>
                    body {{
                        font-family: 'Inter', Arial, sans-serif;
                        margin: 0;
                        padding: 20px;
                        background-color: #f4f4f5;
                        color: #27272a;
                    }}
                    .wrapper {{
                        max-width: 600px;
                        margin: 0 auto;
                    }}
                    .container {{
                        padding: 32px;
                        border: 1px solid #e4e4e7;
                        border-radius: 8px;
                        background-color: #ffffff;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    }}
                    .logo {{
                        font-size: 20px;
                        font-weight: 800;
                        color: #10b981;
                        margin-bottom: 24px;
                        text-align: center;
                    }}
                    .header {{
                        font-size: 22px;
                        font-weight: 600;
                        color: #18181b;
                        margin-bottom: 16px;
                        text-align: center;
                    }}
                    .content {{
                        font-size: 15px;
                        line-height: 1.6;
                        color: #3f3f46;
                        margin-bottom: 24px;
                    }}
                    .highlight {{
                        font-weight: 600;
                        color: #18181b;
                    }}
                    .button-container {{
                        text-align: center;
                        margin: 32px 0;
                    }}
                    .button {{
                        background-color: #10b981;
                        color: #ffffff !important;
                        padding: 12px 24px;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: 600;
                        display: inline-block;
                        transition: background-color 0.2s;
                    }}
                    .button:hover {{
                        background-color: #059669;
                    }}
                    .footer {{
                        font-size: 13px;
                        color: #71717a;
                        text-align: center;
                        margin-top: 32px;
                        border-top: 1px solid #e4e4e7;
                        padding-top: 16px;
                    }}
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="container">
                        <div class="logo">Zeile Notebook</div>

                        <div class="header">Você foi convidado!</div>

                        <div class="content">
                            Olá, <span class="highlight">{nome}</span>.
                            <br><br>
                            Você foi convidado por <span class="highlight">{nome_remetente}</span> para se juntar à equipe <strong>{nome_time}</strong> no Zeile Notebook.
                            <br><br>
                            Ao entrar nesta equipe, você poderá colaborar em tempo real, compartilhar anotações e visualizar projetos junto com os outros membros.
                        </div>

                        <div class="button-container">
                            <a href="{link}" class="button">Aceitar Convite</a>
                        </div>

                        <div class="content" style="font-size: 14px;">
                            Se o botão acima não funcionar, copie e cole a URL abaixo no seu navegador:
                            <br>
                            <a href="{link}" style="color: #10b981; word-break: break-all;">{link}</a>
                            <br><br>
                            Se você não conhece {nome_remetente} ou não esperava este convite, pode ignorar este e-mail com segurança.
                        </div>

                        <div class="footer">
                            &copy; 2026 Zeile Notebook. Todos os direitos reservados.
                        </div>
                    </div>
                </div>
            </body>
            </html>
        "#,
        nome = &user.name,
        link = magic_link,
        nome_time = team_name,
        nome_remetente = invited_by
    ))
    .unwrap();

    match smtp_transport.send(&email) {
        Ok(_) => Ok(StatusCode::OK),
        Err(_) => Err(ApiError::SendingEmail),
    }
}
