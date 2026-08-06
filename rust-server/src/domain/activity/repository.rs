use chrono::{Duration, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::notebook_activity;

use super::entity::{Activity, NewActivity};

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
            .map_err(ApiError::from)?;

        if let Some(existing) = recent {
            diesel::update(notebook_activity::table.find(existing))
                .set(notebook_activity::created_at.eq(Utc::now()))
                .execute(conn)
                .await
                .map_err(ApiError::from)?;
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
        .map_err(ApiError::from)?;

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
        .map_err(ApiError::from)
}
