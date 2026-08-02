-- Recria as colunas booleanas e as reconstroi a partir dos grants de time.
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_write BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_manage_privacy BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_manage_clones BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_invite_users BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_remove_users BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_manage_permissions BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS can_manage_team BOOLEAN NOT NULL DEFAULT false;

UPDATE team_roles tr
SET can_read = tem.notebook_view,
    can_write = tem.notebook_edit,
    can_manage_privacy = tem.manage_privacy,
    can_manage_clones = tem.manage_clones,
    can_invite_users = tem.invite_users,
    can_remove_users = tem.remove_users,
    can_manage_permissions = tem.manage_permissions,
    can_manage_team = tem.manage_team
FROM (
    SELECT r.id AS role_id,
        COALESCE(bool_or(g.permission_key = 'notebook.view'), false) AS notebook_view,
        COALESCE(bool_or(g.permission_key = 'notebook.edit'), false) AS notebook_edit,
        COALESCE(bool_or(g.permission_key = 'notebook.manage_privacy'), false) AS manage_privacy,
        COALESCE(bool_or(g.permission_key = 'notebook.manage_clones'), false) AS manage_clones,
        COALESCE(bool_or(g.permission_key = 'team.invite_users'), false) AS invite_users,
        COALESCE(bool_or(g.permission_key = 'team.remove_users'), false) AS remove_users,
        COALESCE(bool_or(g.permission_key = 'team.roles.edit_role_permissions'), false) AS manage_permissions,
        COALESCE(bool_or(g.permission_key = 'team.manage'), false) AS manage_team
    FROM team_roles r
    LEFT JOIN permission_grants g
        ON g.subject_kind = 'role'
        AND g.subject_id = r.id
        AND g.target_kind = 'team'
        AND g.effect = 'allow'
    GROUP BY r.id
) AS tem
WHERE tr.id = tem.role_id;
