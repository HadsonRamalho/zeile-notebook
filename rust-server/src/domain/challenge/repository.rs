use chrono::Utc;
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde_json::Value;
use uuid::Uuid;

use crate::models::error::ApiError;
use crate::schema::{
    challenge_submission_results, challenge_submissions, challenge_test_cases, challenges,
    notebooks,
};

use crate::domain::notebook::Language;

use super::entity::{
    Challenge, NewChallenge, NewSubmission, NewSubmissionResult, NewTestCase, Submission,
    SubmissionResult, SubmissionStatus, TestCase, UpdateChallenge,
};

pub async fn create_challenge(
    conn: &mut AsyncPgConnection,
    new_challenge: &NewChallenge,
) -> Result<Challenge, ApiError> {
    diesel::insert_into(challenges::table)
        .values(new_challenge)
        .get_result::<Challenge>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn get_challenge_by_id(
    conn: &mut AsyncPgConnection,
    id: Uuid,
) -> Result<Challenge, ApiError> {
    challenges::table
        .find(id)
        .get_result::<Challenge>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn get_challenge_by_slug(
    conn: &mut AsyncPgConnection,
    slug: &str,
) -> Result<Challenge, ApiError> {
    challenges::table
        .filter(challenges::slug.eq(slug))
        .get_result::<Challenge>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_public_challenges(
    conn: &mut AsyncPgConnection,
) -> Result<Vec<Challenge>, ApiError> {
    challenges::table
        .inner_join(notebooks::table)
        .filter(notebooks::is_public.eq(true))
        .order(challenges::created_at.desc())
        .select(Challenge::as_select())
        .load::<Challenge>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn update_challenge(
    conn: &mut AsyncPgConnection,
    id: Uuid,
    changes: &UpdateChallenge,
) -> Result<Challenge, ApiError> {
    diesel::update(challenges::table.find(id))
        .set(changes)
        .get_result::<Challenge>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn upsert_reference(
    conn: &mut AsyncPgConnection,
    id: Uuid,
    solution: &str,
    language: Language,
) -> Result<Challenge, ApiError> {
    let current = get_challenge_by_id(conn, id).await?;
    let mut map = match current.reference_solutions {
        Some(Value::Object(m)) => m,
        _ => serde_json::Map::new(),
    };
    map.insert(language.to_string(), Value::String(solution.to_string()));

    diesel::update(challenges::table.find(id))
        .set((
            challenges::reference_solutions.eq(Some(Value::Object(map))),
            challenges::reference_solution.eq(Some(solution)),
            challenges::reference_language.eq(Some(language)),
            challenges::updated_at.eq(Utc::now()),
        ))
        .get_result::<Challenge>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn delete_reference(
    conn: &mut AsyncPgConnection,
    id: Uuid,
    language: Language,
) -> Result<Challenge, ApiError> {
    let current = get_challenge_by_id(conn, id).await?;
    let mut map = match current.reference_solutions {
        Some(Value::Object(m)) => m,
        _ => serde_json::Map::new(),
    };
    map.remove(&language.to_string());

    diesel::update(challenges::table.find(id))
        .set((
            challenges::reference_solutions.eq(Some(Value::Object(map))),
            challenges::updated_at.eq(Utc::now()),
        ))
        .get_result::<Challenge>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn create_test_case(
    conn: &mut AsyncPgConnection,
    new_case: &NewTestCase,
) -> Result<TestCase, ApiError> {
    diesel::insert_into(challenge_test_cases::table)
        .values(new_case)
        .get_result::<TestCase>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_test_cases(
    conn: &mut AsyncPgConnection,
    challenge_id: Uuid,
) -> Result<Vec<TestCase>, ApiError> {
    challenge_test_cases::table
        .filter(challenge_test_cases::challenge_id.eq(challenge_id))
        .order(challenge_test_cases::ord.asc())
        .load::<TestCase>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_public_test_cases(
    conn: &mut AsyncPgConnection,
    challenge_id: Uuid,
) -> Result<Vec<super::dto::TestCasePublic>, ApiError> {
    let rows = challenge_test_cases::table
        .filter(challenge_test_cases::challenge_id.eq(challenge_id))
        .filter(challenge_test_cases::is_hidden.eq(false))
        .order(challenge_test_cases::ord.asc())
        .load::<TestCase>(conn)
        .await
        .map_err(ApiError::from)?;
    Ok(rows
        .into_iter()
        .map(|t| super::dto::TestCasePublic {
            id: t.id,
            input: t.input,
            expected: t.expected,
            weight: t.weight,
            ord: t.ord,
        })
        .collect())
}

pub async fn delete_test_case(
    conn: &mut AsyncPgConnection,
    challenge_id: Uuid,
    case_id: Uuid,
) -> Result<(), ApiError> {
    diesel::delete(
        challenge_test_cases::table
            .filter(challenge_test_cases::id.eq(case_id))
            .filter(challenge_test_cases::challenge_id.eq(challenge_id)),
    )
    .execute(conn)
    .await
    .map(|_| ())
    .map_err(ApiError::from)
}

pub async fn create_submission(
    conn: &mut AsyncPgConnection,
    new_submission: &NewSubmission,
) -> Result<Submission, ApiError> {
    diesel::insert_into(challenge_submissions::table)
        .values(new_submission)
        .get_result::<Submission>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn get_submission(
    conn: &mut AsyncPgConnection,
    id: Uuid,
) -> Result<Submission, ApiError> {
    challenge_submissions::table
        .find(id)
        .get_result::<Submission>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn set_submission_running(
    conn: &mut AsyncPgConnection,
    id: Uuid,
) -> Result<(), ApiError> {
    diesel::update(challenge_submissions::table.find(id))
        .set(challenge_submissions::status.eq(SubmissionStatus::Running))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(ApiError::from)
}

pub async fn finalize_submission(
    conn: &mut AsyncPgConnection,
    id: Uuid,
    status: SubmissionStatus,
    score: i32,
    max_score: i32,
    runtime_ms: i32,
    error_message: Option<&str>,
) -> Result<(), ApiError> {
    diesel::update(challenge_submissions::table.find(id))
        .set((
            challenge_submissions::status.eq(status),
            challenge_submissions::score.eq(score),
            challenge_submissions::max_score.eq(max_score),
            challenge_submissions::runtime_ms.eq(runtime_ms),
            challenge_submissions::error_message.eq(error_message),
            challenge_submissions::judged_at.eq(Some(Utc::now())),
        ))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(ApiError::from)
}

pub async fn insert_submission_results(
    conn: &mut AsyncPgConnection,
    results: &[NewSubmissionResult],
) -> Result<(), ApiError> {
    if results.is_empty() {
        return Ok(());
    }
    diesel::insert_into(challenge_submission_results::table)
        .values(results)
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(ApiError::from)
}

pub async fn list_submission_results(
    conn: &mut AsyncPgConnection,
    submission_id: Uuid,
) -> Result<Vec<SubmissionResult>, ApiError> {
    challenge_submission_results::table
        .filter(challenge_submission_results::submission_id.eq(submission_id))
        .order(challenge_submission_results::ord.asc())
        .load::<SubmissionResult>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_user_submissions(
    conn: &mut AsyncPgConnection,
    challenge_id: Uuid,
    user_id: Uuid,
) -> Result<Vec<Submission>, ApiError> {
    challenge_submissions::table
        .filter(challenge_submissions::challenge_id.eq(challenge_id))
        .filter(challenge_submissions::user_id.eq(user_id))
        .order(challenge_submissions::created_at.desc())
        .limit(100)
        .load::<Submission>(conn)
        .await
        .map_err(ApiError::from)
}

pub async fn list_done_submissions(
    conn: &mut AsyncPgConnection,
    challenge_id: Uuid,
) -> Result<Vec<Submission>, ApiError> {
    challenge_submissions::table
        .filter(challenge_submissions::challenge_id.eq(challenge_id))
        .filter(challenge_submissions::status.eq(SubmissionStatus::Done))
        .order((
            challenge_submissions::score.desc(),
            challenge_submissions::runtime_ms.asc(),
        ))
        .load::<Submission>(conn)
        .await
        .map_err(ApiError::from)
}
