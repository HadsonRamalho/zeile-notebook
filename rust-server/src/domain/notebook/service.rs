use diesel_async::{AsyncPgConnection, pooled_connection::deadpool::Pool};
use uuid::Uuid;

use crate::controllers::permissions::{NotebookCtx, TargetCtx, capabilities, resolve_capabilities};
use crate::models::error::ApiError;

use super::dto::{BlockRequest, SyncNotebookRequest};
use super::repository;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotebookPermission {
    OwnerOrTeam,
    Viewer,
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

pub const MAX_BLOCKS: usize = 1000;

pub const MAX_BYTES_PER_BLOCK: usize = 512 * 1024;

pub const MAX_TOTAL_BYTES: usize = 8 * 1024 * 1024;

fn block_weight(block: &BlockRequest) -> usize {
    let metadata = block
        .metadata
        .as_ref()
        .and_then(|m| serde_json::to_vec(m).ok())
        .map(|v| v.len())
        .unwrap_or(0);

    block.title.len() + block.content.len() + metadata
}

pub fn validate_content(payload: &SyncNotebookRequest) -> Result<(), ApiError> {
    if payload.blocks.len() > MAX_BLOCKS {
        return Err(ApiError::Request(format!(
            "Notebook acima do limite de {} blocos (recebidos {}).",
            MAX_BLOCKS,
            payload.blocks.len()
        )));
    }

    let mut total = payload.title.len();

    for (index, block) in payload.blocks.iter().enumerate() {
        let weight = block_weight(block);

        if weight > MAX_BYTES_PER_BLOCK {
            return Err(ApiError::Request(format!(
                "Bloco {} acima do limite de {} KB.",
                index + 1,
                MAX_BYTES_PER_BLOCK / 1024
            )));
        }

        total += weight;

        if total > MAX_TOTAL_BYTES {
            return Err(ApiError::Request(format!(
                "Conteúdo do notebook acima do limite de {} MB.",
                MAX_TOTAL_BYTES / (1024 * 1024)
            )));
        }
    }

    Ok(())
}

pub async fn save_notebook_data(
    conn: &mut AsyncPgConnection,
    user_id_param: Uuid,
    notebook_id_param: Uuid,
    data: Vec<u8>,
) {
    let notebook = match repository::find_notebook_by_id(conn, &notebook_id_param).await {
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

    repository::write_notebook_data(conn, notebook_id_param, data).await;
}

#[cfg(test)]
mod tests {
    use super::super::dto::{BlockRequest, SyncNotebookRequest};
    use super::*;
    use crate::domain::notebook::entity::BlockType;

    fn block(content: &str) -> BlockRequest {
        BlockRequest {
            id: Uuid::new_v4(),
            title: "block".to_string(),
            block_type: BlockType::Text,
            content: content.to_string(),
            language: None,
            metadata: None,
        }
    }

    fn request(blocks: Vec<BlockRequest>) -> SyncNotebookRequest {
        SyncNotebookRequest {
            title: "notebook".to_string(),
            blocks,
            is_public: false,
        }
    }

    #[test]
    fn an_ordinary_notebook_passes() {
        let blocks = (0..50).map(|i| block(&format!("content {i}"))).collect();

        assert!(validate_content(&request(blocks)).is_ok());
    }

    #[test]
    fn blocks_a_single_giant_block() {
        let fat = "x".repeat(MAX_BYTES_PER_BLOCK + 1);

        let error = validate_content(&request(vec![block(&fat)]))
            .expect_err("block above the ceiling should be refused");

        assert!(error.to_string().contains("Bloco 1"), "{error}");
    }

    #[test]
    fn blocks_too_many_blocks() {
        let blocks = (0..MAX_BLOCKS + 1).map(|_| block("hi")).collect();

        let error = validate_content(&request(blocks)).expect_err("excess of blocks got through");

        assert!(error.to_string().contains("blocos"), "{error}");
    }

    #[test]
    fn blocks_the_sum_of_small_blocks() {
        let chunk = "y".repeat(MAX_BYTES_PER_BLOCK / 2);
        let how_many = MAX_TOTAL_BYTES / chunk.len() + 2;
        let blocks = (0..how_many).map(|_| block(&chunk)).collect();

        let error = validate_content(&request(blocks))
            .expect_err("many valid blocks summing above the total should be refused");

        assert!(error.to_string().contains("MB"), "{error}");
    }

    #[test]
    fn metadata_is_not_a_side_door() {
        let mut b = block("small");
        b.metadata = serde_json::from_str(&format!(
            "{{\"type\":\"generic\",\"junk\":\"{}\"}}",
            "z".repeat(MAX_BYTES_PER_BLOCK)
        ))
        .ok();

        assert!(
            b.metadata.is_some(),
            "the test needs metadata filled in to be meaningful"
        );

        let error = validate_content(&request(vec![b]))
            .expect_err("giant metadata should count toward the block's weight");

        assert!(error.to_string().contains("Bloco 1"), "{error}");
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
