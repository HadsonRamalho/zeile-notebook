use crate::models::error::ApiError;
use crate::schema::notebook_activity;
use chrono::{DateTime, Duration, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::Serialize;
use uuid::Uuid;

#[derive(Queryable, Selectable, Serialize, Debug, Clone)]
#[diesel(table_name = crate::schema::notebook_activity)]
pub struct Activity {
    pub id: Uuid,
    #[serde(rename = "notebookId")]
    pub notebook_id: Uuid,
    #[serde(rename = "actorId")]
    pub actor_id: Option<Uuid>,
    #[serde(rename = "actorName")]
    pub actor_name: String,
    pub kind: String,
    #[serde(rename = "blockId")]
    pub block_id: Option<String>,
    pub summary: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = notebook_activity)]
pub struct NewActivity {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub actor_id: Option<Uuid>,
    pub actor_name: String,
    pub kind: String,
    pub block_id: Option<String>,
    pub summary: Option<String>,
}

pub async fn record_activity(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
    actor_id: Option<Uuid>,
    actor_name: &str,
    kind: &str,
    block_id: Option<String>,
    summary: Option<String>,
) -> Result<(), ApiError> {
    if kind == "edit" {
        let since = Utc::now() - Duration::minutes(2);
        let recent: Option<Uuid> = notebook_activity::table
            .filter(notebook_activity::notebook_id.eq(notebook_id))
            .filter(notebook_activity::kind.eq("edit"))
            .filter(notebook_activity::actor_id.eq(actor_id))
            .filter(notebook_activity::created_at.gt(since))
            .order(notebook_activity::created_at.desc())
            .select(notebook_activity::id)
            .first::<Uuid>(conn)
            .await
            .optional()
            .map_err(|e| ApiError::Database(e.to_string()))?;

        if let Some(existing) = recent {
            diesel::update(notebook_activity::table.find(existing))
                .set(notebook_activity::created_at.eq(Utc::now()))
                .execute(conn)
                .await
                .map_err(|e| ApiError::Database(e.to_string()))?;
            return Ok(());
        }
    }

    diesel::insert_into(notebook_activity::table)
        .values(&NewActivity {
            id: Uuid::new_v4(),
            notebook_id,
            actor_id,
            actor_name: actor_name.to_string(),
            kind: kind.to_string(),
            block_id,
            summary,
        })
        .execute(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    Ok(())
}

pub async fn list_activity(
    conn: &mut AsyncPgConnection,
    notebook_id_param: Uuid,
    limit: i64,
) -> Result<Vec<Activity>, ApiError> {
    notebook_activity::table
        .filter(notebook_activity::notebook_id.eq(notebook_id_param))
        .order(notebook_activity::created_at.desc())
        .limit(limit)
        .select(Activity::as_select())
        .load::<Activity>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}
