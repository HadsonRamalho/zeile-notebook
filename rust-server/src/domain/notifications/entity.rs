use chrono::{DateTime, Utc};
use diesel::prelude::*;
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
#[diesel(table_name = crate::schema::notifications)]
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

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::notification_preferences)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPreference {
    pub id: Uuid,
    pub user_id: Uuid,
    pub scope_kind: String,
    pub scope_id: Option<Uuid>,
    pub push_enabled: bool,
    pub inapp_enabled: bool,
    pub chat_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct EffectivePrefs {
    pub push: bool,
    pub inapp: bool,
    pub chat: bool,
}

impl Default for EffectivePrefs {
    fn default() -> Self {
        Self {
            push: true,
            inapp: true,
            chat: true,
        }
    }
}
