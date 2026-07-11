INSERT INTO permission_grants (subject_kind, subject_id, scope_team_id, permission_key, target_kind, effect)
SELECT 'user'::grant_subject_kind, earliest.user_id, earliest.team_id, k.key, 'team'::grant_target_kind, 'allow'::grant_effect
FROM (
    SELECT DISTINCT ON (tm.team_id) tm.team_id, tm.user_id
    FROM team_members tm
    ORDER BY tm.team_id, tm.joined_at ASC
) AS earliest
CROSS JOIN (
    VALUES
        ('notebook.manage_privacy'),
        ('notebook.pages.delete'),
        ('team.invite_users'),
        ('team.remove_users')
) AS k(key)
WHERE NOT EXISTS (
    SELECT 1
    FROM team_members tm2
    JOIN permission_grants g
        ON g.subject_kind = 'role'
        AND g.subject_id = tm2.role_id
        AND g.scope_team_id = earliest.team_id
        AND g.permission_key = 'team.manage'
        AND g.effect = 'allow'
        AND g.target_kind = 'team'
    WHERE tm2.team_id = earliest.team_id
)
AND NOT EXISTS (
    SELECT 1
    FROM permission_grants existing
    WHERE existing.subject_kind = 'user'
        AND existing.subject_id = earliest.user_id
        AND existing.scope_team_id = earliest.team_id
        AND existing.permission_key = k.key
        AND existing.target_kind = 'team'
);
