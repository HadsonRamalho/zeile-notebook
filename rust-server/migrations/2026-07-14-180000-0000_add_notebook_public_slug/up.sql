ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS public_slug VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS notebooks_public_slug_idx
    ON notebooks (public_slug)
    WHERE public_slug IS NOT NULL;
