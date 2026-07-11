use super::Permission;
use super::perm;

pub fn permissions() -> Vec<Permission> {
    vec![
        perm!(
            key: "chat.view",
            tier: General,
            targets: [Team, Notebook, Chat],
            label: "perm.chat.view",
            implied_by: [],
            view: Cosmetic,
        ),
        perm!(
            key: "chat.messages.send",
            tier: General,
            targets: [Team, Notebook, Chat],
            label: "perm.chat.messages.send",
            implied_by: [],
            view: ,
        ),
    ]
}
