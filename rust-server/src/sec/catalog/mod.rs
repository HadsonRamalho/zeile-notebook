pub mod blocks;
pub mod chat;
pub mod comment;
pub mod notebook;
pub mod team;

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    General,
    Granular,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetKind {
    Team,
    Notebook,
    Block,
    BlockType,
    Chat,
    Global,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewSensitivity {
    Cosmetic,
    Confidential,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Permission {
    pub key: String,
    pub tier: Tier,
    pub targets: Vec<TargetKind>,
    pub label: String,
    pub implied_by: Vec<String>,
    pub view: Option<ViewSensitivity>,
}

macro_rules! perm {
    (
        key: $key:literal,
        tier: $tier:ident,
        targets: [$($t:ident),* $(,)?],
        label: $label:literal,
        implied_by: [$($imp:literal),* $(,)?],
        view: $($view:ident)?,
    ) => {
        $crate::sec::catalog::Permission {
            key: $key.to_string(),
            tier: $crate::sec::catalog::Tier::$tier,
            targets: vec![$($crate::sec::catalog::TargetKind::$t),*],
            label: $label.to_string(),
            implied_by: vec![$($imp.to_string()),*],
            view: perm!(@view $($view)?),
        }
    };
    (@view) => { None };
    (@view $v:ident) => { Some($crate::sec::catalog::ViewSensitivity::$v) };
}

pub(crate) use perm;

#[derive(Debug, Serialize)]
pub struct Catalog {
    permissions: Vec<Permission>,
    #[serde(skip)]
    index: HashMap<String, usize>,
    #[serde(skip)]
    expansions: HashMap<String, Vec<String>>,
}

impl Catalog {
    fn build() -> Self {
        let mut permissions = Vec::new();
        permissions.extend(notebook::permissions());
        permissions.extend(blocks::permissions());
        permissions.extend(team::permissions());
        permissions.extend(chat::permissions());
        permissions.extend(comment::permissions());

        let mut index = HashMap::new();
        for (i, perm) in permissions.iter().enumerate() {
            if index.insert(perm.key.clone(), i).is_some() {
                panic!("Permission catalog: duplicate key '{}'", perm.key);
            }
        }

        for perm in &permissions {
            if perm.key.ends_with(".view") && perm.view.is_none() {
                panic!(
                    "Permission catalog: read permission '{}' needs a Cosmetic|Confidential mark",
                    perm.key
                );
            }
            if !perm.key.ends_with(".view") && perm.view.is_some() {
                panic!(
                    "Permission catalog: permission '{}' is not a read permission but has a view mark",
                    perm.key
                );
            }
            for parent in &perm.implied_by {
                if !index.contains_key(parent) {
                    panic!(
                        "Permission catalog: '{}' implied_by nonexistent key '{}'",
                        perm.key, parent
                    );
                }
            }
        }

        let mut expansions: HashMap<String, Vec<String>> = HashMap::new();
        for perm in &permissions {
            for parent in &perm.implied_by {
                expansions
                    .entry(parent.clone())
                    .or_default()
                    .push(perm.key.clone());
            }
        }

        Self {
            permissions,
            index,
            expansions,
        }
    }

    pub fn get(&self, key: &str) -> Option<&Permission> {
        self.index.get(key).map(|i| &self.permissions[*i])
    }

    pub fn contains(&self, key: &str) -> bool {
        self.index.contains_key(key)
    }

    pub fn all(&self) -> &[Permission] {
        &self.permissions
    }

    pub fn implied_by(&self, key: &str) -> &[String] {
        self.get(key)
            .map(|p| p.implied_by.as_slice())
            .unwrap_or(&[])
    }

    pub fn expands_to(&self, general_key: &str) -> &[String] {
        self.expansions
            .get(general_key)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }
}

static CATALOG: OnceLock<Catalog> = OnceLock::new();

pub fn catalog() -> &'static Catalog {
    CATALOG.get_or_init(Catalog::build)
}

pub fn init() {
    let _ = catalog();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_without_panicking() {
        let cat = catalog();
        assert!(!cat.all().is_empty());
    }

    #[test]
    fn keys_are_unique() {
        let cat = catalog();
        let mut seen = std::collections::HashSet::new();
        for perm in cat.all() {
            assert!(seen.insert(&perm.key), "chave duplicada {}", perm.key);
        }
    }

    #[test]
    fn implied_by_targets_exist() {
        let cat = catalog();
        for perm in cat.all() {
            for parent in &perm.implied_by {
                assert!(cat.contains(parent), "{} -> {}", perm.key, parent);
            }
        }
    }

    #[test]
    fn view_permissions_are_marked() {
        let cat = catalog();
        for perm in cat.all() {
            if perm.key.ends_with(".view") {
                assert!(perm.view.is_some(), "{}", perm.key);
            }
        }
    }

    #[test]
    fn general_expands_into_granulars() {
        let cat = catalog();
        let expanded = cat.expands_to("notebook.blocks.execute");
        assert!(expanded.contains(&"notebook.blocks.rust.execute".to_string()));
    }

    const SNAPSHOT_PATH: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../contracts/permission-catalog.json"
    );

    #[test]
    fn snapshot_matches_committed_catalog() {
        let current = serde_json::to_value(catalog()).expect("serialize catalog");

        if std::env::var("UPDATE_PERMISSION_CATALOG_SNAPSHOT").is_ok() {
            let pretty = serde_json::to_string_pretty(&current).expect("format snapshot");
            std::fs::write(SNAPSHOT_PATH, format!("{pretty}\n")).expect("write snapshot");
            return;
        }

        let raw = std::fs::read_to_string(SNAPSHOT_PATH).unwrap_or_else(|e| {
            panic!(
                "could not read {SNAPSHOT_PATH}: {e}. Run with UPDATE_PERMISSION_CATALOG_SNAPSHOT=1 to generate it."
            )
        });
        let committed: serde_json::Value = serde_json::from_str(&raw).expect("invalid snapshot");

        assert_eq!(
            committed, current,
            "the catalog changed but the snapshot didn't: run `UPDATE_PERMISSION_CATALOG_SNAPSHOT=1 cargo test snapshot_matches_committed_catalog` and commit the result"
        );
    }
}
