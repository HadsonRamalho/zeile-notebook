use crate::controllers::permissions::{NotebookCtx, TargetCtx, capabilities, resolve_capabilities};
use crate::{models::error::ApiError, schema::blocks::dsl as blocks_dsl};
use automerge::{AutoCommit, ObjType, ReadDoc, ROOT, ScalarValue, Value as AmValue};
use chrono::{DateTime, Utc};
use diesel::{
    BelongingToDsl, BoolExpressionMethods, ExpressionMethods, JoinOnDsl, NullableExpressionMethods,
    PgTextExpressionMethods, QueryDsl, QueryableByName, Selectable, SelectableHelper,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, utoipa::ToSchema)]
#[ExistingTypePath = "crate::schema::sql_types::BlockTypeEnum"]
#[serde(rename_all = "snake_case")]
pub enum BlockType {
    Text,
    Code,
    Component,
    Drawing,
    FreeDrawing,
    DatabaseSchema,
    Latex,
    Sql,
    Typst,
    Challenge,
    NotebookRef,
    TemplateRef,
    Chart,
    Mermaid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, utoipa::ToSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CalloutProps {
    pub title: Option<String>,
    pub icon: Option<String>,
    #[serde(rename = "type")]
    pub callout_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CardProps {
    pub title: String,
    pub description: Option<String>,
    pub href: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct GithubRepoProps {
    pub owner: String,
    pub repo: String,
}

#[derive(Queryable, Selectable, Identifiable, Serialize, Debug, utoipa::ToSchema)]
#[diesel(table_name = crate::schema::notebooks)]
#[serde(rename_all = "camelCase")]
pub struct Notebook {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub is_public: bool,
    pub document_data: Option<Vec<u8>>,
    pub team_id: Option<Uuid>,
    pub folder_id: Option<Uuid>,
    pub tags: Value,
    pub public_slug: Option<String>,
}

#[derive(Queryable, Selectable, Identifiable, Associations, Serialize, Debug, Insertable)]
#[diesel(belongs_to(Notebook))]
#[diesel(table_name = crate::schema::blocks)]
#[serde(rename_all = "camelCase")]
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

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotebookResponse {
    #[serde(flatten)]
    pub meta: Notebook,
    pub blocks: Vec<BlockResponse>,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
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

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotebookTitle {
    pub title: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTagsRequest {
    pub tags: Vec<String>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotebookVisibility {
    #[serde(alias = "is_visible")]
    pub is_visible: bool,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncNotebookRequest {
    pub title: String,
    pub blocks: Vec<BlockRequest>,
    pub is_public: bool,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
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

#[derive(Serialize, Deserialize, utoipa::ToSchema)]
pub struct SearchResult {
    pub id: Uuid,
    pub title: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct RankedSearchQuery {
    pub q: String,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RankedSearchItem {
    pub kind: String,
    pub notebook_id: Uuid,
    pub block_id: Option<Uuid>,
    pub notebook_title: String,
    pub team_id: Option<Uuid>,
    pub team_name: Option<String>,
    pub snippet: String,
    pub rank: f32,
}

#[derive(QueryableByName)]
struct NotebookHitRow {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    notebook_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Text)]
    notebook_title: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Uuid>)]
    team_id: Option<Uuid>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    team_name: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    snippet: String,
    #[diesel(sql_type = diesel::sql_types::Float)]
    rank: f32,
}

#[derive(QueryableByName)]
struct BlockHitRow {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    block_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    notebook_id: Uuid,
    #[diesel(sql_type = diesel::sql_types::Text)]
    notebook_title: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Uuid>)]
    team_id: Option<Uuid>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    team_name: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Text)]
    snippet: String,
    #[diesel(sql_type = diesel::sql_types::Float)]
    rank: f32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotebookPermission {
    OwnerOrTeam,
    Viewer,
}

#[derive(Serialize, Deserialize, Debug, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
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

    let notebook_title: String = notebooks
        .filter(id.eq(param_id))
        .select(title)
        .first::<String>(conn)
        .await
        .map_err(|e| e.to_string())?;

    diesel::update(notebooks.filter(id.eq(param_id)))
        .set((is_public.eq(is_visible), updated_at.eq(Utc::now())))
        .execute(conn)
        .await
        .map_err(|e| e.to_string())?;

    if is_visible {
        ensure_public_slug(conn, param_id, &notebook_title)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !out.is_empty() && !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    let base: String = trimmed.chars().take(60).collect();
    if base.is_empty() {
        "caderno".to_string()
    } else {
        base
    }
}

pub async fn ensure_public_slug(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
    title_param: &str,
) -> Result<String, ApiError> {
    use crate::schema::notebooks::dsl::*;

    let current: Option<String> = notebooks
        .filter(id.eq(notebook_id))
        .select(public_slug)
        .first::<Option<String>>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    if let Some(slug) = current {
        return Ok(slug);
    }

    let base = slugify(title_param);
    for _ in 0..5 {
        let suffix = Uuid::new_v4().simple().to_string();
        let candidate = format!("{}-{}", base, &suffix[..6]);
        let count: i64 = notebooks
            .filter(public_slug.eq(&candidate))
            .count()
            .get_result(conn)
            .await
            .map_err(|e| ApiError::Database(e.to_string()))?;
        if count == 0 {
            diesel::update(notebooks.filter(id.eq(notebook_id)))
                .set(public_slug.eq(&candidate))
                .execute(conn)
                .await
                .map_err(|e| ApiError::Database(e.to_string()))?;
            return Ok(candidate);
        }
    }

    Err(ApiError::Database("slug unavailable".to_string()))
}

#[derive(Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicNotebookDoc {
    pub id: Uuid,
    pub title: String,
    pub owner_name: Option<String>,
    pub updated_at: DateTime<Utc>,
    pub public_slug: Option<String>,
    pub document_data: Option<Vec<u8>>,
}

pub async fn get_public_notebook_by_slug(
    conn: &mut AsyncPgConnection,
    slug: &str,
) -> Result<PublicNotebookDoc, ApiError> {
    use crate::schema::users;

    let row = notebooks::table
        .left_join(users::table.on(notebooks::user_id.eq(users::id.nullable())))
        .filter(notebooks::public_slug.eq(slug))
        .filter(notebooks::is_public.eq(true))
        .select((
            notebooks::id,
            notebooks::title,
            users::name.nullable(),
            notebooks::updated_at,
            notebooks::public_slug,
            notebooks::document_data,
        ))
        .first::<(
            Uuid,
            String,
            Option<String>,
            DateTime<Utc>,
            Option<String>,
            Option<Vec<u8>>,
        )>(conn)
        .await
        .map_err(|_| ApiError::Request("Caderno público não encontrado".to_string()))?;

    Ok(PublicNotebookDoc {
        id: row.0,
        title: row.1,
        owner_name: row.2,
        updated_at: row.3,
        public_slug: row.4,
        document_data: row.5,
    })
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
        .select(Block::as_select())
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
        Err(e) => return Err(format!("Notebook not found: {}", e)),
    };

    let db_blocks: Vec<Block> = match Block::belonging_to(&notebook)
        .order(blocks::position.asc())
        .select(Block::as_select())
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
        .select(Block::as_select())
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

pub async fn search_notebooks_ranked(
    conn: &mut AsyncPgConnection,
    current_user_id: Uuid,
    query_text: &str,
    limit: i64,
) -> Result<Vec<RankedSearchItem>, ApiError> {
    use diesel::sql_types::{BigInt, Text, Uuid as SqlUuid};

    let notebook_sql = "\
        SELECT n.id AS notebook_id, \
               n.title AS notebook_title, \
               n.team_id AS team_id, \
               t.name AS team_name, \
               ts_headline('simple', coalesce(n.search_text, ''), query, \
                   'StartSel=‹,StopSel=›,MaxFragments=1,MinWords=4,MaxWords=14,ShortWord=2') AS snippet, \
               ts_rank_cd(n.search_tsv, query) AS rank \
        FROM notebooks n \
        LEFT JOIN teams t ON t.id = n.team_id, \
             plainto_tsquery('simple', $1) query \
        WHERE (n.user_id = $2 OR n.team_id IN (SELECT team_id FROM team_members WHERE user_id = $2)) \
          AND n.search_tsv @@ query \
        ORDER BY rank DESC \
        LIMIT $3";

    let block_sql = "\
        SELECT b.id AS block_id, \
               b.notebook_id AS notebook_id, \
               n.title AS notebook_title, \
               n.team_id AS team_id, \
               t.name AS team_name, \
               ts_headline('simple', b.content, query, \
                   'StartSel=‹,StopSel=›,MaxFragments=1,MinWords=4,MaxWords=14,ShortWord=2') AS snippet, \
               ts_rank_cd(b.search_tsv, query) AS rank \
        FROM blocks b \
        JOIN notebooks n ON n.id = b.notebook_id \
        LEFT JOIN teams t ON t.id = n.team_id, \
             plainto_tsquery('simple', $1) query \
        WHERE (n.user_id = $2 OR n.team_id IN (SELECT team_id FROM team_members WHERE user_id = $2)) \
          AND b.search_tsv @@ query \
        ORDER BY rank DESC \
        LIMIT $3";

    let notebook_rows: Vec<NotebookHitRow> = diesel::sql_query(notebook_sql)
        .bind::<Text, _>(query_text)
        .bind::<SqlUuid, _>(current_user_id)
        .bind::<BigInt, _>(limit)
        .load(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let block_rows: Vec<BlockHitRow> = diesel::sql_query(block_sql)
        .bind::<Text, _>(query_text)
        .bind::<SqlUuid, _>(current_user_id)
        .bind::<BigInt, _>(limit)
        .load(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;

    let mut items: Vec<RankedSearchItem> =
        Vec::with_capacity(notebook_rows.len() + block_rows.len());

    for r in notebook_rows {
        items.push(RankedSearchItem {
            kind: "notebook".to_string(),
            notebook_id: r.notebook_id,
            block_id: None,
            notebook_title: r.notebook_title,
            team_id: r.team_id,
            team_name: r.team_name,
            snippet: r.snippet,
            rank: r.rank,
        });
    }

    for r in block_rows {
        items.push(RankedSearchItem {
            kind: "block".to_string(),
            notebook_id: r.notebook_id,
            block_id: Some(r.block_id),
            notebook_title: r.notebook_title,
            team_id: r.team_id,
            team_name: r.team_name,
            snippet: r.snippet,
            rank: r.rank,
        });
    }

    items.sort_by(|a, b| {
        b.rank
            .partial_cmp(&a.rank)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items.truncate(limit as usize);

    Ok(items)
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

    let notebook: Notebook = match notebooks
        .filter(id.eq(notebook_id_param))
        .select(Notebook::as_select())
        .get_result(conn)
        .await
    {
        Ok(n) => n,
        Err(_) => return,
    };

    let ctx = NotebookCtx {
        notebook_id: notebook_id_param,
        team_id: notebook.team_id,
        owner_user_id: notebook.user_id,
        is_public: notebook.is_public,
    };

    let caps = match resolve_capabilities(conn, ctx, Some(user_id_param)).await {
        Ok(caps) => caps,
        Err(_) => return,
    };

    if !caps.can("notebook.edit", &TargetCtx::default()) {
        return;
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
    if user_id.is_none() {
        return Ok(NotebookPermission::Viewer);
    }

    let caps = match capabilities(pool, user_id, notebook_id).await {
        Ok(caps) => caps,
        Err(_) => return Ok(NotebookPermission::Viewer),
    };

    if caps.can("notebook.edit", &TargetCtx::default()) {
        return Ok(NotebookPermission::OwnerOrTeam);
    }

    Ok(NotebookPermission::Viewer)
}

pub const MAX_TAGS: usize = 6;
pub const MAX_TAG_LEN: usize = 32;

pub fn normalize_tags(raw: &[String]) -> Result<Vec<String>, ApiError> {
    let mut out: Vec<String> = Vec::new();
    for tag in raw {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.chars().count() > MAX_TAG_LEN {
            return Err(ApiError::Request(format!(
                "Tag excede {MAX_TAG_LEN} caracteres"
            )));
        }
        if !out.iter().any(|t| t.eq_ignore_ascii_case(trimmed)) {
            out.push(trimmed.to_string());
        }
    }
    if out.len() > MAX_TAGS {
        return Err(ApiError::Request(format!(
            "Máximo de {MAX_TAGS} tags por item"
        )));
    }
    Ok(out)
}

pub async fn set_notebook_tags(
    conn: &mut AsyncPgConnection,
    notebook_id: Uuid,
    new_tags: &[String],
) -> Result<(), ApiError> {
    let value = serde_json::to_value(new_tags).unwrap_or_else(|_| Value::Array(vec![]));
    diesel::update(notebooks::table.find(notebook_id))
        .set((
            notebooks::tags.eq(value),
            notebooks::updated_at.eq(Utc::now()),
        ))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(|e| ApiError::Database(e.to_string()))
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

#[cfg(test)]
mod tests {
    use super::*;
    use automerge::transaction::Transactable;

    #[test]
    fn block_type_serializes_multi_word_variants_as_snake_case() {
        assert_eq!(
            serde_json::to_string(&BlockType::FreeDrawing).unwrap(),
            "\"free_drawing\""
        );
        assert_eq!(
            serde_json::to_string(&BlockType::DatabaseSchema).unwrap(),
            "\"database_schema\""
        );
        assert_eq!(
            serde_json::to_string(&BlockType::NotebookRef).unwrap(),
            "\"notebook_ref\""
        );
        assert_eq!(
            serde_json::to_string(&BlockType::TemplateRef).unwrap(),
            "\"template_ref\""
        );
    }

    #[test]
    fn block_type_serializes_single_word_variants_unchanged() {
        assert_eq!(serde_json::to_string(&BlockType::Text).unwrap(), "\"text\"");
        assert_eq!(serde_json::to_string(&BlockType::Code).unwrap(), "\"code\"");
        assert_eq!(
            serde_json::to_string(&BlockType::Component).unwrap(),
            "\"component\""
        );
        assert_eq!(
            serde_json::to_string(&BlockType::Drawing).unwrap(),
            "\"drawing\""
        );
    }

    fn doc_with_blocks(blocks_in: &[(&str, &str)]) -> AutoCommit {
        let mut doc = AutoCommit::new();
        let blocks = doc
            .put_object(ROOT, "blocks", ObjType::List)
            .expect("blocks list");
        for (i, (title, content)) in blocks_in.iter().enumerate() {
            let block = doc
                .insert_object(&blocks, i, ObjType::Map)
                .expect("block map");
            let title_id = doc
                .put_object(&block, "title", ObjType::Text)
                .expect("title text");
            doc.splice_text(&title_id, 0, 0, title)
                .expect("write title");
            let content_id = doc
                .put_object(&block, "content", ObjType::Text)
                .expect("content text");
            doc.splice_text(&content_id, 0, 0, content)
                .expect("write content");
        }
        doc
    }

    #[test]
    fn extract_search_text_returns_empty_without_blocks() {
        let doc = AutoCommit::new();
        assert_eq!(extract_search_text(&doc), "");
    }

    #[test]
    fn extract_search_text_returns_empty_when_blocks_is_not_a_list() {
        let mut doc = AutoCommit::new();
        doc.put(ROOT, "blocks", "not a list").expect("put");
        assert_eq!(extract_search_text(&doc), "");
    }

    #[test]
    fn extract_search_text_concatenates_title_and_content_in_order() {
        let doc = doc_with_blocks(&[("First", "body one"), ("Second", "body two")]);

        assert_eq!(
            extract_search_text(&doc),
            "First\nbody one\nSecond\nbody two\n"
        );
    }

    #[test]
    fn extract_search_text_reads_a_scalar_field_besides_crdt_text() {
        let mut doc = AutoCommit::new();
        let blocks = doc
            .put_object(ROOT, "blocks", ObjType::List)
            .expect("blocks list");
        let block = doc.insert_object(&blocks, 0, ObjType::Map).expect("block");
        doc.put(&block, "title", "scalar title")
            .expect("put title");
        doc.put(&block, "content", "scalar content")
            .expect("put content");

        assert_eq!(
            extract_search_text(&doc),
            "scalar title\nscalar content\n"
        );
    }

    #[test]
    fn extract_search_text_ignores_an_empty_field_without_leaving_a_blank_line() {
        let doc = doc_with_blocks(&[("", "just the body")]);

        assert_eq!(extract_search_text(&doc), "just the body\n");
    }

    #[test]
    fn extract_search_text_ignores_an_entry_that_is_not_a_map() {
        let mut doc = AutoCommit::new();
        let blocks = doc
            .put_object(ROOT, "blocks", ObjType::List)
            .expect("blocks list");
        doc.insert(&blocks, 0, "i'm a scalar")
            .expect("insert scalar");
        let block = doc.insert_object(&blocks, 1, ObjType::Map).expect("block");
        doc.put(&block, "title", "survived").expect("put title");

        assert_eq!(extract_search_text(&doc), "survived\n");
    }

    #[test]
    fn extract_search_text_ignores_fields_outside_title_and_content() {
        let mut doc = AutoCommit::new();
        let blocks = doc
            .put_object(ROOT, "blocks", ObjType::List)
            .expect("blocks list");
        let block = doc.insert_object(&blocks, 0, ObjType::Map).expect("block");
        doc.put(&block, "title", "indexed").expect("put title");
        doc.put(&block, "language", "rust").expect("put language");
        doc.put(&block, "metadata", "not indexed")
            .expect("put metadata");

        assert_eq!(extract_search_text(&doc), "indexed\n");
    }

    #[test]
    fn extract_search_text_survives_a_serialization_round_trip() {
        let mut doc = doc_with_blocks(&[("Title", "Body")]);
        let bytes = doc.save();
        let reloaded = AutoCommit::load(&bytes).expect("reload doc");

        assert_eq!(extract_search_text(&reloaded), extract_search_text(&doc));
    }

    #[test]
    fn slugify_normalizes_case_and_separators() {
        assert_eq!(slugify("Meu Primeiro Caderno"), "meu-primeiro-caderno");
        assert_eq!(slugify("A  B---C"), "a-b-c");
        assert_eq!(slugify("  espaços  nas  bordas  "), "espa-os-nas-bordas");
    }

    #[test]
    fn slugify_discards_non_alphanumeric_ascii() {
        assert_eq!(slugify("Relatório #1 (final)!"), "relat-rio-1-final");
        assert_eq!(slugify("a/b\\c"), "a-b-c");
    }

    #[test]
    fn slugify_falls_back_when_nothing_remains() {
        assert_eq!(slugify(""), "caderno");
        assert_eq!(slugify("!!!"), "caderno");
        assert_eq!(slugify("日本語"), "caderno");
    }

    #[test]
    fn slugify_limits_to_60_characters() {
        let slug = slugify(&"a".repeat(100));

        assert_eq!(slug.chars().count(), 60);
    }

    #[test]
    fn slugify_does_not_leave_a_hyphen_at_the_edges() {
        let slug = slugify("---meio---");

        assert!(!slug.starts_with('-'), "slug: {slug}");
        assert!(!slug.ends_with('-'), "slug: {slug}");
    }

    #[test]
    fn normalize_tags_removes_empty_and_trims_whitespace() {
        let tags = vec![
            "  rust  ".to_string(),
            "".to_string(),
            "   ".to_string(),
            "web".to_string(),
        ];

        assert_eq!(normalize_tags(&tags).unwrap(), vec!["rust", "web"]);
    }

    #[test]
    fn normalize_tags_deduplicates_case_insensitively_and_keeps_the_first() {
        let tags = vec!["Rust".to_string(), "rust".to_string(), "RUST".to_string()];

        assert_eq!(normalize_tags(&tags).unwrap(), vec!["Rust"]);
    }

    #[test]
    fn normalize_tags_accepts_an_empty_list() {
        assert_eq!(normalize_tags(&[]).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn normalize_tags_rejects_a_tag_above_the_limit() {
        let long = "a".repeat(MAX_TAG_LEN + 1);

        assert!(normalize_tags(&[long]).is_err());
    }

    #[test]
    fn normalize_tags_accepts_a_tag_exactly_at_the_limit() {
        let at_limit = "a".repeat(MAX_TAG_LEN);

        assert_eq!(
            normalize_tags(std::slice::from_ref(&at_limit)).unwrap(),
            vec![at_limit]
        );
    }

    #[test]
    fn normalize_tags_counts_characters_not_bytes() {
        let accented = "á".repeat(MAX_TAG_LEN);

        assert!(normalize_tags(&[accented]).is_ok());
    }

    #[test]
    fn normalize_tags_rejects_above_the_max_number_of_tags() {
        let many: Vec<String> = (0..=MAX_TAGS).map(|i| format!("tag{i}")).collect();

        assert!(normalize_tags(&many).is_err());
    }

    #[test]
    fn normalize_tags_accepts_exactly_the_max_number_of_tags() {
        let at_limit: Vec<String> = (0..MAX_TAGS).map(|i| format!("tag{i}")).collect();

        assert_eq!(normalize_tags(&at_limit).unwrap().len(), MAX_TAGS);
    }
}
