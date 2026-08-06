use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncConnection, AsyncPgConnection, RunQueryDsl};
use serde_json::Value;
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::{template_versions, templates};

use super::dto::PublicTemplateResponse;
use super::entity::{NewTemplate, NewTemplateVersion, Template, TemplateVersion};

pub async fn create_template(
    conn: &mut AsyncPgConnection,
    new_template: &NewTemplate,
) -> Result<Template, ApiError> {
    diesel::insert_into(templates::table)
        .values(new_template)
        .returning(Template::as_returning())
        .get_result(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn get_template(
    conn: &mut AsyncPgConnection,
    template_id: Uuid,
) -> Result<Template, ApiError> {
    templates::table
        .find(template_id)
        .select(Template::as_select())
        .get_result(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_personal_templates(
    conn: &mut AsyncPgConnection,
    owner: Uuid,
) -> Result<Vec<Template>, ApiError> {
    templates::table
        .filter(templates::user_id.eq(owner))
        .order(templates::updated_at.desc())
        .select(Template::as_select())
        .load(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_team_templates(
    conn: &mut AsyncPgConnection,
    param_team_id: Uuid,
) -> Result<Vec<Template>, ApiError> {
    templates::table
        .filter(templates::team_id.eq(param_team_id))
        .order(templates::updated_at.desc())
        .select(Template::as_select())
        .load(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn update_template_visibility(
    conn: &mut AsyncPgConnection,
    template_id: Uuid,
    is_public: bool,
) -> Result<Template, ApiError> {
    diesel::update(templates::table.find(template_id))
        .set((
            templates::is_public.eq(is_public),
            templates::updated_at.eq(Utc::now()),
        ))
        .returning(Template::as_returning())
        .get_result(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn delete_template(
    conn: &mut AsyncPgConnection,
    template_id: Uuid,
) -> Result<(), ApiError> {
    diesel::delete(templates::table.find(template_id))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(ApiError::from)
}

pub async fn publish_version(
    conn: &mut AsyncPgConnection,
    template_id: Uuid,
    named_sources: Value,
    note: Option<String>,
) -> Result<TemplateVersion, ApiError> {
    let result = conn
        .transaction::<_, diesel::result::Error, _>(|conn| {
            Box::pin(async move {
                let next: i32 = diesel::update(templates::table.find(template_id))
                    .set((
                        templates::latest_version.eq(templates::latest_version + 1),
                        templates::updated_at.eq(Utc::now()),
                    ))
                    .returning(templates::latest_version)
                    .get_result(conn)
                    .await?;

                diesel::insert_into(template_versions::table)
                    .values(NewTemplateVersion {
                        template_id,
                        version: next,
                        named_sources,
                        note,
                    })
                    .returning(TemplateVersion::as_returning())
                    .get_result(conn)
                    .await
            })
        })
        .await;

    result.map_err(ApiError::from)
}

pub async fn get_version(
    conn: &mut AsyncPgConnection,
    template_id: Uuid,
    param_version: i32,
) -> Result<Option<TemplateVersion>, ApiError> {
    template_versions::table
        .filter(template_versions::template_id.eq(template_id))
        .filter(template_versions::version.eq(param_version))
        .select(TemplateVersion::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(ApiError::from)
}

pub async fn get_latest_version(
    conn: &mut AsyncPgConnection,
    template_id: Uuid,
) -> Result<Option<TemplateVersion>, ApiError> {
    template_versions::table
        .filter(template_versions::template_id.eq(template_id))
        .order(template_versions::version.desc())
        .select(TemplateVersion::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(ApiError::from)
}

pub async fn list_public_templates(
    conn: &mut AsyncPgConnection,
    param_kind: Option<&str>,
    q: Option<&str>,
) -> Result<Vec<PublicTemplateResponse>, ApiError> {
    use crate::schema::teams;
    use crate::schema::users;

    let mut query = templates::table
        .left_join(users::table.on(templates::user_id.eq(users::id.nullable())))
        .left_join(teams::table.on(templates::team_id.eq(teams::id.nullable())))
        .filter(templates::is_public.eq(true))
        .filter(templates::latest_version.gt(0))
        .into_boxed();

    if let Some(kind) = param_kind {
        query = query.filter(templates::kind.eq(kind.to_string()));
    }

    if let Some(term) = q {
        let pattern = format!("%{}%", term);
        query = query.filter(templates::name.ilike(pattern));
    }

    let rows = query
        .order(templates::updated_at.desc())
        .select((
            templates::id,
            templates::kind,
            templates::name,
            users::name.nullable(),
            teams::name.nullable(),
            templates::latest_version,
            templates::updated_at,
        ))
        .load::<(
            Uuid,
            String,
            String,
            Option<String>,
            Option<String>,
            i32,
            DateTime<Utc>,
        )>(conn)
        .await
        .map_err(ApiError::from)?;

    Ok(rows
        .into_iter()
        .map(
            |(id, kind, name, user_name, team_name, latest_version, updated_at)| {
                let owner_name = team_name
                    .or(user_name)
                    .unwrap_or_else(|| "Desconhecido".to_string());
                PublicTemplateResponse {
                    id,
                    kind,
                    name,
                    owner_name,
                    latest_version,
                    updated_at,
                }
            },
        )
        .collect())
}
