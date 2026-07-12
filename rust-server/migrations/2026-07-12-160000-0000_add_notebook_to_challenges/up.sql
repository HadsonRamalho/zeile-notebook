ALTER TABLE challenges
    ADD COLUMN notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
    ADD COLUMN block_id UUID;

CREATE INDEX challenges_notebook_idx ON challenges (notebook_id);
