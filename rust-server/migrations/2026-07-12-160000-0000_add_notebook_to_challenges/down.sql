DROP INDEX IF EXISTS challenges_notebook_idx;

ALTER TABLE challenges
    DROP COLUMN IF EXISTS notebook_id,
    DROP COLUMN IF EXISTS block_id;
