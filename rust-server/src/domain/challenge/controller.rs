use std::sync::Arc;

use axum::{
    Json,
    extract::{Path, State},
};
use hyper::{HeaderMap, StatusCode};
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

use crate::controllers::jwt::extract_claims_from_header;
use crate::controllers::permissions::{TargetCtx, require};
use crate::controllers::utils::get_conn;
use crate::domain::notebook::Language;
use crate::domain::user::UserRole;
use crate::executor::{ExecVerdict, compile_code, run_compiled};
use crate::models::error::ApiError;
use crate::models::state::AppState;

use super::dto::{
    ChallengeDetail, ChallengePublic, CreateChallengeRequest, CreateTestCaseRequest,
    LeaderboardEntry, ReferenceSolutionsResponse, RunSamplesResponse, SampleResultView,
    SetReferenceRequest, SubmissionView, SubmitRequest, TestCaseAuthoringView,
    TestCaseCreatedResponse, TestCasePublic, UpdateChallengeRequest,
};
use super::entity::{
    Challenge, ChallengeDifficulty, JudgeMode, NewChallenge, NewSubmission, NewTestCase,
    SubmissionStatus, UpdateChallenge, Verdict,
};
use super::judge::{judge_submission, limits_for, normalize};
use super::repository;
use super::service::require_notebook;

async fn conn_from(
    state: &AppState,
) -> Result<
    diesel_async::pooled_connection::deadpool::Object<diesel_async::AsyncPgConnection>,
    ApiError,
> {
    get_conn(&state.pool)
        .await
        .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))
}

#[utoipa::path(get, path = "/challenge/list", responses((status = OK, body = Vec<ChallengePublic>), (status = 401, body = ApiError)))]
pub async fn api_list_challenges(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ChallengePublic>>, ApiError> {
    let mut conn = conn_from(&state).await?;
    let rows = repository::list_public_challenges(&mut conn).await?;
    Ok(Json(rows.into_iter().map(ChallengePublic::from).collect()))
}

async fn challenge_detail(
    state: &AppState,
    headers: &HeaderMap,
    ch: Challenge,
) -> Result<Json<ChallengeDetail>, ApiError> {
    let user_id = extract_claims_from_header(headers)
        .await
        .ok()
        .map(|c| c.1.id);
    require_notebook(state, &ch, user_id, "notebook.view", &TargetCtx::default()).await?;

    let mut conn = conn_from(state).await?;
    let sample_tests: Vec<TestCasePublic> =
        repository::list_public_test_cases(&mut conn, ch.id).await?;
    let challenge = ChallengePublic::from(ch);
    Ok(Json(ChallengeDetail {
        challenge,
        sample_tests,
    }))
}

#[utoipa::path(get, path = "/challenge/slug/{slug}", responses((status = OK, body = ChallengeDetail), (status = 401, body = ApiError)))]
pub async fn api_get_challenge(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ChallengeDetail>, ApiError> {
    let mut conn = conn_from(&state).await?;
    let ch = repository::get_challenge_by_slug(&mut conn, &slug).await?;
    drop(conn);
    challenge_detail(&state, &headers, ch).await
}

#[utoipa::path(get, path = "/challenge/{id}", responses((status = OK, body = ChallengeDetail), (status = 401, body = ApiError)))]
pub async fn api_get_challenge_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<ChallengeDetail>, ApiError> {
    let mut conn = conn_from(&state).await?;
    let ch = repository::get_challenge_by_id(&mut conn, id).await?;
    drop(conn);
    challenge_detail(&state, &headers, ch).await
}

#[utoipa::path(post, path = "/challenge/create", request_body = CreateChallengeRequest, responses((status = CREATED, body = ChallengePublic), (status = 401, body = ApiError)))]
pub async fn api_create_challenge(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<CreateChallengeRequest>,
) -> Result<(StatusCode, Json<ChallengePublic>), ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let user_id = extract_claims_from_header(&headers).await?.1.id;

    require(
        &state.pool,
        Some(user_id),
        payload.notebook_id,
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let judge_mode = payload.judge_mode.unwrap_or(JudgeMode::Io);
    if payload.slug.trim().is_empty() || payload.title.trim().is_empty() {
        return Err(ApiError::Request(
            "slug e title são obrigatórios".to_string(),
        ));
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
        difficulty: payload.difficulty.unwrap_or(ChallengeDifficulty::Medium),
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
    let created = repository::create_challenge(&mut conn, &new_challenge).await?;
    Ok((StatusCode::CREATED, Json(ChallengePublic::from(created))))
}

#[utoipa::path(put, path = "/challenge/{id}", request_body = UpdateChallengeRequest, responses((status = OK, body = ChallengePublic), (status = 401, body = ApiError)))]
pub async fn api_update_challenge(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<UpdateChallengeRequest>,
) -> Result<Json<ChallengePublic>, ApiError> {
    if let Err(errors) = payload.validate() {
        return Err(ApiError::Request(errors.to_string()));
    }

    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = repository::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

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

    let updated = repository::update_challenge(&mut conn, id, &changes).await?;
    Ok(Json(ChallengePublic::from(updated)))
}

#[utoipa::path(post, path = "/challenge/{id}/test-cases", request_body = CreateTestCaseRequest, responses((status = CREATED, body = TestCaseCreatedResponse), (status = 401, body = ApiError)))]
pub async fn api_add_test_case(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<CreateTestCaseRequest>,
) -> Result<(StatusCode, Json<TestCaseCreatedResponse>), ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = repository::get_challenge_by_id(&mut conn, id).await?;
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
    let created = repository::create_test_case(&mut conn, &new_case).await?;
    Ok((
        StatusCode::CREATED,
        Json(TestCaseCreatedResponse { id: created.id }),
    ))
}

#[utoipa::path(post, path = "/challenge/{id}/reference", request_body = SetReferenceRequest, responses((status = CREATED, body = ChallengePublic), (status = 401, body = ApiError)))]
pub async fn api_set_reference(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SetReferenceRequest>,
) -> Result<Json<ChallengePublic>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = repository::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let updated =
        repository::upsert_reference(&mut conn, id, &payload.solution, payload.language).await?;
    Ok(Json(ChallengePublic::from(updated)))
}

#[utoipa::path(get, path = "/challenge/{id}/reference", responses((status = OK, body = ReferenceSolutionsResponse), (status = 401, body = ApiError)))]
pub async fn api_get_reference(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<ReferenceSolutionsResponse>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let ch = repository::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &ch,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;
    Ok(Json(ReferenceSolutionsResponse {
        solutions: super::service::reference_map(&ch),
    }))
}

#[utoipa::path(delete, path = "/challenge/{id}/reference/{language}", responses((status = OK, body = ReferenceSolutionsResponse), (status = 401, body = ApiError)))]
pub async fn api_delete_reference(
    State(state): State<Arc<AppState>>,
    Path((id, language)): Path<(Uuid, Language)>,
    headers: HeaderMap,
) -> Result<Json<ReferenceSolutionsResponse>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let ch = repository::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &ch,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;
    let updated = repository::delete_reference(&mut conn, id, language).await?;
    Ok(Json(ReferenceSolutionsResponse {
        solutions: super::service::reference_map(&updated),
    }))
}

#[utoipa::path(get, path = "/challenge/{id}/test-cases", responses((status = OK, body = Vec<TestCaseAuthoringView>), (status = 401, body = ApiError)))]
pub async fn api_list_test_cases(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<TestCaseAuthoringView>>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = repository::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    let cases = repository::list_test_cases(&mut conn, id).await?;
    Ok(Json(
        cases.into_iter().map(TestCaseAuthoringView::from).collect(),
    ))
}

#[utoipa::path(delete, path = "/challenge/{id}/test-cases/{case_id}", responses((status = OK), (status = 401, body = ApiError)))]
pub async fn api_delete_test_case(
    State(state): State<Arc<AppState>>,
    Path((id, case_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let existing = repository::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(
        &state,
        &existing,
        Some(claims.id),
        "notebook.edit",
        &TargetCtx::default(),
    )
    .await?;

    repository::delete_test_case(&mut conn, id, case_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(post, path = "/challenge/{id}/submit", request_body = SubmitRequest, responses((status = CREATED, body = SubmissionView), (status = 401, body = ApiError)))]
pub async fn api_submit(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SubmitRequest>,
) -> Result<(StatusCode, Json<SubmissionView>), ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let mut conn = conn_from(&state).await?;
    let ch = repository::get_challenge_by_id(&mut conn, id).await?;

    let allowed_languages: Vec<String> = ch
        .languages
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if !allowed_languages.contains(&payload.language.to_string()) {
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
            block_type: Some(payload.language.to_string()),
        },
    )
    .await?;

    let new_submission = NewSubmission {
        id: Uuid::new_v4(),
        challenge_id: id,
        user_id: Some(user_id),
        language: payload.language,
        code: payload.code,
        status: SubmissionStatus::Queued,
        max_score: 0,
    };
    let submission = repository::create_submission(&mut conn, &new_submission).await?;

    {
        let state = state.clone();
        let submission_id = submission.id;
        tokio::spawn(async move {
            judge_submission(state, submission_id).await;
        });
    }

    Ok((StatusCode::ACCEPTED, Json(submission.into_view(Vec::new()))))
}

#[utoipa::path(post, path = "/challenge/{id}/run", request_body = SubmitRequest, responses((status = CREATED, body = RunSamplesResponse), (status = 401, body = ApiError)))]
pub async fn api_run_samples(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(payload): Json<SubmitRequest>,
) -> Result<Json<RunSamplesResponse>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let mut conn = conn_from(&state).await?;
    let ch = repository::get_challenge_by_id(&mut conn, id).await?;

    let allowed_languages: Vec<String> = ch
        .languages
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if !allowed_languages.contains(&payload.language.to_string()) {
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
            block_type: Some(payload.language.to_string()),
        },
    )
    .await?;

    let samples = repository::list_public_test_cases(&mut conn, id).await?;
    let limits = limits_for(ch.time_limit_ms, ch.mem_limit_kb);
    let session = format!("run_{}", Uuid::new_v4());

    let _permit = state.judge_semaphore.clone().acquire_owned().await;

    let bin = match compile_code(&payload.language.to_string(), &payload.code, &session).await {
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
            ExecVerdict::CompileError => Verdict::Ce,
            ExecVerdict::Timeout => Verdict::Tle,
            ExecVerdict::RuntimeError => Verdict::Re,
            ExecVerdict::Ok => match &case.expected {
                Some(exp) if normalize(&run.stdout) == normalize(exp) => Verdict::Ac,
                Some(_) => Verdict::Wa,
                None => Verdict::Skip,
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
            verdict,
        });
    }

    Ok(Json(RunSamplesResponse {
        compile_error: None,
        results,
    }))
}

#[utoipa::path(get, path = "/challenge/submissions/{submission_id}", responses((status = OK, body = SubmissionView), (status = 401, body = ApiError)))]
pub async fn api_get_submission(
    State(state): State<Arc<AppState>>,
    Path(submission_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<SubmissionView>, ApiError> {
    let claims = extract_claims_from_header(&headers).await?.1;
    let mut conn = conn_from(&state).await?;
    let submission = repository::get_submission(&mut conn, submission_id).await?;

    let is_owner = submission.user_id == Some(claims.id);
    let role = crate::controllers::session::role_in_db(&mut conn, &claims.id).await?;

    if !is_owner && role != UserRole::Admin {
        let ch = repository::get_challenge_by_id(&mut conn, submission.challenge_id).await?;
        require_notebook(
            &state,
            &ch,
            Some(claims.id),
            "notebook.edit",
            &TargetCtx::default(),
        )
        .await?;
    }

    let results = repository::list_submission_results(&mut conn, submission_id)
        .await?
        .into_iter()
        .map(|r| r.into_view())
        .collect();

    Ok(Json(submission.into_view(results)))
}

#[utoipa::path(get, path = "/challenge/{id}/submissions", responses((status = OK, body = Vec<SubmissionView>), (status = 401, body = ApiError)))]
pub async fn api_list_my_submissions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<SubmissionView>>, ApiError> {
    let user_id = extract_claims_from_header(&headers).await?.1.id;
    let mut conn = conn_from(&state).await?;
    let rows = repository::list_user_submissions(&mut conn, id, user_id).await?;
    Ok(Json(
        rows.into_iter().map(|s| s.into_view(Vec::new())).collect(),
    ))
}

#[utoipa::path(get, path = "/challenge/{id}/leaderboard", responses((status = OK, body = Vec<LeaderboardEntry>), (status = 401, body = ApiError)))]
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
    let ch = repository::get_challenge_by_id(&mut conn, id).await?;
    require_notebook(&state, &ch, user_id, "notebook.view", &TargetCtx::default()).await?;
    let done = repository::list_done_submissions(&mut conn, id).await?;

    let mut seen: std::collections::HashSet<Uuid> = std::collections::HashSet::new();
    let mut entries: Vec<LeaderboardEntry> = Vec::new();
    for s in done {
        let Some(uid) = s.user_id else {
            continue;
        };
        if !seen.insert(uid) {
            continue;
        }
        let author_name = crate::domain::user::find_user_by_id(&mut conn, &uid)
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
