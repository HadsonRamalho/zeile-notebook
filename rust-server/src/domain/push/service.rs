use std::sync::Arc;

use serde::Serialize;
use serde_json::json;
use uuid::Uuid;
use web_push::{
    ContentEncoding, HyperWebPushClient, SubscriptionInfo, SubscriptionKeys, VapidSignatureBuilder,
    WebPushClient, WebPushError, WebPushMessageBuilder,
};

use crate::controllers::utils::{get_conn, get_var_from_env};
use crate::models::state::{AppState, PushState};

use super::repository;

pub fn load_push_state() -> Option<PushState> {
    let subject = get_var_from_env("VAPID_SUBJECT").ok()?;

    let vapid_builder = if let Ok(private_key) = get_var_from_env("VAPID_PRIVATE_KEY") {
        VapidSignatureBuilder::from_base64_no_sub(private_key.trim())
            .map_err(|e| tracing::warn!("Invalid VAPID_PRIVATE_KEY: {:?}", e))
            .ok()?
    } else {
        let key_path = get_var_from_env("VAPID_PRIVATE_KEY_PATH").ok()?;
        let pem = std::fs::read(&key_path)
            .map_err(|e| {
                tracing::warn!(
                    "Could not read VAPID_PRIVATE_KEY_PATH ({}): {}",
                    key_path,
                    e
                );
            })
            .ok()?;
        VapidSignatureBuilder::from_pem_no_sub(pem.as_slice())
            .map_err(|e| tracing::warn!("Invalid VAPID key (PEM): {:?}", e))
            .ok()?
    };

    tracing::info!("Web Push configured (VAPID loaded successfully)");

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

    let subscriptions =
        match repository::get_push_subscriptions_for_user(&mut conn, target_user_id).await {
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
            repository::delete_push_subscription(&mut conn, &subscription.endpoint)
                .await
                .ok();
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
