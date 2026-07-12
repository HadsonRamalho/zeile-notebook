use crate::models::error::ApiError;
use crate::schema::notification_preferences;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::Serialize;
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, Clone)]
#[diesel(table_name = crate::schema::notification_preferences)]
pub struct NotificationPreference {
    pub id: Uuid,
    #[serde(rename = "userId")]
    pub user_id: Uuid,
    #[serde(rename = "scopeKind")]
    pub scope_kind: String,
    #[serde(rename = "scopeId")]
    pub scope_id: Option<Uuid>,
    #[serde(rename = "pushEnabled")]
    pub push_enabled: bool,
    #[serde(rename = "inappEnabled")]
    pub inapp_enabled: bool,
    #[serde(rename = "chatEnabled")]
    pub chat_enabled: bool,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
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

async fn find_pref(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
    param_scope_kind: &str,
    param_scope_id: Option<Uuid>,
) -> Result<Option<NotificationPreference>, ApiError> {
    let mut query = notification_preferences::table
        .filter(notification_preferences::user_id.eq(param_user_id))
        .filter(notification_preferences::scope_kind.eq(param_scope_kind))
        .into_boxed();
    query = match param_scope_id {
        Some(sid) => query.filter(notification_preferences::scope_id.eq(sid)),
        None => query.filter(notification_preferences::scope_id.is_null()),
    };
    query
        .first::<NotificationPreference>(conn)
        .await
        .optional()
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_for_user(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
) -> Result<Vec<NotificationPreference>, ApiError> {
    notification_preferences::table
        .filter(notification_preferences::user_id.eq(param_user_id))
        .order(notification_preferences::created_at.asc())
        .load::<NotificationPreference>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn upsert_preference(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
    param_scope_kind: &str,
    param_scope_id: Option<Uuid>,
    push: bool,
    inapp: bool,
    chat: bool,
) -> Result<NotificationPreference, ApiError> {
    if let Some(existing) = find_pref(conn, param_user_id, param_scope_kind, param_scope_id).await? {
        diesel::update(notification_preferences::table.find(existing.id))
            .set((
                notification_preferences::push_enabled.eq(push),
                notification_preferences::inapp_enabled.eq(inapp),
                notification_preferences::chat_enabled.eq(chat),
                notification_preferences::updated_at.eq(Utc::now()),
            ))
            .get_result::<NotificationPreference>(conn)
            .await
            .map_err(|e| ApiError::Database(e.to_string()))
    } else {
        diesel::insert_into(notification_preferences::table)
            .values((
                notification_preferences::id.eq(Uuid::new_v4()),
                notification_preferences::user_id.eq(param_user_id),
                notification_preferences::scope_kind.eq(param_scope_kind),
                notification_preferences::scope_id.eq(param_scope_id),
                notification_preferences::push_enabled.eq(push),
                notification_preferences::inapp_enabled.eq(inapp),
                notification_preferences::chat_enabled.eq(chat),
            ))
            .get_result::<NotificationPreference>(conn)
            .await
            .map_err(|e| ApiError::Database(e.to_string()))
    }
}

/// Resolve as preferências efetivas: a preferência do escopo específico (notebook
/// ou time) vence; senão a global; senão o padrão (tudo habilitado).
pub async fn resolve(
    conn: &mut AsyncPgConnection,
    param_user_id: Uuid,
    scope_kind: &str,
    scope_id: Option<Uuid>,
) -> EffectivePrefs {
    if scope_kind != "global" {
        if let Ok(Some(row)) = find_pref(conn, param_user_id, scope_kind, scope_id).await {
            return EffectivePrefs {
                push: row.push_enabled,
                inapp: row.inapp_enabled,
                chat: row.chat_enabled,
            };
        }
    }
    if let Ok(Some(row)) = find_pref(conn, param_user_id, "global", None).await {
        return EffectivePrefs {
            push: row.push_enabled,
            inapp: row.inapp_enabled,
            chat: row.chat_enabled,
        };
    }
    EffectivePrefs::default()
}
