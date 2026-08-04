use chrono::{DateTime, NaiveDateTime, Utc};
use diesel::{
    BoolExpressionMethods, ExpressionMethods, PgTextExpressionMethods, QueryDsl,
    dsl::sql,
    sql_types::{BigInt, Text},
};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::error::ApiError;

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page: i64,
    pub limit: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Serialize)]
pub struct AdminChartData {
    pub name: String,
    pub users: i64,
    pub notebooks: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSystemStats {
    pub total_users: i64,
    pub total_active_users: i64,
    pub total_notebooks: i64,
    pub total_public_notebooks: i64,
    pub total_teams: i64,
    pub total_team_members: i64,
    pub chart_data: Vec<AdminChartData>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUserView {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub primary_provider: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminTeamView {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: NaiveDateTime,
    pub member_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminNotebookView {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub title: String,
    pub is_public: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct AdminSearchResult {
    pub id: Uuid,
    pub label: String,
    pub sublabel: Option<String>,
}

pub async fn search_users(
    conn: &mut AsyncPgConnection,
    query: &str,
) -> Result<Vec<AdminSearchResult>, ApiError> {
    use crate::schema::users::dsl::*;
    let pattern = format!("%{}%", query);
    users
        .filter(name.ilike(&pattern).or(email.ilike(&pattern)))
        .select((id, name, email))
        .order(name.asc())
        .limit(20)
        .load::<(Uuid, String, String)>(conn)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|(uid, uname, uemail)| AdminSearchResult {
                    id: uid,
                    label: uname,
                    sublabel: Some(uemail),
                })
                .collect()
        })
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn search_teams(
    conn: &mut AsyncPgConnection,
    query: &str,
) -> Result<Vec<AdminSearchResult>, ApiError> {
    use crate::schema::teams::dsl::*;
    let pattern = format!("%{}%", query);
    teams
        .filter(name.ilike(&pattern))
        .select((id, name, description))
        .order(name.asc())
        .limit(20)
        .load::<(Uuid, String, Option<String>)>(conn)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|(tid, tname, tdesc)| AdminSearchResult {
                    id: tid,
                    label: tname,
                    sublabel: tdesc,
                })
                .collect()
        })
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn search_notebooks(
    conn: &mut AsyncPgConnection,
    query: &str,
) -> Result<Vec<AdminSearchResult>, ApiError> {
    use crate::schema::notebooks::dsl::*;
    let pattern = format!("%{}%", query);
    notebooks
        .filter(title.ilike(&pattern))
        .select((id, title))
        .order(updated_at.desc())
        .limit(20)
        .load::<(Uuid, String)>(conn)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|(nid, ntitle)| AdminSearchResult {
                    id: nid,
                    label: ntitle,
                    sublabel: None,
                })
                .collect()
        })
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn get_detailed_system_stats(
    conn: &mut AsyncPgConnection,
) -> Result<AdminSystemStats, ApiError> {
    use crate::schema::{
        notebooks::dsl as n, team_members::dsl as tm, teams::dsl as t, users::dsl as u,
    };

    let total_users: i64 = u::users
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let total_active_users: i64 = u::users
        .filter(u::is_active.eq(true))
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let total_notebooks: i64 = n::notebooks
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let total_public: i64 = n::notebooks
        .filter(n::is_public.eq(true))
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let total_teams: i64 = t::teams
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let total_team_members: i64 = tm::team_members
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let chart_query = sql::<(Text, BigInt, BigInt)>(
        "
            SELECT
                TO_CHAR(date_trunc('month', d), 'Mon') as month_name,
                COALESCE(u_count, 0) as user_count,
                COALESCE(n_count, 0) as notebook_count
            FROM generate_series(
                date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                date_trunc('month', CURRENT_DATE),
                '1 month'::interval
            ) d
            LEFT JOIN (
                SELECT date_trunc('month', created_at) as m, count(*) as u_count
                FROM users
                GROUP BY 1
            ) u ON u.m = d
            LEFT JOIN (
                SELECT date_trunc('month', created_at) as m, count(*) as n_count
                FROM notebooks
                GROUP BY 1
            ) n ON n.m = d
            ORDER BY d
            ",
    );

    let chart_results = chart_query
        .load::<(String, i64, i64)>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let chart_data = chart_results
        .into_iter()
        .map(|(name, users, notebooks)| AdminChartData {
            name,
            users,
            notebooks,
        })
        .collect();

    Ok(AdminSystemStats {
        total_users,
        total_active_users,
        total_notebooks,
        total_public_notebooks: total_public,
        total_teams,
        total_team_members,
        chart_data,
    })
}

pub async fn get_paginated_users(
    conn: &mut AsyncPgConnection,
    page: i64,
    limit: i64,
) -> Result<PaginatedResponse<AdminUserView>, ApiError> {
    use crate::schema::users::dsl::*;

    let offset = (page - 1) * limit;

    let total: i64 = users
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let results = users
        .select((
            id,
            name,
            email,
            primary_provider,
            is_active,
            created_at,
            updated_at,
        ))
        .order(created_at.desc())
        .limit(limit)
        .offset(offset)
        .load::<(
            uuid::Uuid,
            String,
            String,
            crate::models::user::AuthProvider,
            bool,
            chrono::DateTime<chrono::Utc>,
            chrono::DateTime<chrono::Utc>,
        )>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let data = results
        .into_iter()
        .map(
            |(u_id, u_name, u_email, u_provider, u_is_active, u_created, u_updated)| {
                AdminUserView {
                    id: u_id,
                    name: u_name,
                    email: u_email,
                    primary_provider: format!("{:?}", u_provider),
                    is_active: u_is_active,
                    created_at: u_created,
                    updated_at: u_updated,
                }
            },
        )
        .collect();

    let total_pages = (total as f64 / limit as f64).ceil() as i64;

    Ok(PaginatedResponse {
        data,
        total,
        page,
        limit,
        total_pages,
    })
}

pub async fn get_paginated_teams(
    conn: &mut AsyncPgConnection,
    page: i64,
    limit: i64,
) -> Result<PaginatedResponse<AdminTeamView>, ApiError> {
    use crate::schema::team_members::dsl as tm;
    use crate::schema::teams::dsl as t;

    let offset = (page - 1) * limit;

    let total: i64 = t::teams
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let results = t::teams
        .select((t::id, t::name, t::description, t::created_at))
        .order(t::created_at.desc())
        .limit(limit)
        .offset(offset)
        .load::<(uuid::Uuid, String, Option<String>, NaiveDateTime)>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let mut data = Vec::new();

    for (t_id, t_name, t_desc, t_created) in results {
        let member_count: i64 = tm::team_members
            .filter(tm::team_id.eq(t_id))
            .count()
            .get_result(conn)
            .await
            .unwrap_or(0);

        data.push(AdminTeamView {
            id: t_id,
            name: t_name,
            description: t_desc,
            created_at: t_created,
            member_count,
        });
    }

    let total_pages = (total as f64 / limit as f64).ceil() as i64;

    Ok(PaginatedResponse {
        data,
        total,
        page,
        limit,
        total_pages,
    })
}

pub async fn get_paginated_notebooks(
    conn: &mut AsyncPgConnection,
    page: i64,
    limit: i64,
) -> Result<PaginatedResponse<AdminNotebookView>, ApiError> {
    use crate::schema::notebooks::dsl::*;

    let offset = (page - 1) * limit;

    let total: i64 = notebooks
        .count()
        .get_result(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let results = notebooks
        .select((
            id, user_id, team_id, title, is_public, created_at, updated_at,
        ))
        .order(created_at.desc())
        .limit(limit)
        .offset(offset)
        .load::<(
            uuid::Uuid,
            Option<uuid::Uuid>,
            Option<uuid::Uuid>,
            String,
            bool,
            chrono::DateTime<chrono::Utc>,
            chrono::DateTime<chrono::Utc>,
        )>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let data = results
        .into_iter()
        .map(
            |(n_id, n_user_id, n_team_id, n_title, n_is_public, n_created, n_updated)| {
                AdminNotebookView {
                    id: n_id,
                    user_id: n_user_id,
                    team_id: n_team_id,
                    title: n_title,
                    is_public: n_is_public,
                    created_at: n_created,
                    updated_at: n_updated,
                }
            },
        )
        .collect();

    let total_pages = (total as f64 / limit as f64).ceil() as i64;

    Ok(PaginatedResponse {
        data,
        total,
        page,
        limit,
        total_pages,
    })
}
