use std::collections::{HashMap, HashSet};

use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::{permission_grants, team_roles};

use super::entity::{
    GrantEffect, GrantSubjectKind, GrantTargetKind, NewPermissionGrant, PermissionGrant,
};

pub async fn create_grant(
    conn: &mut AsyncPgConnection,
    grant: NewPermissionGrant,
) -> Result<PermissionGrant, ApiError> {
    diesel::insert_into(permission_grants::table)
        .values(&grant)
        .returning(PermissionGrant::as_returning())
        .get_result(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn delete_grant_in_team(
    conn: &mut AsyncPgConnection,
    grant_id: Uuid,
    team_id: Uuid,
) -> Result<usize, ApiError> {
    diesel::delete(
        permission_grants::table
            .filter(permission_grants::id.eq(grant_id))
            .filter(permission_grants::scope_team_id.eq(team_id)),
    )
    .execute(conn)
    .await
    .map_err(ApiError::from)
}

// chaves de grant `allow` de cada role, agrupadas por role
pub async fn grant_keys_by_role(
    conn: &mut AsyncPgConnection,
    role_ids: &[Uuid],
) -> Result<HashMap<Uuid, HashSet<String>>, ApiError> {
    if role_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let rows: Vec<(Option<Uuid>, String)> = permission_grants::table
        .filter(permission_grants::subject_kind.eq(GrantSubjectKind::Role))
        .filter(permission_grants::subject_id.eq_any(role_ids))
        .filter(permission_grants::effect.eq(GrantEffect::Allow))
        .select((
            permission_grants::subject_id,
            permission_grants::permission_key,
        ))
        .load(conn)
        .await
        .map_err(ApiError::from)?;

    let mut out: HashMap<Uuid, HashSet<String>> = HashMap::new();
    for (subject_id, key) in rows {
        if let Some(role_id) = subject_id {
            out.entry(role_id).or_default().insert(key);
        }
    }

    Ok(out)
}

// troca o conjunto de grants do role de uma vez, sem deixar estado intermediario visivel
pub async fn replace_team_role_grants(
    conn: &mut AsyncPgConnection,
    role_id: Uuid,
    team_id: Uuid,
    keys: &[&str],
) -> Result<(), ApiError> {
    let rows: Vec<NewPermissionGrant> = keys
        .iter()
        .map(|key| NewPermissionGrant {
            subject_kind: GrantSubjectKind::Role,
            subject_id: Some(role_id),
            subject_principal: None,
            scope_team_id: Some(team_id),
            permission_key: key.to_string(),
            target_kind: GrantTargetKind::Team,
            target_id: None,
            target_value: None,
            effect: GrantEffect::Allow,
        })
        .collect();

    conn.transaction::<_, diesel::result::Error, _>(|conn| {
        async move {
            diesel::delete(
                permission_grants::table
                    .filter(permission_grants::subject_kind.eq(GrantSubjectKind::Role))
                    .filter(permission_grants::subject_id.eq(role_id))
                    .filter(permission_grants::scope_team_id.eq(team_id)),
            )
            .execute(conn)
            .await?;

            if !rows.is_empty() {
                diesel::insert_into(permission_grants::table)
                    .values(&rows)
                    .execute(conn)
                    .await?;
            }

            Ok(())
        }
        .scope_boxed()
    })
    .await
    .map_err(ApiError::from)
}

pub async fn seed_team_role_grants(
    conn: &mut AsyncPgConnection,
    role_id: Uuid,
    team_id: Uuid,
    keys: &[&str],
) -> Result<(), ApiError> {
    if keys.is_empty() {
        return Ok(());
    }

    let rows: Vec<NewPermissionGrant> = keys
        .iter()
        .map(|key| NewPermissionGrant {
            subject_kind: GrantSubjectKind::Role,
            subject_id: Some(role_id),
            subject_principal: None,
            scope_team_id: Some(team_id),
            permission_key: key.to_string(),
            target_kind: GrantTargetKind::Team,
            target_id: None,
            target_value: None,
            effect: GrantEffect::Allow,
        })
        .collect();

    diesel::insert_into(permission_grants::table)
        .values(&rows)
        .execute(conn)
        .await
        .map_err(ApiError::from)?;

    Ok(())
}

pub async fn list_notebook_principal_grants(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
) -> Result<Vec<PermissionGrant>, ApiError> {
    permission_grants::table
        .filter(permission_grants::subject_kind.eq(GrantSubjectKind::Principal))
        .filter(permission_grants::subject_principal.eq("authenticated"))
        .filter(permission_grants::target_kind.eq(GrantTargetKind::Notebook))
        .filter(permission_grants::target_id.eq(notebook_id))
        .select(PermissionGrant::as_select())
        .load(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn delete_notebook_grant(
    conn: &mut AsyncPgConnection,
    grant_id: Uuid,
    notebook_id: Uuid,
) -> Result<usize, ApiError> {
    diesel::delete(
        permission_grants::table
            .filter(permission_grants::id.eq(grant_id))
            .filter(permission_grants::target_id.eq(notebook_id))
            .filter(permission_grants::subject_kind.eq(GrantSubjectKind::Principal)),
    )
    .execute(conn)
    .await
    .map_err(ApiError::from)
}

pub async fn find_team_grant(
    conn: &mut AsyncPgConnection,
    grant_id: Uuid,
    team_id: Uuid,
) -> Result<Option<PermissionGrant>, ApiError> {
    permission_grants::table
        .filter(permission_grants::id.eq(grant_id))
        .filter(permission_grants::scope_team_id.eq(team_id))
        .select(PermissionGrant::as_select())
        .first(conn)
        .await
        .optional()
        .map_err(ApiError::from)
}

pub async fn list_team_grants(
    conn: &mut AsyncPgConnection,
    team_id: Uuid,
) -> Result<Vec<PermissionGrant>, ApiError> {
    permission_grants::table
        .filter(permission_grants::scope_team_id.eq(team_id))
        .select(PermissionGrant::as_select())
        .load(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn role_belongs_to_team(
    conn: &mut AsyncPgConnection,
    role_id: Uuid,
    team_id: Uuid,
) -> bool {
    team_roles::table
        .filter(team_roles::id.eq(role_id))
        .filter(team_roles::team_id.eq(team_id))
        .select(team_roles::id)
        .first::<Uuid>(conn)
        .await
        .is_ok()
}
