use uuid::Uuid;

use crate::controllers::permissions::{TargetCtx, require};
use crate::models::error::ApiError;
use crate::models::state::AppState;

use super::entity::Challenge;

pub const VALID_JUDGE_MODES: [&str; 3] = ["io", "reference", "property"];

pub fn challenge_notebook(challenge: &Challenge) -> Result<Uuid, ApiError> {
    challenge
        .notebook_id
        .ok_or_else(|| ApiError::Request("Desafio sem notebook vinculado".to_string()))
}

pub async fn require_notebook(
    state: &AppState,
    challenge: &Challenge,
    user_id: Option<Uuid>,
    key: &str,
    target: &TargetCtx,
) -> Result<(), ApiError> {
    let notebook_id = challenge_notebook(challenge)?;
    require(&state.pool, user_id, notebook_id, key, target).await?;
    Ok(())
}

pub fn reference_map(challenge: &Challenge) -> serde_json::Map<String, serde_json::Value> {
    match &challenge.reference_solutions {
        Some(serde_json::Value::Object(m)) if !m.is_empty() => m.clone(),
        _ => {
            let mut m = serde_json::Map::new();
            if let (Some(lang), Some(code)) =
                (&challenge.reference_language, &challenge.reference_solution)
                && !code.trim().is_empty()
            {
                m.insert(lang.clone(), serde_json::Value::String(code.clone()));
            }
            m
        }
    }
}

pub fn pick_reference(challenge: &Challenge) -> Option<(String, String)> {
    let map = reference_map(challenge);
    for lang in ["rust", "go", "cpp", "zig"] {
        if let Some(serde_json::Value::String(code)) = map.get(lang)
            && !code.trim().is_empty()
        {
            return Some((lang.to_string(), code.clone()));
        }
    }
    map.into_iter().find_map(|(lang, v)| match v {
        serde_json::Value::String(code) if !code.trim().is_empty() => Some((lang, code)),
        _ => None,
    })
}
