use super::{Permission, Tier, TargetKind, ViewSensitivity};

const BLOCK_TYPES: &[&str] = &[
    "rust",
    "go",
    "python",
    "cpp",
    "zig",
    "tsx",
    "drawing",
    "text",
    "latex",
    "sql",
    "typst",
    "database_schema",
    "challenge",
    "component",
    "notebook_ref",
];

const EXECUTABLE: &[&str] = &["rust", "go", "python", "cpp", "zig", "tsx"];

pub fn permissions() -> Vec<Permission> {
    let mut perms = vec![
        Permission {
            key: "notebook.blocks.view".to_string(),
            tier: Tier::General,
            targets: vec![TargetKind::Notebook],
            label: "perm.notebook.blocks.view".to_string(),
            implied_by: vec!["notebook.view".to_string()],
            view: Some(ViewSensitivity::Cosmetic),
        },
        Permission {
            key: "notebook.blocks.add".to_string(),
            tier: Tier::General,
            targets: vec![TargetKind::Notebook],
            label: "perm.notebook.blocks.add".to_string(),
            implied_by: vec!["notebook.edit".to_string()],
            view: None,
        },
        Permission {
            key: "notebook.blocks.edit".to_string(),
            tier: Tier::General,
            targets: vec![TargetKind::Notebook, TargetKind::Block],
            label: "perm.notebook.blocks.edit".to_string(),
            implied_by: vec!["notebook.edit".to_string()],
            view: None,
        },
        Permission {
            key: "notebook.blocks.delete".to_string(),
            tier: Tier::General,
            targets: vec![TargetKind::Notebook, TargetKind::Block],
            label: "perm.notebook.blocks.delete".to_string(),
            implied_by: vec!["notebook.edit".to_string()],
            view: None,
        },
        Permission {
            key: "notebook.blocks.execute".to_string(),
            tier: Tier::General,
            targets: vec![TargetKind::Notebook, TargetKind::Block],
            label: "perm.notebook.blocks.execute".to_string(),
            implied_by: vec![],
            view: None,
        },
        Permission {
            key: "notebook.blocks.reorder".to_string(),
            tier: Tier::General,
            targets: vec![TargetKind::Notebook],
            label: "perm.notebook.blocks.reorder".to_string(),
            implied_by: vec!["notebook.blocks.edit".to_string()],
            view: None,
        },
    ];

    for ty in BLOCK_TYPES {
        perms.push(Permission {
            key: format!("notebook.blocks.{ty}.view"),
            tier: Tier::Granular,
            targets: vec![TargetKind::BlockType, TargetKind::Block, TargetKind::Notebook],
            label: format!("perm.notebook.blocks.{ty}.view"),
            implied_by: vec!["notebook.blocks.view".to_string()],
            view: Some(ViewSensitivity::Cosmetic),
        });
        perms.push(Permission {
            key: format!("notebook.blocks.{ty}.add"),
            tier: Tier::Granular,
            targets: vec![TargetKind::BlockType, TargetKind::Notebook],
            label: format!("perm.notebook.blocks.{ty}.add"),
            implied_by: vec!["notebook.blocks.add".to_string()],
            view: None,
        });
        perms.push(Permission {
            key: format!("notebook.blocks.{ty}.edit"),
            tier: Tier::Granular,
            targets: vec![TargetKind::BlockType, TargetKind::Block, TargetKind::Notebook],
            label: format!("perm.notebook.blocks.{ty}.edit"),
            implied_by: vec!["notebook.blocks.edit".to_string()],
            view: None,
        });
    }

    for ty in EXECUTABLE {
        perms.push(Permission {
            key: format!("notebook.blocks.{ty}.execute"),
            tier: Tier::Granular,
            targets: vec![TargetKind::BlockType, TargetKind::Block, TargetKind::Notebook],
            label: format!("perm.notebook.blocks.{ty}.execute"),
            implied_by: vec!["notebook.blocks.execute".to_string()],
            view: None,
        });
    }

    perms
}
