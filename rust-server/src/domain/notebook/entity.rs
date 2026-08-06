use chrono::{DateTime, Utc};
use diesel::Selectable;
use diesel::prelude::{Associations, Identifiable, Insertable, Queryable};
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

impl std::fmt::Display for Language {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Language::Rust => "rust",
            Language::Typescript => "typescript",
            Language::Python => "python",
            Language::Zig => "zig",
            Language::Go => "go",
            Language::Cpp => "cpp",
        };
        f.write_str(s)
    }
}

#[derive(Queryable, Selectable, Identifiable, Debug)]
#[diesel(table_name = crate::schema::notebooks)]
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

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Insertable)]
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
