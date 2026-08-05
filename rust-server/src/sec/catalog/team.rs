use super::Permission;
use super::perm;

pub fn permissions() -> Vec<Permission> {
    vec![
        perm!(
            key: "team.manage",
            tier: General,
            targets: [Team],
            label: "perm.team.manage",
            implied_by: [],
            view: ,
        ),
        perm!(
            key: "team.edit_name",
            tier: Granular,
            targets: [Team],
            label: "perm.team.edit_name",
            implied_by: ["team.manage"],
            view: ,
        ),
        perm!(
            key: "team.invite_users",
            tier: Granular,
            targets: [Team],
            label: "perm.team.invite_users",
            implied_by: ["team.manage"],
            view: ,
        ),
        perm!(
            key: "team.remove_users",
            tier: Granular,
            targets: [Team],
            label: "perm.team.remove_users",
            implied_by: ["team.manage"],
            view: ,
        ),
        perm!(
            key: "team.roles.create_role",
            tier: Granular,
            targets: [Team],
            label: "perm.team.roles.create_role",
            implied_by: ["team.manage"],
            view: ,
        ),
        perm!(
            key: "team.roles.edit_role_name",
            tier: Granular,
            targets: [Team],
            label: "perm.team.roles.edit_role_name",
            implied_by: ["team.manage"],
            view: ,
        ),
        perm!(
            key: "team.roles.edit_role_permissions",
            tier: Granular,
            targets: [Team],
            label: "perm.team.roles.edit_role_permissions",
            implied_by: ["team.manage"],
            view: ,
        ),
    ]
}
