CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT folder_scope_exclusive CHECK ((user_id IS NOT NULL) <> (team_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS folders_user_idx ON folders (user_id);
CREATE INDEX IF NOT EXISTS folders_team_idx ON folders (team_id);
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS notebooks_folder_idx ON notebooks (folder_id);
