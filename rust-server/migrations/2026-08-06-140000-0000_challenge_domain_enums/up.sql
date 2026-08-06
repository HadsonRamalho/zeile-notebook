CREATE TYPE judge_mode_enum AS ENUM ('io', 'reference', 'property');
CREATE TYPE submission_status_enum AS ENUM ('queued', 'running', 'done', 'compile_error', 'error');
CREATE TYPE submission_verdict_enum AS ENUM ('AC', 'WA', 'TLE', 'RE', 'CE', 'SKIP');
CREATE TYPE challenge_difficulty_enum AS ENUM ('easy', 'medium', 'hard');

ALTER TABLE challenges ALTER COLUMN judge_mode DROP DEFAULT;
ALTER TABLE challenges ALTER COLUMN difficulty DROP DEFAULT;
ALTER TABLE challenge_submissions ALTER COLUMN status DROP DEFAULT;

ALTER TABLE challenges
    ALTER COLUMN judge_mode TYPE judge_mode_enum USING judge_mode::judge_mode_enum,
    ALTER COLUMN difficulty TYPE challenge_difficulty_enum USING difficulty::challenge_difficulty_enum,
    ALTER COLUMN reference_language TYPE language_enum USING reference_language::language_enum;

ALTER TABLE challenge_submissions
    ALTER COLUMN status TYPE submission_status_enum USING status::submission_status_enum,
    ALTER COLUMN language TYPE language_enum USING language::language_enum;

ALTER TABLE challenge_submission_results
    ALTER COLUMN verdict TYPE submission_verdict_enum USING verdict::submission_verdict_enum;

ALTER TABLE challenges ALTER COLUMN judge_mode SET DEFAULT 'io'::judge_mode_enum;
ALTER TABLE challenges ALTER COLUMN difficulty SET DEFAULT 'medium'::challenge_difficulty_enum;
ALTER TABLE challenge_submissions ALTER COLUMN status SET DEFAULT 'queued'::submission_status_enum;
