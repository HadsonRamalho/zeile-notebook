CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE notebooks
    ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

CREATE INDEX notebooks_search_text_trgm_idx
    ON notebooks USING gin (search_text gin_trgm_ops)
    WHERE is_public;
