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
