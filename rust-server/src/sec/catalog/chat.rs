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
        perm!(
            key: "chat.team.access",
            tier: Granular,
            targets: [Team],
            label: "perm.chat.team.access",
            implied_by: ["chat.view"],
            view: ,
        ),
        perm!(
            key: "chat.messages.reply",
            tier: Granular,
            targets: [Team, Notebook, Chat],
            label: "perm.chat.messages.reply",
            implied_by: ["chat.messages.send"],
            view: ,
        ),
        perm!(
            key: "chat.messages.quote",
            tier: Granular,
            targets: [Team, Notebook, Chat],
            label: "perm.chat.messages.quote",
            implied_by: ["chat.messages.send"],
            view: ,
        ),
        perm!(
            key: "chat.messages.edit",
            tier: Granular,
            targets: [Team, Notebook, Chat],
            label: "perm.chat.messages.edit",
            implied_by: ["chat.messages.send"],
            view: ,
        ),
        perm!(
            key: "chat.messages.delete",
            tier: Granular,
            targets: [Team, Notebook, Chat],
            label: "perm.chat.messages.delete",
            implied_by: ["chat.messages.send"],
            view: ,
        ),
        perm!(
            key: "chat.messages.delete_any",
            tier: Granular,
            targets: [Team, Notebook, Chat],
            label: "perm.chat.messages.delete_any",
            implied_by: [],
            view: ,
        ),
    ]
}
