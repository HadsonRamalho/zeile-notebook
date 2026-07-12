CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_kind VARCHAR(16) NOT NULL,
    scope_id UUID,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    inapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    chat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_preferences_scope_idx
    ON notification_preferences (
        user_id,
        scope_kind,
        COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );
