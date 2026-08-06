ALTER TABLE challenges ALTER COLUMN judge_mode DROP DEFAULT;
ALTER TABLE challenges ALTER COLUMN difficulty DROP DEFAULT;
ALTER TABLE challenge_submissions ALTER COLUMN status DROP DEFAULT;

ALTER TABLE challenge_submission_results
    ALTER COLUMN verdict TYPE varchar(8) USING verdict::text;

ALTER TABLE challenge_submissions
    ALTER COLUMN language TYPE varchar(16) USING language::text,
    ALTER COLUMN status TYPE varchar(16) USING status::text;

ALTER TABLE challenges
    ALTER COLUMN reference_language TYPE varchar(16) USING reference_language::text,
    ALTER COLUMN difficulty TYPE varchar(32) USING difficulty::text,
    ALTER COLUMN judge_mode TYPE varchar(16) USING judge_mode::text;

ALTER TABLE challenges ALTER COLUMN judge_mode SET DEFAULT 'io'::varchar;
ALTER TABLE challenges ALTER COLUMN difficulty SET DEFAULT 'medium'::varchar;
ALTER TABLE challenge_submissions ALTER COLUMN status SET DEFAULT 'queued'::varchar;

DROP TYPE challenge_difficulty_enum;
DROP TYPE submission_verdict_enum;
DROP TYPE submission_status_enum;
DROP TYPE judge_mode_enum;
