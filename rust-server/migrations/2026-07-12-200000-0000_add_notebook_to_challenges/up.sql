ALTER TABLE challenges
    ADD COLUMN IF NOT EXISTS notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS block_id UUID;

CREATE INDEX IF NOT EXISTS challenges_notebook_idx ON challenges (notebook_id);
