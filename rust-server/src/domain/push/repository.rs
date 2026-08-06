use diesel::{ExpressionMethods, QueryDsl};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::models::error::ApiError;

use super::dto::PushSubscriptionRequest;
use super::entity::{NewPushSubscription, PushSubscription};

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
        .map_err(ApiError::from)?;

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
        .map_err(ApiError::from)?;

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
        .map_err(ApiError::from)
}
