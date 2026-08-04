use chrono::NaiveDateTime;
use diesel::{ExpressionMethods, QueryDsl, prelude::{Identifiable, Insertable, Queryable, Selectable}};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::push_subscriptions;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone)]
#[diesel(table_name = crate::schema::push_subscriptions)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscription {
    pub id: Uuid,
    pub user_id: Uuid,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub created_at: NaiveDateTime,
}

#[derive(Insertable)]
#[diesel(table_name = push_subscriptions)]
pub struct NewPushSubscription {
    pub id: Uuid,
    pub user_id: Uuid,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

#[derive(Deserialize)]
pub struct PushSubscriptionKeysRequest {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Deserialize)]
pub struct PushSubscriptionRequest {
    pub endpoint: String,
    pub keys: PushSubscriptionKeysRequest,
}

#[derive(Deserialize)]
pub struct PushUnsubscribeRequest {
    pub endpoint: String,
}

pub async fn upsert_push_subscription(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
    request: &PushSubscriptionRequest,
) -> Result<(), ApiError> {
    use crate::schema::push_subscriptions::dsl::*;

    let new_subscription = NewPushSubscription {
        id: Uuid::new_v4(),
        user_id: param_user_id,
        endpoint: request.endpoint.clone(),
        p256dh: request.keys.p256dh.clone(),
        auth: request.keys.auth.clone(),
    };

    diesel::insert_into(push_subscriptions)
        .values(&new_subscription)
        .on_conflict(endpoint)
        .do_update()
        .set((
            user_id.eq(param_user_id),
            p256dh.eq(request.keys.p256dh.clone()),
            auth.eq(request.keys.auth.clone()),
        ))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok(())
}

pub async fn delete_push_subscription(
    conn: &mut AsyncPgConnection,
    param_endpoint: &str,
) -> Result<(), ApiError> {
    use crate::schema::push_subscriptions::dsl::*;

    diesel::delete(push_subscriptions.filter(endpoint.eq(param_endpoint)))
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok(())
}

pub async fn get_push_subscriptions_for_user(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
) -> Result<Vec<PushSubscription>, ApiError> {
    use crate::schema::push_subscriptions::dsl::*;

    push_subscriptions
        .filter(user_id.eq(param_user_id))
        .load::<PushSubscription>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}
