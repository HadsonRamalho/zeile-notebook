DROP INDEX IF EXISTS notebooks_public_slug_idx;
ALTER TABLE notebooks DROP COLUMN IF EXISTS public_slug;
