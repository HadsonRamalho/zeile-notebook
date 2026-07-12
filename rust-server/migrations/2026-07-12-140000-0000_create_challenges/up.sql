CREATE TABLE challenges (
    id UUID PRIMARY KEY,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    statement_md TEXT NOT NULL,
    difficulty VARCHAR(32) NOT NULL DEFAULT 'medium',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    languages JSONB NOT NULL DEFAULT '[]'::jsonb,
    judge_mode VARCHAR(16) NOT NULL DEFAULT 'io',
    time_limit_ms INT NOT NULL DEFAULT 5000,
    mem_limit_kb INT NOT NULL DEFAULT 262144,
    starter_code JSONB,
    reference_solution TEXT,
    reference_language VARCHAR(16),
    property_spec JSONB,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility VARCHAR(16) NOT NULL DEFAULT 'public',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX challenges_team_idx ON challenges (team_id);
CREATE INDEX challenges_visibility_idx ON challenges (visibility);

CREATE TABLE challenge_test_cases (
    id UUID PRIMARY KEY,
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    input TEXT NOT NULL,
    expected TEXT,
    is_hidden BOOLEAN NOT NULL DEFAULT TRUE,
    weight INT NOT NULL DEFAULT 1,
    ord INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX challenge_test_cases_challenge_idx ON challenge_test_cases (challenge_id, ord);

CREATE TABLE challenge_submissions (
    id UUID PRIMARY KEY,
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    language VARCHAR(16) NOT NULL,
    code TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued',
    score INT NOT NULL DEFAULT 0,
    max_score INT NOT NULL DEFAULT 0,
    runtime_ms INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    judged_at TIMESTAMPTZ
);

CREATE INDEX challenge_submissions_challenge_idx ON challenge_submissions (challenge_id, created_at);
CREATE INDEX challenge_submissions_user_idx ON challenge_submissions (user_id, created_at);

CREATE TABLE challenge_submission_results (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES challenge_submissions(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES challenge_test_cases(id) ON DELETE SET NULL,
    verdict VARCHAR(8) NOT NULL,
    runtime_ms INT NOT NULL DEFAULT 0,
    is_hidden BOOLEAN NOT NULL DEFAULT TRUE,
    stderr_snippet TEXT,
    ord INT NOT NULL DEFAULT 0
);

CREATE INDEX challenge_submission_results_submission_idx ON challenge_submission_results (submission_id, ord);
