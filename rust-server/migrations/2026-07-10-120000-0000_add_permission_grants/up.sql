DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grant_subject_kind') THEN
        CREATE TYPE grant_subject_kind AS ENUM ('role', 'user', 'principal');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grant_target_kind') THEN
        CREATE TYPE grant_target_kind AS ENUM ('team', 'notebook', 'block', 'block_type', 'chat', 'global');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grant_effect') THEN
        CREATE TYPE grant_effect AS ENUM ('allow', 'deny');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS permission_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_kind grant_subject_kind NOT NULL,
    subject_id UUID,
    subject_principal VARCHAR,
    scope_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    permission_key VARCHAR NOT NULL,
    target_kind grant_target_kind NOT NULL,
    target_id UUID,
    target_value VARCHAR,
    effect grant_effect NOT NULL DEFAULT 'allow',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT permission_grants_subject_check CHECK (
        (subject_kind = 'principal' AND subject_principal IS NOT NULL AND subject_id IS NULL)
        OR (subject_kind IN ('role', 'user') AND subject_id IS NOT NULL AND subject_principal IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_grants_lookup ON permission_grants (permission_key, target_kind, target_id, target_value);
CREATE INDEX IF NOT EXISTS idx_grants_subject ON permission_grants (subject_kind, subject_id, subject_principal);

INSERT INTO permission_grants (subject_kind, subject_id, scope_team_id, permission_key, target_kind, effect)
SELECT 'role'::grant_subject_kind, tr.id, tr.team_id, k.key, 'team'::grant_target_kind, 'allow'::grant_effect
FROM team_roles tr
CROSS JOIN LATERAL (
    SELECT unnest(ARRAY['notebook.view', 'chat.view']) WHERE tr.can_read
    UNION ALL
    SELECT unnest(ARRAY['notebook.edit', 'notebook.blocks.execute', 'chat.messages.send']) WHERE tr.can_write
    UNION ALL
    SELECT unnest(ARRAY['notebook.manage_privacy']) WHERE tr.can_manage_privacy
    UNION ALL
    SELECT unnest(ARRAY['notebook.manage_clones']) WHERE tr.can_manage_clones
    UNION ALL
    SELECT unnest(ARRAY['team.invite_users']) WHERE tr.can_invite_users
    UNION ALL
    SELECT unnest(ARRAY['team.remove_users']) WHERE tr.can_remove_users
    UNION ALL
    SELECT unnest(ARRAY['team.roles.edit_role_permissions', 'team.roles.create_role', 'team.roles.edit_role_name']) WHERE tr.can_manage_permissions
    UNION ALL
    SELECT unnest(ARRAY['team.manage']) WHERE tr.can_manage_team
) AS k(key)
WHERE NOT EXISTS (
    SELECT 1 FROM permission_grants existing
    WHERE existing.subject_kind = 'role'
      AND existing.subject_id = tr.id
      AND existing.permission_key = k.key
      AND existing.target_kind = 'team'
);
