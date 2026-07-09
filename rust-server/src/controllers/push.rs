use std::sync::Arc;

use axum::{Json, extract::State};
use hyper::{HeaderMap, StatusCode};
use serde::Serialize;
use serde_json::json;
use uuid::Uuid;
use web_push::{
    ContentEncoding, HyperWebPushClient, SubscriptionInfo, SubscriptionKeys,
    VapidSignatureBuilder, WebPushClient, WebPushError, WebPushMessageBuilder,
};

use crate::{
    controllers::{jwt::extract_claims_from_header, utils::get_conn, utils::get_var_from_env},
    models::{
        error::ApiError,
        push_subscription::{
            PushSubscriptionRequest, PushUnsubscribeRequest, delete_push_subscription,
            get_push_subscriptions_for_user, upsert_push_subscription,
        },
        state::{AppState, PushState},
    },
};

pub fn load_push_state() -> Option<PushState> {
    let subject = get_var_from_env("VAPID_SUBJECT").ok()?;

    let vapid_builder = if let Ok(private_key) = get_var_from_env("VAPID_PRIVATE_KEY") {
        VapidSignatureBuilder::from_base64_no_sub(private_key.trim())
            .map_err(|e| tracing::warn!("VAPID_PRIVATE_KEY inválida: {:?}", e))
            .ok()?
    } else {
        let key_path = get_var_from_env("VAPID_PRIVATE_KEY_PATH").ok()?;
        let pem = std::fs::read(&key_path)
            .map_err(|e| {
                tracing::warn!("Não foi possível ler VAPID_PRIVATE_KEY_PATH ({}): {}", key_path, e);
            })
            .ok()?;
        VapidSignatureBuilder::from_pem_no_sub(pem.as_slice())
            .map_err(|e| tracing::warn!("Chave VAPID (PEM) inválida: {:?}", e))
            .ok()?
    };

    tracing::info!("Web Push configurado (VAPID carregado com sucesso)");

    Some(PushState {
        client: HyperWebPushClient::new(),
        vapid_builder,
        subject,
    })
}

#[derive(Serialize)]
pub struct PushNotificationPayload<'a> {
    pub title: &'a str,
    pub body: &'a str,
    pub url: &'a str,
}

pub async fn send_push_to_user(
    state: &Arc<AppState>,
    target_user_id: Uuid,
    title: &str,
    body: &str,
    url: &str,
) {
    let Some(push) = &state.push else {
        return;
    };

    let mut conn = match get_conn(&state.pool).await {
        Ok(conn) => conn,
        Err(_) => return,
    };

    let subscriptions = match get_push_subscriptions_for_user(&mut conn, target_user_id).await {
        Ok(subs) => subs,
        Err(_) => return,
    };

    let payload = json!(PushNotificationPayload { title, body, url }).to_string();

    for subscription in subscriptions {
        let subscription_info = SubscriptionInfo {
            endpoint: subscription.endpoint.clone(),
            keys: SubscriptionKeys {
                p256dh: subscription.p256dh.clone(),
                auth: subscription.auth.clone(),
            },
        };

        let result = send_one(push, &subscription_info, &payload).await;

        if let Err(WebPushError::EndpointNotValid(_)) | Err(WebPushError::EndpointNotFound(_)) =
            result
        {
            let _ = delete_push_subscription(&mut conn, &subscription.endpoint).await;
        } else if let Err(e) = result {
            tracing::warn!("Falha ao enviar push: {:?}", e);
        }
    }
}

async fn send_one(
    push: &PushState,
    subscription_info: &SubscriptionInfo,
    payload: &str,
) -> Result<(), WebPushError> {
    let mut sig_builder = push.vapid_builder.clone().add_sub_info(subscription_info);
    sig_builder.add_claim("sub", push.subject.clone());
    let signature = sig_builder.build()?;

    let mut builder = WebPushMessageBuilder::new(subscription_info);
    builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
    builder.set_vapid_signature(signature);

    push.client.send(builder.build()?).await
}

#[utoipa::path(post, path = "/notebook/push/subscribe", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_subscribe_push(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<PushSubscriptionRequest>,
) -> Result<StatusCode, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    upsert_push_subscription(conn, user_id, &payload).await?;

    Ok(StatusCode::OK)
}

#[utoipa::path(delete, path = "/notebook/push/subscribe", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_unsubscribe_push(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<PushUnsubscribeRequest>,
) -> Result<StatusCode, ApiError> {
    extract_claims_from_header(&headers).await?;

    let conn = &mut get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;

    delete_push_subscription(conn, &payload.endpoint).await?;

    Ok(StatusCode::OK)
}
