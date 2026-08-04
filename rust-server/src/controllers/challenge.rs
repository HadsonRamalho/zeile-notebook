use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::controllers::challenge_judge::{judge_submission, limits_for, normalize};
use crate::controllers::jwt::extract_claims_from_header;
use crate::controllers::permissions::{TargetCtx, require};
use crate::controllers::utils::get_conn;
use crate::executor::{ExecVerdict, compile_code, run_compiled};
use crate::models::challenge::{
    self, Challenge, ChallengePublic, LeaderboardEntry, NewChallenge, NewSubmission, NewTestCase,
    SubmissionView, TestCaseAuthoringView, TestCasePublic, UpdateChallenge,
};
use crate::models::error::ApiError;
use crate::models::state::AppState;
use crate::models::user::UserRole;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChallengeRequest {
    pub notebook_id: Uuid,
    pub block_id: Option<Uuid>,
    pub slug: String,
    pub title: String,
    pub statement_md: String,
    pub difficulty: Option<String>,
    pub tags: Option<Vec<String>>,
    pub languages: Vec<String>,
    pub judge_mode: Option<String>,
    pub time_limit_ms: Option<i32>,
    pub mem_limit_kb: Option<i32>,
    pub starter_code: Option<Value>,
    pub property_spec: Option<Value>,
    pub visibility: Option<String>,
    pub team_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChallengeRequest {
    pub title: Option<String>,
    pub statement_md: Option<String>,
    pub difficulty: Option<String>,
    pub judge_mode: Option<String>,
    pub time_limit_ms: Option<i32>,
    pub mem_limit_kb: Option<i32>,
    pub tags: Option<Vec<String>>,
    pub languages: Option<Vec<String>>,
    pub starter_code: Option<Value>,
    pub property_spec: Option<Value>,
    pub visibility: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTestCaseRequest {
    pub input: String,
    pub expected: Option<String>,
    pub is_hidden: Option<bool>,
    pub weight: Option<i32>,
    pub ord: Option<i32>,
}

#[derive(Deserialize)]
pub struct SetReferenceRequest {
    pub solution: String,
    pub language: String,
}

#[derive(Deserialize)]
pub struct SubmitRequest {
    pub language: String,
    pub code: String,
}

#[derive(serde::Serialize)]
pub struct SampleResultView {
    pub input: String,
    pub expected: Option<String>,
    pub stdout: String,
    pub stderr: Option<String>,
    pub verdict: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSamplesResponse {
    pub compile_error: Option<String>,
    pub results: Vec<SampleResultView>,
}

const VALID_JUDGE_MODES: [&str; 3] = ["io", "reference", "property"];

async fn conn_from(
    state: &AppState,
) -> Result<diesel_async::pooled_connection::deadpool::Object<diesel_async::AsyncPgConnection>, ApiError>
{
    get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))
}

fn challenge_notebook(challenge: &Challenge) -> Result<Uuid, ApiError> {
    challenge
        .notebook_id
        .ok_or_else(|| ApiError::Request("Desafio sem notebook vinculado".to_string()))
}

async fn require_notebook(
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

pub async fn api_list_challenges(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ChallengePublic>>, ApiError> {
    let mut conn = conn_from(&state).await?;
    let rows = challenge::list_public_challenges(&mut conn).await?;
    Ok(Json(rows.into_iter().map(ChallengePublic::from).collect()))
}

async fn challenge_detail(
    state: &AppState,
    headers: &HeaderMap,
    ch: Challenge,
) -> Result<Json<Value>, ApiError> {
    let user_id = extract_claims_from_header(headers)
        .await
        .ok()
        .map(|c| c.1.id);
    require_notebook(state, &ch, user_id, "notebook.view", &TargetCtx::default()).await?;

    let mut conn = conn_from(state).await?;
    let samples: Vec<TestCasePublic> = challenge::list_public_test_cases(&mut conn, ch.id).await?;
    let public = ChallengePublic::from(ch);
    Ok(Json(json!({
        "challenge": public,
        "sampleTests": samples,
    })))
}

pub async fn api_get_challenge(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let mut conn = conn_from(&state).await?;
    let ch = challenge::get_challenge_by_slug(&mut conn, &slug).await?;
    drop(conn);
    challenge_detail(&state, &headers, ch).await
}

pub async fn api_get_challenge_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let mut conn = conn_from(&state).await?;
    let ch = challenge::get_challenge_by_id(&mut conn, id).await?;
    drop(conn);
    challenge_detail(&state, &headers, ch).await
}

pub async fn api_create_challenge(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<CreateChallengeRequest>,
) -> Result<(StatusCode, Json<ChallengePublic>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        payload.notebook_id,
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let judge_mode = payload.judge_mode.unwrap_or_else(|| "io".to_string());
    if !VALID_JUDGE_MODES.contains(&judge_mode.as_str()) {
        return Err(ApiError::Request("Modo de julgamento inválido".to_string()));
    }
    if payload.slug.trim().is_empty() || payload.title.trim().is_empty() {
        return Err(ApiError::Request("slug e title são obrigatórios".to_string()));
    }
    if payload.languages.is_empty() {
        return Err(ApiError::Request(
            "Informe ao menos uma linguagem".to_string(),
        ));
    }

    let new_challenge = NewChallenge {
        id: Uuid::new_v4(),
        slug: payload.slug.trim().to_string(),
        title: payload.title.trim().to_string(),
        statement_md: payload.statement_md,
        difficulty: payload.difficulty.unwrap_or_else(|| "medium".to_string()),
        tags: json!(payload.tags.unwrap_or_default()),
        languages: json!(payload.languages),
        judge_mode,
        time_limit_ms: payload.time_limit_ms.unwrap_or(5000).clamp(500, 30000),
        mem_limit_kb: payload.mem_limit_kb.unwrap_or(262144).clamp(4096, 2097152),
        starter_code: payload.starter_code,
        reference_solution: None,
        reference_language: None,
        property_spec: payload.property_spec,
        team_id: payload.team_id,
        created_by: Some(user_id),
        visibility: payload.visibility.unwrap_or_else(|| "public".to_string()),
        notebook_id: Some(payload.notebook_id),
        block_id: payload.block_id,
        reference_solutions: None,
    };

    let mut conn = conn_from(&state).await?;
    let created = challenge::create_challenge(&mut conn, &new_challenge).await?;
    Ok((StatusCode::CREATED, Json(ChallengePublic::from(created))))
}

pub async fn api_update_challenge(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateChallengeRequest>,
) -> Result<Json<ChallengePublic>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    if let Some(mode) = &payload.judge_mode {
        if !VALID_JUDGE_MODES.contains(&mode.as_str()) {
            return Err(ApiError::Request("Modo de julgamento inválido".to_string()));
        }
    }

    let changes = UpdateChallenge {
        title: payload.title,
        statement_md: payload.statement_md,
        difficulty: payload.difficulty,
        judge_mode: payload.judge_mode,
        time_limit_ms: payload.time_limit_ms.map(|v| v.clamp(500, 30000)),
        mem_limit_kb: payload.mem_limit_kb.map(|v| v.clamp(4096, 2097152)),
        tags: payload.tags.map(|t| json!(t)),
        languages: payload.languages.map(|l| json!(l)),
        starter_code: payload.starter_code,
        property_spec: payload.property_spec,
        visibility: payload.visibility,
        updated_at: Some(chrono::Utc::now()),
    };

    let updated = challenge::update_challenge(&mut conn, id, &changes).await?;
    Ok(Json(ChallengePublic::from(updated)))
}

pub async fn api_add_test_case(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<CreateTestCaseRequest>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let new_case = NewTestCase {
        id: Uuid::new_v4(),
        challenge_id: id,
        input: payload.input,
        expected: payload.expected,
        is_hidden: payload.is_hidden.unwrap_or(true),
        weight: payload.weight.unwrap_or(1).max(0),
        ord: payload.ord.unwrap_or(0),
    };
    let created = challenge::create_test_case(&mut conn, &new_case).await?;
    Ok((StatusCode::CREATED, Json(json!({ "id": created.id }))))
}

pub async fn api_set_reference(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SetReferenceRequest>,
) -> Result<Json<ChallengePublic>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let updated =
        challenge::upsert_reference(&mut conn, id, &payload.solution, &payload.language).await?;
    Ok(Json(ChallengePublic::from(updated)))
}

pub async fn api_get_reference(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let ch = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &ch,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;
    Ok(Json(json!({
        "solutions": challenge::reference_map(&ch),
    })))
}

pub async fn api_delete_reference(
    State(state): State<Arc<AppState>>,
    Path((id, language)): Path<(Uuid, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let ch = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &ch,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;
    let updated = challenge::delete_reference(&mut conn, id, &language).await?;
    Ok(Json(json!({
        "solutions": challenge::reference_map(&updated),
    })))
}

pub async fn api_list_test_cases(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<TestCaseAuthoringView>>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let cases = challenge::list_test_cases(&mut conn, id).await?;
    Ok(Json(
        cases.into_iter().map(TestCaseAuthoringView::from).collect(),
    ))
}

pub async fn api_delete_test_case(
    State(state): State<Arc<AppState>>,
    Path((id, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    challenge::delete_test_case(&mut conn, id, case_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn api_submit(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SubmitRequest>,
) -> Result<(StatusCode, Json<SubmissionView>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let mut conn = conn_from(&state).await?;
    let ch = challenge::get_challenge_by_id(&mut conn, id).await?;

    let allowed_languages: Vec<String> = ch
        .languages
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if !allowed_languages.contains(&payload.language) {
        return Err(ApiError::Request(
            "Linguagem não permitida para este desafio".to_string(),
        ));
    }
    if payload.code.trim().is_empty() {
        return Err(ApiError::Request("Código vazio".to_string()));
    }

    require_notebook(
        &state,
        &ch,
        Some(user_id),
        &format!("notebook.blocks.{}.execute", payload.language),
        &TargetCtx {
            block_id: ch.block_id,
            block_type: Some(payload.language.clone()),
        },
    )
    .await?;

    let new_submission = NewSubmission {
        id: Uuid::new_v4(),
        challenge_id: id,
        user_id: Some(user_id),
        language: payload.language,
        code: payload.code,
        status: "queued".to_string(),
        max_score: 0,
    };
    let submission = challenge::create_submission(&mut conn, &new_submission).await?;

    {
        let state = state.clone();
        let submission_id = submission.id;
        tokio::spawn(async move {
            judge_submission(state, submission_id).await;
        });
    }

    Ok((StatusCode::ACCEPTED, Json(submission.into_view(Vec::new()))))
}

pub async fn api_run_samples(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SubmitRequest>,
) -> Result<Json<RunSamplesResponse>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let mut conn = conn_from(&state).await?;
    let ch = challenge::get_challenge_by_id(&mut conn, id).await?;

    let allowed_languages: Vec<String> = ch
        .languages
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if !allowed_languages.contains(&payload.language) {
        return Err(ApiError::Request(
            "Linguagem não permitida para este desafio".to_string(),
        ));
    }
    if payload.code.trim().is_empty() {
        return Err(ApiError::Request("Código vazio".to_string()));
    }

    require_notebook(
        &state,
        &ch,
        Some(user_id),
        &format!("notebook.blocks.{}.execute", payload.language),
        &TargetCtx {
            block_id: ch.block_id,
            block_type: Some(payload.language.clone()),
        },
    )
    .await?;

    let samples = challenge::list_public_test_cases(&mut conn, id).await?;
    let limits = limits_for(ch.time_limit_ms, ch.mem_limit_kb);
    let session = format!("run_{}", Uuid::new_v4());

    let _permit = state.judge_semaphore.clone().acquire_owned().await;

    let bin = match compile_code(&payload.language, &payload.code, &session).await {
        Ok(b) => b,
        Err(msg) => {
            let trimmed: String = msg.chars().take(2000).collect();
            return Ok(Json(RunSamplesResponse {
                compile_error: Some(trimmed),
                results: Vec::new(),
            }));
        }
    };

    let mut results = Vec::new();
    for case in samples {
        let run = run_compiled(&bin, Some(&case.input), limits).await;
        let verdict = match run.verdict {
            ExecVerdict::CompileError => "CE",
            ExecVerdict::Timeout => "TLE",
            ExecVerdict::RuntimeError => "RE",
            ExecVerdict::Ok => match &case.expected {
                Some(exp) if normalize(&run.stdout) == normalize(exp) => "AC",
                Some(_) => "WA",
                None => "SKIP",
            },
        };
        let stderr = if run.stderr.trim().is_empty() {
            None
        } else {
            Some(run.stderr.chars().take(2000).collect())
        };
        results.push(SampleResultView {
            input: case.input,
            expected: case.expected,
            stdout: run.stdout.chars().take(4000).collect(),
            stderr,
            verdict: verdict.to_string(),
        });
    }

    Ok(Json(RunSamplesResponse {
        compile_error: None,
        results,
    }))
}

pub async fn api_get_submission(
    State(state): State<Arc<AppState>>,
    Path(submission_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<SubmissionView>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let submission = challenge::get_submission(&mut conn, submission_id).await?;

    let is_owner = submission.user_id == Some(claims.id);
    let role = crate::controllers::session::role_in_db(&mut conn, &claims.id).await?;

    if !is_owner && role != UserRole::Admin {
        let ch = challenge::get_challenge_by_id(&mut conn, submission.challenge_id).await?;
        require_notebook(
            &state,
            &ch,
            Some(claims.id),
            "notebook.edit",
            &TargetCtx::default(),
        )
        .await?;
    }

    let results = challenge::list_submission_results(&mut conn, submission_id)
        .await?
        .into_iter()
        .map(|r| r.into_view())
        .collect();

    Ok(Json(submission.into_view(results)))
}

pub async fn api_list_my_submissions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<SubmissionView>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let mut conn = conn_from(&state).await?;
    let rows = challenge::list_user_submissions(&mut conn, id, user_id).await?;
    Ok(Json(
        rows.into_iter().map(|s| s.into_view(Vec::new())).collect(),
    ))
}

pub async fn api_leaderboard(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<LeaderboardEntry>>, ApiError> {
    let user_id = extract_claims_from_header(&headers)
        .await
        .ok()
        .map(|c| c.1.id);
    let mut conn = conn_from(&state).await?;
    let ch = challenge::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(&state, &ch, user_id, "notebook.view", &TargetCtx::default()).await?;
    let done = challenge::list_done_submissions(&mut conn, id).await?;

    let mut seen: std::collections::HashSet<Uuid> = std::collections::HashSet::new();
    let mut entries: Vec<LeaderboardEntry> = Vec::new();
    for s in done {
        let Some(uid) = s.user_id else {
            continue;
        };
        if !seen.insert(uid) {
            continue;
        }
        let author_name = crate::models::user::find_user_by_id(&mut conn, &uid)
            .await
            .map(|u| u.name)
            .unwrap_or_else(|_| "Usuário".to_string());
        entries.push(LeaderboardEntry {
            submission_id: s.id,
            user_id: uid,
            author_name,
            score: s.score,
            max_score: s.max_score,
            runtime_ms: s.runtime_ms,
            created_at: s.created_at,
        });
    }
    Ok(Json(entries))
}
