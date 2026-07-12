CREATE TABLE chat_messages (
    id UUID PRIMARY KEY,
    notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    quoted_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chat_scope_exclusive CHECK ((notebook_id IS NOT NULL) <> (team_id IS NOT NULL))
);

CREATE INDEX chat_messages_notebook_idx ON chat_messages (notebook_id, created_at);
CREATE INDEX chat_messages_team_idx ON chat_messages (team_id, created_at);
CREATE INDEX chat_messages_parent_idx ON chat_messages (parent_id);

CREATE TABLE chat_message_versions (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_message_versions_message_idx ON chat_message_versions (message_id, created_at);
