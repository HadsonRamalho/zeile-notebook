INSERT INTO permission_grants (subject_kind, subject_id, scope_team_id, permission_key, target_kind, effect)
SELECT 'role'::grant_subject_kind, r.id, r.team_id, 'chat.messages.delete_any', 'team'::grant_target_kind, 'allow'::grant_effect
FROM team_roles r
WHERE r.can_manage_team = TRUE
AND NOT EXISTS (
    SELECT 1
    FROM permission_grants g
    WHERE g.subject_kind = 'role'
        AND g.subject_id = r.id
        AND g.permission_key = 'chat.messages.delete_any'
        AND g.target_kind = 'team'
);
