CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    source_notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    latest_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT template_scope_exclusive CHECK ((user_id IS NOT NULL) <> (team_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS templates_user_idx ON templates (user_id);
CREATE INDEX IF NOT EXISTS templates_team_idx ON templates (team_id);
CREATE INDEX IF NOT EXISTS templates_public_idx ON templates (is_public);

CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    named_sources JSONB NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT template_versions_unique UNIQUE (template_id, version)
);
CREATE INDEX IF NOT EXISTS template_versions_template_idx ON template_versions (template_id);
