use crate::models::error::ApiError;
use crate::schema::{
    challenge_submission_results, challenge_submissions, challenge_test_cases, challenges,
};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = crate::schema::challenges)]
pub struct Challenge {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub statement_md: String,
    pub difficulty: String,
    pub tags: Value,
    pub languages: Value,
    pub judge_mode: String,
    pub time_limit_ms: i32,
    pub mem_limit_kb: i32,
    pub starter_code: Option<Value>,
    pub reference_solution: Option<String>,
    pub reference_language: Option<String>,
    pub property_spec: Option<Value>,
    pub team_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub visibility: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = challenges)]
pub struct NewChallenge {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub statement_md: String,
    pub difficulty: String,
    pub tags: Value,
    pub languages: Value,
    pub judge_mode: String,
    pub time_limit_ms: i32,
    pub mem_limit_kb: i32,
    pub starter_code: Option<Value>,
    pub reference_solution: Option<String>,
    pub reference_language: Option<String>,
    pub property_spec: Option<Value>,
    pub team_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub visibility: String,
}

#[derive(AsChangeset, Default)]
#[diesel(table_name = challenges)]
pub struct UpdateChallenge {
    pub title: Option<String>,
    pub statement_md: Option<String>,
    pub difficulty: Option<String>,
    pub judge_mode: Option<String>,
    pub time_limit_ms: Option<i32>,
    pub mem_limit_kb: Option<i32>,
    pub tags: Option<Value>,
    pub languages: Option<Value>,
    pub starter_code: Option<Value>,
    pub property_spec: Option<Value>,
    pub visibility: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct ChallengePublic {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    #[serde(rename = "statementMd")]
    pub statement_md: String,
    pub difficulty: String,
    pub tags: Value,
    pub languages: Value,
    #[serde(rename = "judgeMode")]
    pub judge_mode: String,
    #[serde(rename = "timeLimitMs")]
    pub time_limit_ms: i32,
    #[serde(rename = "memLimitKb")]
    pub mem_limit_kb: i32,
    #[serde(rename = "starterCode")]
    pub starter_code: Option<Value>,
    #[serde(rename = "teamId")]
    pub team_id: Option<Uuid>,
    pub visibility: String,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}

impl From<Challenge> for ChallengePublic {
    fn from(c: Challenge) -> Self {
        ChallengePublic {
            id: c.id,
            slug: c.slug,
            title: c.title,
            statement_md: c.statement_md,
            difficulty: c.difficulty,
            tags: c.tags,
            languages: c.languages,
            judge_mode: c.judge_mode,
            time_limit_ms: c.time_limit_ms,
            mem_limit_kb: c.mem_limit_kb,
            starter_code: c.starter_code,
            team_id: c.team_id,
            visibility: c.visibility,
            created_at: c.created_at,
        }
    }
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = crate::schema::challenge_test_cases)]
pub struct TestCase {
    pub id: Uuid,
    pub challenge_id: Uuid,
    pub input: String,
    pub expected: Option<String>,
    pub is_hidden: bool,
    pub weight: i32,
    pub ord: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = challenge_test_cases)]
pub struct NewTestCase {
    pub id: Uuid,
    pub challenge_id: Uuid,
    pub input: String,
    pub expected: Option<String>,
    pub is_hidden: bool,
    pub weight: i32,
    pub ord: i32,
}

#[derive(Serialize)]
pub struct TestCasePublic {
    pub id: Uuid,
    pub input: String,
    pub expected: Option<String>,
    pub weight: i32,
    pub ord: i32,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = crate::schema::challenge_submissions)]
pub struct Submission {
    pub id: Uuid,
    pub challenge_id: Uuid,
    pub user_id: Option<Uuid>,
    pub language: String,
    pub code: String,
    pub status: String,
    pub score: i32,
    pub max_score: i32,
    pub runtime_ms: i32,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub judged_at: Option<DateTime<Utc>>,
}

#[derive(Insertable)]
#[diesel(table_name = challenge_submissions)]
pub struct NewSubmission {
    pub id: Uuid,
    pub challenge_id: Uuid,
    pub user_id: Option<Uuid>,
    pub language: String,
    pub code: String,
    pub status: String,
    pub max_score: i32,
}

#[derive(Serialize)]
pub struct SubmissionView {
    pub id: Uuid,
    #[serde(rename = "challengeId")]
    pub challenge_id: Uuid,
    #[serde(rename = "userId")]
    pub user_id: Option<Uuid>,
    pub language: String,
    pub status: String,
    pub score: i32,
    #[serde(rename = "maxScore")]
    pub max_score: i32,
    #[serde(rename = "runtimeMs")]
    pub runtime_ms: i32,
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "judgedAt")]
    pub judged_at: Option<DateTime<Utc>>,
    pub results: Vec<SubmissionResultView>,
}

#[derive(Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::challenge_submission_results)]
pub struct SubmissionResult {
    pub id: Uuid,
    pub submission_id: Uuid,
    pub test_case_id: Option<Uuid>,
    pub verdict: String,
    pub runtime_ms: i32,
    pub is_hidden: bool,
    pub stderr_snippet: Option<String>,
    pub ord: i32,
}

#[derive(Insertable)]
#[diesel(table_name = challenge_submission_results)]
pub struct NewSubmissionResult {
    pub id: Uuid,
    pub submission_id: Uuid,
    pub test_case_id: Option<Uuid>,
    pub verdict: String,
    pub runtime_ms: i32,
    pub is_hidden: bool,
    pub stderr_snippet: Option<String>,
    pub ord: i32,
}

#[derive(Serialize)]
pub struct SubmissionResultView {
    #[serde(rename = "testCaseId")]
    pub test_case_id: Option<Uuid>,
    pub verdict: String,
    #[serde(rename = "runtimeMs")]
    pub runtime_ms: i32,
    #[serde(rename = "isHidden")]
    pub is_hidden: bool,
    #[serde(rename = "stderrSnippet")]
    pub stderr_snippet: Option<String>,
    pub ord: i32,
}

impl SubmissionResult {
    pub fn into_view(self) -> SubmissionResultView {
        let snippet = if self.is_hidden {
            None
        } else {
            self.stderr_snippet
        };
        SubmissionResultView {
            test_case_id: if self.is_hidden {
                None
            } else {
                self.test_case_id
            },
            verdict: self.verdict,
            runtime_ms: self.runtime_ms,
            is_hidden: self.is_hidden,
            stderr_snippet: snippet,
            ord: self.ord,
        }
    }
}

#[derive(Serialize)]
pub struct LeaderboardEntry {
    #[serde(rename = "userId")]
    pub user_id: Uuid,
    #[serde(rename = "authorName")]
    pub author_name: String,
    pub score: i32,
    #[serde(rename = "maxScore")]
    pub max_score: i32,
    #[serde(rename = "runtimeMs")]
    pub runtime_ms: i32,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
}

pub async fn create_challenge(
    conn: &mut AsyncPgConnection,
    new_challenge: &NewChallenge,
) -> Result<Challenge, ApiError> {
    diesel::insert_into(challenges::table)
        .values(new_challenge)
        .get_result::<Challenge>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn get_challenge_by_id(
    conn: &mut AsyncPgConnection,
    id: Uuid,
) -> Result<Challenge, ApiError> {
    challenges::table
        .find(id)
        .get_result::<Challenge>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn get_challenge_by_slug(
    conn: &mut AsyncPgConnection,
    slug: &str,
) -> Result<Challenge, ApiError> {
    challenges::table
        .filter(challenges::slug.eq(slug))
        .get_result::<Challenge>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_public_challenges(
    conn: &mut AsyncPgConnection,
) -> Result<Vec<Challenge>, ApiError> {
    challenges::table
        .filter(challenges::visibility.eq("public"))
        .order(challenges::created_at.desc())
        .load::<Challenge>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
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
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn set_reference_solution(
    conn: &mut AsyncPgConnection,
    id: Uuid,
    solution: &str,
    language: &str,
) -> Result<Challenge, ApiError> {
    diesel::update(challenges::table.find(id))
        .set((
            challenges::reference_solution.eq(Some(solution)),
            challenges::reference_language.eq(Some(language)),
            challenges::updated_at.eq(Utc::now()),
        ))
        .get_result::<Challenge>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn create_test_case(
    conn: &mut AsyncPgConnection,
    new_case: &NewTestCase,
) -> Result<TestCase, ApiError> {
    diesel::insert_into(challenge_test_cases::table)
        .values(new_case)
        .get_result::<TestCase>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
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
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_public_test_cases(
    conn: &mut AsyncPgConnection,
    challenge_id: Uuid,
) -> Result<Vec<TestCasePublic>, ApiError> {
    let rows = challenge_test_cases::table
        .filter(challenge_test_cases::challenge_id.eq(challenge_id))
        .filter(challenge_test_cases::is_hidden.eq(false))
        .order(challenge_test_cases::ord.asc())
        .load::<TestCase>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))?;
    Ok(rows
        .into_iter()
        .map(|t| TestCasePublic {
            id: t.id,
            input: t.input,
            expected: t.expected,
            weight: t.weight,
            ord: t.ord,
        })
        .collect())
}

pub async fn create_submission(
    conn: &mut AsyncPgConnection,
    new_submission: &NewSubmission,
) -> Result<Submission, ApiError> {
    diesel::insert_into(challenge_submissions::table)
        .values(new_submission)
        .get_result::<Submission>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn get_submission(
    conn: &mut AsyncPgConnection,
    id: Uuid,
) -> Result<Submission, ApiError> {
    challenge_submissions::table
        .find(id)
        .get_result::<Submission>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn set_submission_running(
    conn: &mut AsyncPgConnection,
    id: Uuid,
) -> Result<(), ApiError> {
    diesel::update(challenge_submissions::table.find(id))
        .set(challenge_submissions::status.eq("running"))
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn finalize_submission(
    conn: &mut AsyncPgConnection,
    id: Uuid,
    status: &str,
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
        .map_err(|e| ApiError::Database(e.to_string()))
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
        .map_err(|e| ApiError::Database(e.to_string()))
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
        .map_err(|e| ApiError::Database(e.to_string()))
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
        .map_err(|e| ApiError::Database(e.to_string()))
}

pub async fn list_done_submissions(
    conn: &mut AsyncPgConnection,
    challenge_id: Uuid,
) -> Result<Vec<Submission>, ApiError> {
    challenge_submissions::table
        .filter(challenge_submissions::challenge_id.eq(challenge_id))
        .filter(challenge_submissions::status.eq("done"))
        .order((
            challenge_submissions::score.desc(),
            challenge_submissions::runtime_ms.asc(),
        ))
        .load::<Submission>(conn)
        .await
        .map_err(|e| ApiError::Database(e.to_string()))
}
