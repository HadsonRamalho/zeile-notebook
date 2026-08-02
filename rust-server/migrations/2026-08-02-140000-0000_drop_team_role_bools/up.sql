-- Remove as colunas booleanas de team_roles. A fonte de verdade passa a ser
-- permission_grants. Antes de derrubar as colunas, ressincroniza os grants
-- de time (`target_kind = 'team'`, `effect = 'allow'`) a partir dos bools:
-- ate aqui a edicao de um cargo escrevia so nos bools, entao roles editados
-- depois do backfill de 2026-07-10 tem grants defasados.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'team_roles' AND column_name = 'can_read'
    ) THEN
        DELETE FROM permission_grants
        WHERE subject_kind = 'role'
          AND target_kind = 'team'
          AND effect = 'allow'
          AND subject_id IN (SELECT id FROM team_roles)
          AND permission_key IN (
              'notebook.view',
              'chat.view',
              'notebook.edit',
              'notebook.blocks.execute',
              'chat.messages.send',
              'notebook.manage_privacy',
              'notebook.manage_clones',
              'team.invite_users',
              'team.remove_users',
              'team.roles.edit_role_permissions',
              'team.roles.create_role',
              'team.roles.edit_role_name',
              'team.manage',
              'chat.messages.delete_any'
          );

        INSERT INTO permission_grants (
            subject_kind, subject_id, scope_team_id, permission_key, target_kind, effect
        )
        SELECT 'role', tr.id, tr.team_id, k.key, 'team', 'allow'
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
            SELECT unnest(ARRAY['team.manage', 'chat.messages.delete_any']) WHERE tr.can_manage_team
        ) AS k(key);
    END IF;
END $$;

ALTER TABLE team_roles DROP COLUMN IF EXISTS can_read;
ALTER TABLE team_roles DROP COLUMN IF EXISTS can_write;
ALTER TABLE team_roles DROP COLUMN IF EXISTS can_manage_privacy;
ALTER TABLE team_roles DROP COLUMN IF EXISTS can_manage_clones;
ALTER TABLE team_roles DROP COLUMN IF EXISTS can_invite_users;
ALTER TABLE team_roles DROP COLUMN IF EXISTS can_remove_users;
ALTER TABLE team_roles DROP COLUMN IF EXISTS can_manage_permissions;
ALTER TABLE team_roles DROP COLUMN IF EXISTS can_manage_team;
