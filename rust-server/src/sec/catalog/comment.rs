use super::Permission;
use super::perm;

pub fn permissions() -> Vec<Permission> {
    vec![
        perm!(
            key: "comment.view",
            tier: General,
            targets: [Notebook, Team],
            label: "perm.comment.view",
            implied_by: ["notebook.view"],
            view: Cosmetic,
        ),
        perm!(
            key: "comment.create",
            tier: General,
            targets: [Notebook, Team],
            label: "perm.comment.create",
            implied_by: ["notebook.edit"],
            view: ,
        ),
        perm!(
            key: "comment.resolve",
            tier: Granular,
            targets: [Notebook, Team],
            label: "perm.comment.resolve",
            implied_by: ["notebook.edit"],
            view: ,
        ),
    ]
}
