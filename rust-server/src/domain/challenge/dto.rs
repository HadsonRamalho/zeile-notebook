use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;
use validator::Validate;

use super::entity::{Challenge, Submission, SubmissionResult, TestCase};

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChallengePublic {
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
    pub property_spec: Option<Value>,
    pub team_id: Option<Uuid>,
    pub notebook_id: Option<Uuid>,
    pub block_id: Option<Uuid>,
    pub visibility: String,
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
            property_spec: c.property_spec,
            team_id: c.team_id,
            notebook_id: c.notebook_id,
            block_id: c.block_id,
            visibility: c.visibility,
            created_at: c.created_at,
        }
    }
}

#[derive(serde::Serialize)]
pub struct TestCasePublic {
    pub id: Uuid,
    pub input: String,
    pub expected: Option<String>,
    pub weight: i32,
    pub ord: i32,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TestCaseAuthoringView {
    pub id: Uuid,
    pub input: String,
    pub expected: Option<String>,
    pub is_hidden: bool,
    pub weight: i32,
    pub ord: i32,
}

impl From<TestCase> for TestCaseAuthoringView {
    fn from(t: TestCase) -> Self {
        TestCaseAuthoringView {
            id: t.id,
            input: t.input,
            expected: t.expected,
            is_hidden: t.is_hidden,
            weight: t.weight,
            ord: t.ord,
        }
    }
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionView {
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
    pub results: Vec<SubmissionResultView>,
}

impl Submission {
    pub fn into_view(self, results: Vec<SubmissionResultView>) -> SubmissionView {
        SubmissionView {
            id: self.id,
            challenge_id: self.challenge_id,
            user_id: self.user_id,
            language: self.language,
            code: self.code,
            status: self.status,
            score: self.score,
            max_score: self.max_score,
            runtime_ms: self.runtime_ms,
            error_message: self.error_message,
            created_at: self.created_at,
            judged_at: self.judged_at,
            results,
        }
    }
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionResultView {
    pub test_case_id: Option<Uuid>,
    pub verdict: String,
    pub runtime_ms: i32,
    pub is_hidden: bool,
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

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    pub submission_id: Uuid,
    pub user_id: Uuid,
    pub author_name: String,
    pub score: i32,
    pub max_score: i32,
    pub runtime_ms: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateChallengeRequest {
    pub notebook_id: Uuid,
    pub block_id: Option<Uuid>,
    #[validate(length(max = 100, message = "Slug must be at most 100 characters"))]
    pub slug: String,
    #[validate(length(max = 300, message = "Title must be at most 300 characters"))]
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

#[derive(Deserialize, Validate, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChallengeRequest {
    #[validate(length(max = 300, message = "Title must be at most 300 characters"))]
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

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTestCaseRequest {
    pub input: String,
    pub expected: Option<String>,
    pub is_hidden: Option<bool>,
    pub weight: Option<i32>,
    pub ord: Option<i32>,
}

#[derive(Deserialize, utoipa::ToSchema)]
pub struct SetReferenceRequest {
    pub solution: String,
    pub language: String,
}

#[derive(Deserialize, utoipa::ToSchema)]
pub struct SubmitRequest {
    pub language: String,
    pub code: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct SampleResultView {
    pub input: String,
    pub expected: Option<String>,
    pub stdout: String,
    pub stderr: Option<String>,
    pub verdict: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RunSamplesResponse {
    pub compile_error: Option<String>,
    pub results: Vec<SampleResultView>,
}
