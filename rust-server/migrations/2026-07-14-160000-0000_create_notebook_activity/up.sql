CREATE TABLE IF NOT EXISTS notebook_activity (
    id UUID PRIMARY KEY,
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    block_id TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notebook_activity_notebook_idx
    ON notebook_activity (notebook_id, created_at DESC);
