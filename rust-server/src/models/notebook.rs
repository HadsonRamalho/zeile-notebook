use crate::{models::error::ApiError, schema::blocks::dsl as blocks_dsl};
use automerge::{AutoCommit, ObjType, ReadDoc, ROOT, ScalarValue, Value as AmValue};
use chrono::{DateTime, Utc};
use diesel::{
    BelongingToDsl, BoolExpressionMethods, ExpressionMethods, JoinOnDsl, NullableExpressionMethods,
    OptionalExtension, PgTextExpressionMethods, QueryDsl, Selectable, SelectableHelper,
    prelude::{Associations, Identifiable, Insertable, Queryable},
};
use diesel_async::{
    AsyncConnection, AsyncPgConnection, RunQueryDsl, pooled_connection::deadpool::Pool,
};
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::schema::{blocks, notebooks};

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::BlockTypeEnum"]
#[serde(rename_all = "lowercase")]
pub enum BlockType {
    Text,
    Code,
    Component,
    Drawing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize)]
#[ExistingTypePath = "crate::schema::sql_types::LanguageEnum"]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Rust,
    Typescript,
    Python,
    Zig,
    Go,
    Cpp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BlockMetadata {
    Callout {
        props: CalloutProps,
    },
    Card {
        props: CardProps,
    },
    GithubRepo {
        props: GithubRepoProps,
    },
    Banner {
        variant: String,
    },
    Generic {
        #[serde(flatten)]
        props: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalloutProps {
    pub title: Option<String>,
    pub icon: Option<String>,
    #[serde(rename = "type")]
    pub callout_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardProps {
    pub title: String,
    pub description: Option<String>,
    pub href: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubRepoProps {
    pub owner: String,
    pub repo: String,
}

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug)]
#[diesel(table_name = crate::schema::notebooks)]
pub struct Notebook {
    pub id: Uuid,
    #[serde(rename = "userId")]
    pub user_id: Option<Uuid>,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime<Utc>,
    #[serde(rename = "isPublic")]
    pub is_public: bool,
    pub document_data: Option<Vec<u8>>,
    pub team_id: Option<Uuid>,
}

#[derive(Queryable, Selectable, Identifiable, Associations, Serialize, Debug, Insertable)]
#[diesel(belongs_to(Notebook))]
#[diesel(table_name = crate::schema::blocks)]
pub struct Block {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub title: String,
    pub block_type: BlockType,
    pub language: Option<Language>,
    pub content: String,
    pub metadata: Option<serde_json::Value>,
    pub position: i32,
}

#[derive(Serialize)]
pub struct NotebookResponse {
    #[serde(flatten)]
    pub meta: Notebook,
    pub blocks: Vec<BlockResponse>,
}

#[derive(Serialize)]
pub struct BlockResponse {
    pub id: Uuid,
    pub title: String,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub content: String,
    pub language: Option<Language>,
    pub metadata: Option<BlockMetadata>,
}

#[derive(Insertable)]
#[diesel(table_name = notebooks)]
pub struct NewNotebook {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub title: String,
}

#[derive(Insertable)]
#[diesel(table_name = blocks)]
pub struct NewBlock {
    pub id: Uuid,
    pub notebook_id: Uuid,
    pub title: String,
    pub block_type: BlockType,
    pub language: Option<Language>,
    pub content: String,
    pub metadata: Option<Value>,
    pub position: i32,
}

#[derive(Deserialize)]
pub struct UpdateNotebookTitle {
    pub title: String,
}

#[derive(Deserialize)]
pub struct UpdateNotebookVisibility {
    pub is_visible: bool,
}

#[derive(Deserialize)]
pub struct SyncNotebookRequest {
    pub title: String,
    pub blocks: Vec<BlockRequest>,
    #[serde(rename = "isPublic")]
    pub is_public: bool,
}

#[derive(Deserialize)]
pub struct BlockRequest {
    pub id: Uuid,
    pub title: String,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub content: String,
    pub language: Option<Language>,
    pub metadata: Option<BlockMetadata>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Deserialize, Default)]
pub struct PublicSearchQuery {
    #[serde(default)]
    pub q: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    pub id: Uuid,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotebookPermission {
    OwnerOrTeam,
    Viewer,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PublicNotebookResponse {
    pub id: Uuid,
    pub title: String,
    pub user_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub owner_name: String,
    pub updated_at: DateTime<Utc>,
}

pub async fn create_notebook(
    conn: &mut AsyncPgConnection,
    new_notebook: &NewNotebook,
) -> Result<(), String> {
    use crate::schema::notebooks::dsl::*;

    match diesel::insert_into(notebooks)
        .values(new_notebook)
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn create_block(
    conn: &mut AsyncPgConnection,
    new_block: &NewBlock,
) -> Result<(), String> {
    use crate::schema::blocks::dsl::*;

    match diesel::insert_into(blocks)
        .values(new_block)
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn find_notebook_by_id(
    conn: &mut AsyncPgConnection,
    param_id: &Uuid,
) -> Result<Notebook, ApiError> {
    use crate::schema::notebooks::dsl::*;
    match notebooks
        .filter(id.eq(param_id))
        .select(Notebook::as_select())
        .get_result::<Notebook>(conn)
        .await
    {
        Ok(notebook) => Ok(notebook),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn delete_notebook(conn: &mut AsyncPgConnection, param_id: &Uuid) -> Result<(), String> {
    use crate::schema::notebooks::dsl::*;

    match diesel::delete(notebooks.filter(id.eq(param_id)))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn update_notebook_title(
    conn: &mut AsyncPgConnection,
    param_id: Uuid,
    new_title: String,
) -> Result<(), String> {
    use crate::schema::notebooks::dsl::*;

    match diesel::update(notebooks.filter(id.eq(param_id)))
        .set((title.eq(new_title), updated_at.eq(Utc::now())))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn update_notebook_visibility(
    conn: &mut AsyncPgConnection,
    param_id: Uuid,
    is_visible: bool,
) -> Result<(), String> {
    use crate::schema::notebooks::dsl::*;

    match diesel::update(notebooks.filter(id.eq(param_id)))
        .set((is_public.eq(is_visible), updated_at.eq(Utc::now())))
        .execute(conn)
        .await
    {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn get_all_notebooks(
    conn: &mut AsyncPgConnection,
    param_id: &Uuid,
) -> Result<Vec<Notebook>, String> {
    use crate::schema::notebooks::dsl::*;

    match notebooks
        .filter(user_id.eq(param_id))
        .order(updated_at.desc())
        .select(Notebook::as_select())
        .load::<Notebook>(conn)
        .await
    {
        Ok(items) => Ok(items),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn find_blocks_by_notebook_id(
    conn: &mut AsyncPgConnection,
    param_nb_id: &Uuid,
) -> Result<Vec<Block>, String> {
    match blocks_dsl::blocks
        .filter(blocks_dsl::notebook_id.eq(param_nb_id))
        .order(blocks_dsl::position.asc())
        .load::<Block>(conn)
        .await
    {
        Ok(items) => Ok(items),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn sync_notebook_content(
    conn: &mut AsyncPgConnection,
    nb_id: Uuid,
    new_title: String,
    new_blocks: Vec<NewBlock>,
    set_is_public: bool,
) -> Result<(), String> {
    use crate::schema::notebooks::dsl::*;

    let result = conn
        .transaction::<_, diesel::result::Error, _>(|conn| {
            Box::pin(async move {
                diesel::update(notebooks.filter(id.eq(nb_id)))
                    .set((
                        title.eq(new_title),
                        updated_at.eq(chrono::Utc::now()),
                        is_public.eq(set_is_public),
                    ))
                    .execute(conn)
                    .await?;

                diesel::delete(blocks_dsl::blocks.filter(blocks_dsl::notebook_id.eq(nb_id)))
                    .execute(conn)
                    .await?;

                if !new_blocks.is_empty() {
                    diesel::insert_into(blocks_dsl::blocks)
                        .values(&new_blocks)
                        .execute(conn)
                        .await?;
                }

                Ok(())
            })
        })
        .await;

    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn get_notebook_with_blocks(
    conn: &mut AsyncPgConnection,
    param_id: &Uuid,
) -> Result<NotebookResponse, String> {
    let notebook: Notebook = match notebooks::table
        .find(param_id)
        .select(Notebook::as_select())
        .first::<Notebook>(conn)
        .await
    {
        Ok(n) => n,
        Err(e) => return Err(format!("Notebook não encontrado: {}", e)),
    };

    let db_blocks: Vec<Block> = match Block::belonging_to(&notebook)
        .order(blocks::position.asc())
        .load::<Block>(conn)
        .await
    {
        Ok(b) => b,
        Err(e) => return Err(format!("Erro ao buscar blocos: {}", e)),
    };

    let api_blocks: Vec<BlockResponse> = db_blocks
        .into_iter()
        .map(|b| {
            let parsed_metadata: Option<BlockMetadata> =
                b.metadata
                    .and_then(|json_val| match serde_json::from_value(json_val) {
                        Ok(meta) => Some(meta),
                        Err(e) => {
                            println!("Erro ao desserializar metadata do bloco {}: {}", b.id, e);
                            None
                        }
                    });

            BlockResponse {
                id: b.id,
                title: b.title,
                block_type: b.block_type,
                content: b.content,
                language: b.language,
                metadata: parsed_metadata,
            }
        })
        .collect();

    Ok(NotebookResponse {
        meta: notebook,
        blocks: api_blocks,
    })
}

pub async fn clone_notebook(
    conn: &mut AsyncPgConnection,
    target_notebook_id: &Uuid,
    new_notebook_id: &Uuid,
    new_notebook_title: &str,
) -> Result<(), ApiError> {
    use crate::schema::notebooks::dsl::*;

    let target_notebook: Notebook = match notebooks
        .filter(id.eq(target_notebook_id))
        .select(Notebook::as_select())
        .get_result(conn)
        .await
    {
        Ok(n) => n,
        Err(e) => return Err(ApiError::Database(e.to_string())),
    };

    let db_blocks: Vec<Block> = match Block::belonging_to(&target_notebook)
        .order(blocks::position.asc())
        .load::<Block>(conn)
        .await
    {
        Ok(b) => b,
        Err(e) => return Err(ApiError::Database(e.to_string())),
    };

    let mut new_db_blocks = vec![];
    if !db_blocks.is_empty() {
        for block in db_blocks {
            let mut block = block;
            block.id = Uuid::new_v4();
            block.notebook_id = new_notebook_id.clone();

            new_db_blocks.push(block);
        }
    }

    let result = conn
        .transaction::<_, diesel::result::Error, _>(|conn| {
            Box::pin(async move {
                diesel::update(notebooks.filter(id.eq(new_notebook_id)))
                    .set((
                        title.eq(new_notebook_title),
                        updated_at.eq(chrono::Utc::now()),
                        is_public.eq(target_notebook.is_public),
                        document_data.eq(target_notebook.document_data),
                    ))
                    .execute(conn)
                    .await?;

                diesel::delete(
                    blocks_dsl::blocks.filter(blocks_dsl::notebook_id.eq(new_notebook_id)),
                )
                .execute(conn)
                .await?;

                diesel::insert_into(blocks_dsl::blocks)
                    .values(&new_db_blocks)
                    .execute(conn)
                    .await?;

                Ok(())
            })
        })
        .await;

    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(ApiError::Database(e.to_string())),
    }
}

pub async fn search_user_blocks(
    conn: &mut AsyncPgConnection,
    current_user_id: uuid::Uuid,
    search_term: &str,
) -> Result<Vec<SearchResult>, ApiError> {
    use crate::schema::blocks::dsl as b;
    use crate::schema::notebooks::dsl as n;

    let results_tuples: Vec<(uuid::Uuid, String, String)> = b::blocks
        .inner_join(n::notebooks.on(b::notebook_id.eq(n::id)))
        .filter(
            n::user_id.eq(current_user_id).and(
                b::title
                    .ilike(&search_term)
                    .or(b::content.ilike(&search_term)),
            ),
        )
        .select((n::id, n::title, b::content))
        .limit(10)
        .load(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let final_results = results_tuples
        .into_iter()
        .map(|(id, title, content)| SearchResult { id, title, content })
        .collect::<Vec<SearchResult>>();

    Ok(final_results)
}

pub async fn load_notebook_data(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
) -> Option<Vec<u8>> {
    use crate::schema::notebooks::dsl::*;

    notebooks
        .filter(id.eq(notebook_id))
        .select(document_data)
        .first::<Option<Vec<u8>>>(conn)
        .await
        .unwrap_or(None)
}

pub async fn save_notebook_data(
    conn: &mut AsyncPgConnection,
    user_id_param: Uuid,
    notebook_id_param: Uuid,
    data: Vec<u8>,
) {
    use crate::schema::notebooks::dsl::*;

    let notebook: Notebook = notebooks
        .filter(id.eq(notebook_id_param))
        .select(Notebook::as_select())
        .get_result(conn)
        .await
        .unwrap();

    if let Some(uid) = notebook.user_id
        && uid != user_id_param
    {
        return;
    }

    if let Some(tid) = notebook.team_id {
        match crate::models::team::find_team_member_with_role(conn, tid, user_id_param).await {
            Ok(m) => {
                if !m.1.can_write {
                    return;
                }
            }
            Err(_) => return,
        }
    }

    diesel::update(notebooks)
        .filter(id.eq(notebook_id_param))
        .set((
            document_data.eq(data),
            updated_at.eq(chrono::Utc::now().naive_utc()),
        ))
        .execute(conn)
        .await
        .ok();
}

pub fn extract_search_text(doc: &AutoCommit) -> String {
    let blocks_id = match doc.get(ROOT, "blocks") {
        Ok(Some((AmValue::Object(ObjType::List), obj))) => obj,
        _ => return String::new(),
    };

    let mut out = String::new();
    let len = doc.length(&blocks_id);
    for i in 0..len {
        let block_id = match doc.get(&blocks_id, i) {
            Ok(Some((AmValue::Object(ObjType::Map), obj))) => obj,
            _ => continue,
        };

        for key in ["title", "content"] {
            match doc.get(&block_id, key) {
                Ok(Some((AmValue::Object(ObjType::Text), text_id))) => {
                    if let Ok(t) = doc.text(&text_id)
                        && !t.is_empty()
                    {
                        out.push_str(&t);
                        out.push('\n');
                    }
                }
                Ok(Some((AmValue::Scalar(s), _))) => {
                    if let ScalarValue::Str(txt) = s.as_ref()
                        && !txt.is_empty()
                    {
                        out.push_str(txt);
                        out.push('\n');
                    }
                }
                _ => {}
            }
        }
    }
    out
}

pub async fn checkpoint_notebook_data(
    conn: &mut AsyncPgConnection,
    notebook_id_param: Uuid,
    data: Vec<u8>,
    search_text_param: String,
) {
    use crate::schema::notebooks::dsl::*;

    diesel::update(notebooks)
        .filter(id.eq(notebook_id_param))
        .set((
            document_data.eq(data),
            search_text.eq(search_text_param),
            updated_at.eq(chrono::Utc::now().naive_utc()),
        ))
        .execute(conn)
        .await
        .ok();
}

pub async fn backfill_search_text(
    pool: &Pool<AsyncPgConnection>,
) -> Result<usize, String> {
    use crate::schema::notebooks::dsl::*;

    let mut conn = pool.get().await.map_err(|e| e.to_string())?;

    let rows: Vec<(Uuid, Option<Vec<u8>>)> = notebooks
        .filter(search_text.eq("").and(document_data.is_not_null()))
        .select((id, document_data))
        .load(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let mut updated = 0usize;
    for (nb_id, data) in rows {
        let Some(bytes) = data else { continue };
        let Ok(doc) = AutoCommit::load(&bytes) else {
            continue;
        };
        let text = extract_search_text(&doc);
        if text.is_empty() {
            continue;
        }
        if diesel::update(notebooks.filter(id.eq(nb_id)))
            .set(search_text.eq(text))
            .execute(&mut conn)
            .await
            .is_ok()
        {
            updated += 1;
        }
    }

    Ok(updated)
}

pub async fn check_permission(
    pool: &Pool<AsyncPgConnection>,
    user_id: Option<Uuid>,
    notebook_id: Uuid,
) -> Result<NotebookPermission, ApiError> {
    use crate::schema::team_members;
    use crate::schema::team_roles;

    let mut conn = pool.get().await.unwrap();
    let uid = match user_id {
        Some(id) => id,
        None => return Ok(NotebookPermission::Viewer),
    };

    let notebook = match notebooks::table
        .filter(notebooks::id.eq(notebook_id))
        .select(Notebook::as_select())
        .first::<Notebook>(&mut conn)
        .await
        .optional()
    {
        Ok(Some(n)) => n,
        _ => return Ok(NotebookPermission::Viewer),
    };

    if let Some(notebook_uid) = notebook.user_id
        && notebook_uid == uid
    {
        return Ok(NotebookPermission::OwnerOrTeam);
    }

    let has_team_write_permission = if let Some(team_id) = notebook.team_id {
        let can_write_result = team_members::table
            .inner_join(team_roles::table.on(team_members::role_id.eq(team_roles::id)))
            .filter(team_members::team_id.eq(team_id))
            .filter(team_members::user_id.eq(uid))
            .select(team_roles::can_write)
            .first::<bool>(&mut conn)
            .await
            .optional();

        match can_write_result {
            Ok(Some(true)) => true,
            _ => false,
        }
    } else {
        false
    };

    if has_team_write_permission {
        return Ok(NotebookPermission::OwnerOrTeam);
    }

    Ok(NotebookPermission::Viewer)
}

pub async fn get_team_notebooks(
    conn: &mut AsyncPgConnection,
    param_id: &Uuid,
) -> Result<Vec<Notebook>, String> {
    use crate::schema::notebooks::dsl::*;

    match notebooks
        .filter(team_id.eq(param_id))
        .order(updated_at.desc())
        .select(Notebook::as_select())
        .load::<Notebook>(conn)
        .await
    {
        Ok(items) => Ok(items),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn get_public_notebooks(
    conn: &mut AsyncPgConnection,
    q: Option<&str>,
) -> Result<Vec<PublicNotebookResponse>, ApiError> {
    use crate::schema::teams;
    use crate::schema::users;

    let mut query = notebooks::table
        .left_join(users::table.on(notebooks::user_id.eq(users::id.nullable())))
        .left_join(teams::table.on(notebooks::team_id.eq(teams::id.nullable())))
        .filter(notebooks::is_public.eq(true))
        .into_boxed();

    if let Some(term) = q {
        let pattern = format!("%{}%", term);
        query = query.filter(
            notebooks::title
                .ilike(pattern.clone())
                .or(notebooks::search_text.ilike(pattern)),
        );
    }

    let raw_results = match query
        .order(notebooks::updated_at.desc())
        .select((
            notebooks::id,
            notebooks::title,
            notebooks::user_id,
            notebooks::team_id,
            users::name.nullable(),
            teams::name.nullable(),
            notebooks::updated_at,
        ))
        .load::<(
            Uuid,
            String,
            Option<Uuid>,
            Option<Uuid>,
            Option<String>,
            Option<String>,
            DateTime<Utc>,
        )>(conn)
        .await
    {
        Ok(res) => res,
        Err(e) => return Err(ApiError::Database(e.to_string())),
    };

    let public_notebooks = raw_results
        .into_iter()
        .map(
            |(id, title, user_id, team_id, user_name, team_name, updated_at)| {
                let owner_name = team_name
                    .or(user_name)
                    .unwrap_or_else(|| "Desconhecido".to_string());

                PublicNotebookResponse {
                    id,
                    title,
                    user_id,
                    team_id,
                    owner_name,
                    updated_at,
                }
            },
        )
        .collect();

    Ok(public_notebooks)
}
