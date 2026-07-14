CREATE TABLE IF NOT EXISTS notebook_snapshots (
    id UUID PRIMARY KEY,
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    label VARCHAR(120) NOT NULL,
    note TEXT,
    document_data BYTEA NOT NULL,
    kind VARCHAR(16) NOT NULL DEFAULT 'manual',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notebook_snapshots_notebook_idx
    ON notebook_snapshots (notebook_id, created_at DESC);
