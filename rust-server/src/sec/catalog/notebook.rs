use super::perm;
use super::Permission;

pub fn permissions() -> Vec<Permission> {
    vec![
        perm!(
            key: "notebook.view",
            tier: General,
            targets: [Notebook],
            label: "perm.notebook.view",
            implied_by: [],
            view: Cosmetic,
        ),
        perm!(
            key: "notebook.edit",
            tier: General,
            targets: [Notebook],
            label: "perm.notebook.edit",
            implied_by: [],
            view: ,
        ),
        perm!(
            key: "notebook.delete",
            tier: General,
            targets: [Notebook],
            label: "perm.notebook.delete",
            implied_by: [],
            view: ,
        ),
        perm!(
            key: "notebook.edit_name",
            tier: Granular,
            targets: [Notebook],
            label: "perm.notebook.edit_name",
            implied_by: ["notebook.edit"],
            view: ,
        ),
        perm!(
            key: "notebook.manage_privacy",
            tier: Granular,
            targets: [Notebook],
            label: "perm.notebook.manage_privacy",
            implied_by: [],
            view: ,
        ),
        perm!(
            key: "notebook.manage_clones",
            tier: Granular,
            targets: [Notebook],
            label: "perm.notebook.manage_clones",
            implied_by: [],
            view: ,
        ),
        perm!(
            key: "notebook.manage_public",
            tier: General,
            targets: [Notebook],
            label: "perm.notebook.manage_public",
            implied_by: [],
            view: ,
        ),
        perm!(
            key: "notebook.pages.add",
            tier: Granular,
            targets: [Notebook],
            label: "perm.notebook.pages.add",
            implied_by: ["notebook.edit"],
            view: ,
        ),
        perm!(
            key: "notebook.pages.delete",
            tier: Granular,
            targets: [Notebook],
            label: "perm.notebook.pages.delete",
            implied_by: ["notebook.edit"],
            view: ,
        ),
    ]
}
