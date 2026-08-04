use crate::models::error::ApiError;
use crate::schema::notifications;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::Serialize;
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::notifications)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: Uuid,
    pub user_id: Uuid,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
    pub notebook_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Default, Clone)]
#[diesel(table_name = notifications)]
pub struct NewNotification {
    pub id: Uuid,
    pub user_id: Uuid,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub url: Option<String>,
    pub notebook_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
}

const NOTIFICATION_LIMIT: i64 = 100;

pub async fn create_notification(
    conn: &mut AsyncPgConnection,
    new_notification: &NewNotification,
) -> Result<Notification, ApiError> {
    diesel::insert_into(notifications::table)
        .values(new_notification)
        .get_result::<Notification>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_for_user(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
) -> Result<Vec<Notification>, ApiError> {
    notifications::table
        .filter(notifications::user_id.eq(param_user_id))
        .order(notifications::created_at.desc())
        .limit(NOTIFICATION_LIMIT)
        .load::<Notification>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn unread_count(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
) -> Result<i64, ApiError> {
    notifications::table
        .filter(notifications::user_id.eq(param_user_id))
        .filter(notifications::read_at.is_null())
        .count()
        .get_result(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn mark_read(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
    notification_id: Uuid,
) -> Result<(), ApiError> {
    diesel::update(
        notifications::table
            .filter(notifications::id.eq(notification_id))
            .filter(notifications::user_id.eq(param_user_id)),
    )
    .set(notifications::read_at.eq(Some(Utc::now())))
    .execute(conn)
    .await
    .map(|_| ())
    .map_err(ApiError::from)
}

pub async fn mark_all_read(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
) -> Result<(), ApiError> {
    diesel::update(
        notifications::table
            .filter(notifications::user_id.eq(param_user_id))
            .filter(notifications::read_at.is_null()),
    )
    .set(notifications::read_at.eq(Some(Utc::now())))
    .execute(conn)
    .await
    .map(|_| ())
    .map_err(ApiError::from)
}

pub async fn delete_notification(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
    notification_id: Uuid,
) -> Result<(), ApiError> {
    diesel::delete(
        notifications::table
            .filter(notifications::id.eq(notification_id))
            .filter(notifications::user_id.eq(param_user_id)),
    )
    .execute(conn)
    .await
    .map(|_| ())
    .map_err(ApiError::from)
}
