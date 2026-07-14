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
                panic!("Catálogo de permissões: chave duplicada '{}'", perm.key);
            }
        }

        for perm in &permissions {
            if perm.key.ends_with(".view") && perm.view.is_none() {
                panic!(
                    "Catálogo de permissões: permissão de leitura '{}' precisa de marca Cosmetic|Confidential",
                    perm.key
                );
            }
            if !perm.key.ends_with(".view") && perm.view.is_some() {
                panic!(
                    "Catálogo de permissões: permissão '{}' não é de leitura mas tem marca de view",
                    perm.key
                );
            }
            for parent in &perm.implied_by {
                if !index.contains_key(parent) {
                    panic!(
                        "Catálogo de permissões: '{}' implied_by chave inexistente '{}'",
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
}
