ALTER TABLE notebooks
    ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(search_text, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS notebooks_search_tsv_idx
    ON notebooks USING gin (search_tsv);

ALTER TABLE blocks
    ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS blocks_search_tsv_idx
    ON blocks USING gin (search_tsv);
