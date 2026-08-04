use std::collections::HashMap;
use syn::visit::Visit;

const FORBIDDEN_ROOTS: &[&str] = &[
    "std::fs",
    "std::env",
    "std::process",
    "std::net",
    "std::thread",
    "std::ffi",
    "std::os",
    "std::ptr",
    "std::mem",
    "core::ptr",
    "alloc::alloc",
    "libc",
    "winapi",
];

fn join_prefix(prefix: &str, ident: &syn::Ident) -> String {
    if ident == "self" {
        return prefix.to_string();
    }
    if prefix.is_empty() {
        ident.to_string()
    } else {
        format!("{prefix}::{ident}")
    }
}

fn collect_use_tree(tree: &syn::UseTree, prefix: &str, aliases: &mut HashMap<String, String>) {
    match tree {
        syn::UseTree::Path(p) => {
            collect_use_tree(&p.tree, &join_prefix(prefix, &p.ident), aliases);
        }
        syn::UseTree::Name(n) => {
            let full = join_prefix(prefix, &n.ident);
            aliases.insert(n.ident.to_string(), full);
        }
        syn::UseTree::Rename(r) => {
            let full = join_prefix(prefix, &r.ident);
            aliases.insert(r.rename.to_string(), full);
        }
        syn::UseTree::Glob(_) => {}
        syn::UseTree::Group(g) => {
            for item in &g.items {
                collect_use_tree(item, prefix, aliases);
            }
        }
    }
}

#[derive(Default)]
struct AliasCollector {
    aliases: HashMap<String, String>,
}

impl<'ast> Visit<'ast> for AliasCollector {
    fn visit_item_use(&mut self, node: &'ast syn::ItemUse) {
        collect_use_tree(&node.tree, "", &mut self.aliases);
    }
}

fn resolve_path(path: &syn::Path, aliases: &HashMap<String, String>) -> Option<String> {
    let mut segments: Vec<String> = path.segments.iter().map(|s| s.ident.to_string()).collect();

    if segments.is_empty() {
        return None;
    }

    if let Some(resolved_root) = aliases.get(&segments[0]) {
        segments[0] = resolved_root.clone();
    }

    Some(segments.join("::"))
}

struct PathChecker<'a> {
    aliases: &'a HashMap<String, String>,
    error: Option<String>,
}

impl<'ast> Visit<'ast> for PathChecker<'_> {
    fn visit_path(&mut self, node: &'ast syn::Path) {
        if self.error.is_some() {
            return;
        }

        if let Some(resolved) = resolve_path(node, self.aliases) {
            for forbidden in FORBIDDEN_ROOTS {
                let matches = resolved == *forbidden
                    || resolved.starts_with(&format!("{forbidden}::"));

                if matches {
                    self.error = Some(format!(
                        "Segurança: o caminho '{}' (resolvido de '{}') não é permitido.",
                        forbidden, resolved
                    ));
                    return;
                }
            }
        }

        syn::visit::visit_path(self, node);
    }
}

const MAX_ALIASES: usize = 512;

fn resolve_one(path: &str, aliases: &HashMap<String, String>) -> Option<String> {
    let (head, rest) = match path.split_once("::") {
        Some((head, rest)) => (head, Some(rest)),
        None => (path, None),
    };

    aliases.get(head).map(|resolved_head| match rest {
        Some(rest) => format!("{resolved_head}::{rest}"),
        None => resolved_head.clone(),
    })
}

fn fully_resolve(start: &str, aliases: &HashMap<String, String>) -> String {
    let mut current = start.to_string();
    let mut seen = std::collections::HashSet::new();

    while let Some(next) = resolve_one(&current, aliases) {
        if next == current || !seen.insert(current.clone()) {
            break;
        }
        current = next;
    }

    current
}

fn resolve_aliases_to_a_fixed_point(aliases: &mut HashMap<String, String>) {
    let snapshot = aliases.clone();

    for value in aliases.values_mut() {
        *value = fully_resolve(value, &snapshot);
    }
}

pub fn verify_rust_ast(code: &str) -> Result<(), String> {
    let Ok(file) = syn::parse_file(code) else {
        return Ok(());
    };

    let mut alias_collector = AliasCollector::default();
    alias_collector.visit_file(&file);

    if alias_collector.aliases.len() > MAX_ALIASES {
        return Err(format!(
            "Segurança: o arquivo declara mais de {} imports; recuse-se a resolver aliases além desse limite.",
            MAX_ALIASES
        ));
    }

    resolve_aliases_to_a_fixed_point(&mut alias_collector.aliases);

    let mut checker = PathChecker {
        aliases: &alias_collector.aliases,
        error: None,
    };
    checker.visit_file(&file);

    match checker.error {
        Some(message) => Err(message),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_use_of_a_forbidden_module_is_caught() {
        let code = "use std::fs;\nfn main() { fs::write(\"x\", \"y\").unwrap(); }\n";

        assert!(verify_rust_ast(code).is_err());
    }

    #[test]
    fn an_aliased_use_of_a_forbidden_module_is_caught() {
        let code =
            "use std::fs as f;\nfn main() { f::write(\"x\", \"y\").unwrap(); }\n";

        assert!(
            verify_rust_ast(code).is_err(),
            "aliasing std::fs must not bypass the check"
        );
    }

    #[test]
    fn a_grouped_rename_is_caught() {
        let code = "use std::{fs as f, process as p};\nfn main() { f::write(\"x\", \"y\").unwrap(); let _ = p::exit; }\n";

        assert!(verify_rust_ast(code).is_err());
    }

    #[test]
    fn a_fully_qualified_path_without_any_use_is_caught() {
        let code = "fn main() { std::fs::write(\"x\", \"y\").unwrap(); }\n";

        assert!(verify_rust_ast(code).is_err());
    }

    #[test]
    fn ordinary_safe_code_passes() {
        let code = "use std::collections::HashMap;\nfn main() { let mut m: HashMap<String, i32> = HashMap::new(); m.insert(\"a\".into(), 1); println!(\"{:?}\", m); }\n";

        assert!(verify_rust_ast(code).is_ok());
    }

    #[test]
    fn an_unrelated_alias_named_like_a_forbidden_module_is_not_confused() {
        let code = "mod fs { pub fn write() {} }\nfn main() { fs::write(); }\n";

        assert!(
            verify_rust_ast(code).is_ok(),
            "a user's own module named 'fs' must not be confused with std::fs"
        );
    }

    #[test]
    fn a_chained_alias_is_caught() {
        let code = "use std as s;\nuse s::fs as f;\nfn main() { f::write(\"x\", \"y\").unwrap(); }\n";

        assert!(
            verify_rust_ast(code).is_err(),
            "a two-level alias indirection must not bypass the check"
        );
    }

    #[test]
    fn a_three_level_chained_alias_is_caught() {
        let code = "use std as s;\nuse s::fs as g;\nuse g as f;\nfn main() { f::write(\"x\", \"y\").unwrap(); }\n";

        assert!(
            verify_rust_ast(code).is_err(),
            "chained alias indirection of any depth must not bypass the check"
        );
    }

    #[test]
    fn a_deep_alias_chain_within_the_limit_is_still_resolved() {
        let mut code = String::from("use std as a0;\n");
        for i in 0..50 {
            code.push_str(&format!("use a{i} as a{};\n", i + 1));
        }
        code.push_str("fn main() { a50::fs::write(\"x\", \"y\"); }\n");

        assert!(
            verify_rust_ast(&code).is_err(),
            "a deep but bounded alias chain must still be resolved"
        );
    }

    #[test]
    fn an_excessive_number_of_aliases_is_rejected_outright() {
        let mut code = String::new();
        for i in 0..(MAX_ALIASES + 1) {
            code.push_str(&format!("use std::collections::HashMap as h{i};\n"));
        }
        code.push_str("fn main() {}\n");

        assert!(
            verify_rust_ast(&code).is_err(),
            "an excessive alias count must be rejected instead of resolved at O(n^2) cost"
        );
    }

    #[test]
    fn invalid_syntax_is_skipped_and_left_to_the_compiler() {
        let code = "fn main( { this is not valid rust";

        assert!(verify_rust_ast(code).is_ok());
    }
}
