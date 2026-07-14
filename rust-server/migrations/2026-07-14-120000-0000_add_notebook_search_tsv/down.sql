DROP INDEX IF EXISTS blocks_search_tsv_idx;
ALTER TABLE blocks DROP COLUMN IF EXISTS search_tsv;

DROP INDEX IF EXISTS notebooks_search_tsv_idx;
ALTER TABLE notebooks DROP COLUMN IF EXISTS search_tsv;
