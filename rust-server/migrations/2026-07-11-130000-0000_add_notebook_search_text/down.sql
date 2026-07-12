DROP INDEX IF EXISTS notebooks_search_text_trgm_idx;
ALTER TABLE notebooks DROP COLUMN IF EXISTS search_text;
