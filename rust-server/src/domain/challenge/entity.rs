use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::domain::notebook::Language;

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, utoipa::ToSchema)]
#[ExistingTypePath = "crate::schema::sql_types::JudgeModeEnum"]
#[serde(rename_all = "lowercase")]
pub enum JudgeMode {
    Io,
    Reference,
    Property,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, utoipa::ToSchema)]
#[ExistingTypePath = "crate::schema::sql_types::ChallengeDifficultyEnum"]
#[serde(rename_all = "lowercase")]
pub enum ChallengeDifficulty {
    Easy,
    Medium,
    Hard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, utoipa::ToSchema)]
#[ExistingTypePath = "crate::schema::sql_types::SubmissionStatusEnum"]
#[serde(rename_all = "snake_case")]
pub enum SubmissionStatus {
    Queued,
    Running,
    Done,
    CompileError,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, DbEnum, Serialize, Deserialize, utoipa::ToSchema)]
#[ExistingTypePath = "crate::schema::sql_types::SubmissionVerdictEnum"]
#[DbValueStyle = "SCREAMING_SNAKE_CASE"]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Verdict {
    Ac,
    Wa,
    Tle,
    Re,
    Ce,
    Skip,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = crate::schema::challenges)]
pub struct Challenge {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub statement_md: String,
    pub difficulty: ChallengeDifficulty,
    pub tags: Value,
    pub languages: Value,
    pub judge_mode: JudgeMode,
    pub time_limit_ms: i32,
    pub mem_limit_kb: i32,
    pub starter_code: Option<Value>,
    pub reference_solution: Option<String>,
    pub reference_language: Option<Language>,
    pub property_spec: Option<Value>,
    pub team_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub visibility: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub notebook_id: Option<Uuid>,
    pub block_id: Option<Uuid>,
    pub reference_solutions: Option<Value>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::challenges)]
pub struct NewChallenge {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub statement_md: String,
    pub difficulty: ChallengeDifficulty,
    pub tags: Value,
    pub languages: Value,
    pub judge_mode: JudgeMode,
    pub time_limit_ms: i32,
    pub mem_limit_kb: i32,
    pub starter_code: Option<Value>,
    pub reference_solution: Option<String>,
    pub reference_language: Option<Language>,
    pub property_spec: Option<Value>,
    pub team_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub visibility: String,
    pub notebook_id: Option<Uuid>,
    pub block_id: Option<Uuid>,
    pub reference_solutions: Option<Value>,
}

#[derive(AsChangeset, Default)]
#[diesel(table_name = crate::schema::challenges)]
pub struct UpdateChallenge {
    pub title: Option<String>,
    pub statement_md: Option<String>,
    pub difficulty: Option<ChallengeDifficulty>,
    pub judge_mode: Option<JudgeMode>,
    pub time_limit_ms: Option<i32>,
    pub mem_limit_kb: Option<i32>,
    pub tags: Option<Value>,
    pub languages: Option<Value>,
    pub starter_code: Option<Value>,
    pub property_spec: Option<Value>,
    pub visibility: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
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
#[diesel(table_name = crate::schema::challenge_test_cases)]
pub struct NewTestCase {
    pub id: Uuid,
    pub challenge_id: Uuid,
    pub input: String,
    pub expected: Option<String>,
    pub is_hidden: bool,
    pub weight: i32,
    pub ord: i32,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = crate::schema::challenge_submissions)]
pub struct Submission {
    pub id: Uuid,
    pub challenge_id: Uuid,
    pub user_id: Option<Uuid>,
    pub language: Language,
    pub code: String,
    pub status: SubmissionStatus,
    pub score: i32,
    pub max_score: i32,
    pub runtime_ms: i32,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub judged_at: Option<DateTime<Utc>>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::challenge_submissions)]
pub struct NewSubmission {
    pub id: Uuid,
    pub challenge_id: Uuid,
    pub user_id: Option<Uuid>,
    pub language: Language,
    pub code: String,
    pub status: SubmissionStatus,
    pub max_score: i32,
}

#[derive(Queryable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::schema::challenge_submission_results)]
pub struct SubmissionResult {
    pub id: Uuid,
    pub submission_id: Uuid,
    pub test_case_id: Option<Uuid>,
    pub verdict: Verdict,
    pub runtime_ms: i32,
    pub is_hidden: bool,
    pub stderr_snippet: Option<String>,
    pub ord: i32,
}

#[derive(Insertable)]
#[diesel(table_name = crate::schema::challenge_submission_results)]
pub struct NewSubmissionResult {
    pub id: Uuid,
    pub submission_id: Uuid,
    pub test_case_id: Option<Uuid>,
    pub verdict: Verdict,
    pub runtime_ms: i32,
    pub is_hidden: bool,
    pub stderr_snippet: Option<String>,
    pub ord: i32,
}
