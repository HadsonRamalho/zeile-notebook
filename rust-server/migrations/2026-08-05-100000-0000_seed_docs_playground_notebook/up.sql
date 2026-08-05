INSERT INTO users (id, name, email, primary_provider, role, is_active)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'Zeile Docs Playground',
    'docs-playground@system.zeile.local',
    'email'::auth_provider,
    'user'::user_role,
    false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO notebooks (id, user_id, title, is_public)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Zeile Docs Playground',
    true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO permission_grants (subject_kind, subject_principal, permission_key, target_kind, target_id, effect)
SELECT 'principal'::grant_subject_kind, 'authenticated', 'notebook.blocks.execute', 'notebook'::grant_target_kind,
    '11111111-1111-1111-1111-111111111111', 'allow'::grant_effect
WHERE NOT EXISTS (
    SELECT 1
    FROM permission_grants g
    WHERE g.subject_kind = 'principal'
        AND g.subject_principal = 'authenticated'
        AND g.permission_key = 'notebook.blocks.execute'
        AND g.target_kind = 'notebook'
        AND g.target_id = '11111111-1111-1111-1111-111111111111'
);
