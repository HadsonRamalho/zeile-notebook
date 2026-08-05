use std::collections::HashMap;

pub mod ast;
pub mod catalog;

pub fn verify_code(code: &str) -> Result<(), String> {
    let critical_tokens = [
        "include_str!",
        "include_bytes!",
        "include!",
        "unsafe",
        "#[link",
        "#[no_mangle",
        "export_name",
    ];

    for token in critical_tokens {
        if code.contains(token) {
            return Err(format!("Segurança: O uso de '{}' não é permitido.", token));
        }
    }

    let dangerous_modules = [
        "fs::",
        "env::",
        "process::",
        "net::",
        "thread::",
        "ffi::",
        "os::",
        "ptr::",
        "Command::",
        "File::",
        "TcpStream::",
        "UdpSocket::",
        "core::ptr",
        "alloc::alloc",
    ];

    for module in dangerous_modules {
        if code.contains(module) {
            return Err(format!(
                "Segurança: O acesso ao módulo/estrutura '{}' está bloqueado.",
                module
            ));
        }
    }

    let direct_imports = [
        "std::fs",
        "std::env",
        "std::process",
        "std::net",
        "std::thread",
        "std::ffi",
        "std::os",
        "std::ptr",
        "std::mem",
        "libc",
        "winapi",
        "std::os::unix",
    ];

    for import in direct_imports {
        if code.contains(import) {
            return Err(format!("Segurança: O uso de '{}' não é permitido.", import));
        }
    }

    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
pub struct ImportGo {
    pub path: String,
    pub has_escape: bool,
}

fn go_literals(line: &str) -> Vec<ImportGo> {
    let mut literals = Vec::new();
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '`' {
            let mut path = String::new();
            for c in chars.by_ref() {
                if c == '`' {
                    break;
                }
                path.push(c);
            }
            literals.push(ImportGo {
                path,
                has_escape: false,
            });
            continue;
        }

        if c != '"' {
            continue;
        }

        let mut path = String::new();
        let mut has_escape = false;

        while let Some(c) = chars.next() {
            match c {
                '"' => break,
                '\\' => {
                    has_escape = true;
                    chars.next();
                }
                _ => path.push(c),
            }
        }

        literals.push(ImportGo { path, has_escape });
    }

    literals
}

pub fn imports_go(code: &str) -> Vec<ImportGo> {
    let mut imports = Vec::new();
    let mut in_block = false;

    for line in code.lines() {
        let line = line.trim();

        if in_block {
            if line.starts_with(')') {
                in_block = false;
                continue;
            }
            imports.extend(go_literals(line));
            continue;
        }

        if !line.starts_with("import") {
            continue;
        }

        let rest = line.trim_start_matches("import").trim_start();

        if rest.starts_with('(') {
            in_block = !line.contains(')');
            imports.extend(go_literals(rest));
            continue;
        }

        imports.extend(go_literals(rest));
    }

    imports
}

pub fn verify_go_code(code: &str) -> Result<(), String> {
    if code.contains("//go:") {
        return Err("Segurança: Diretivas de compilação '//go:' não são permitidas.".into());
    }

    let forbidden_prefixes = [
        "os",
        "net",
        "syscall",
        "runtime",
        "unsafe",
        "plugin",
        "C",
        "path/filepath",
        "io/fs",
    ];

    for import in imports_go(code) {
        if import.has_escape {
            return Err(format!(
                "Segurança: O caminho de import '{}' usa sequências de escape, o que não é permitido.",
                import.path
            ));
        }

        for prefix in forbidden_prefixes {
            let blocked = import.path == prefix || import.path.starts_with(&format!("{}/", prefix));

            if blocked {
                return Err(format!(
                    "Segurança: O uso do pacote '{}' (ou seus subpacotes) não é permitido.",
                    prefix
                ));
            }
        }
    }

    Ok(())
}

fn normalize_cpp(code: &str) -> String {
    let mut normalized = String::with_capacity(code.len());
    let mut chars = code.chars().peekable();

    while let Some(c) = chars.next() {
        if !c.is_whitespace() {
            normalized.push(c);
            continue;
        }

        while chars.peek().is_some_and(|p| p.is_whitespace()) {
            chars.next();
        }

        if chars.peek() == Some(&'(') {
            continue;
        }

        normalized.push(' ');
    }

    normalized
}

fn is_identifier_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn occurrences<'a>(code: &'a str, target: &'a str) -> impl Iterator<Item = usize> + 'a {
    let mut start = 0;

    std::iter::from_fn(move || {
        let pos = start + code[start..].find(target)?;
        start = pos + 1;
        Some(pos)
    })
}

fn contains_identifier(code: &str, target: &str) -> bool {
    let bytes = code.as_bytes();

    occurrences(code, target).any(|pos| {
        let previous = pos.checked_sub(1).map(|i| bytes[i] as char);
        !previous.is_some_and(is_identifier_char)
    })
}

fn contains_word(code: &str, target: &str) -> bool {
    let bytes = code.as_bytes();

    occurrences(code, target).any(|pos| {
        let previous = pos.checked_sub(1).map(|i| bytes[i] as char);
        let next = bytes.get(pos + target.len()).map(|b| *b as char);

        !previous.is_some_and(is_identifier_char) && !next.is_some_and(is_identifier_char)
    })
}

fn check_cpp_calls_and_tokens(normalized: &str) -> Result<(), String> {
    let bad_calls = [
        "system(",
        "popen(",
        "fork(",
        "vfork(",
        "exec(",
        "execl(",
        "execlp(",
        "execle(",
        "execv(",
        "execve(",
        "execvp(",
        "posix_spawn(",
        "kill(",
        "socket(",
        "connect(",
        "fopen(",
        "freopen(",
        "getenv(",
        "setenv(",
        "putenv(",
        "unsetenv(",
        "dlopen(",
        "dlsym(",
        "mmap(",
        "ptrace(",
        "syscall(",
    ];

    for bad in &bad_calls {
        if contains_identifier(normalized, bad) {
            return Err(format!(
                "Segurança: A função '{}' não é permitida neste ambiente.",
                bad.trim_end_matches('(')
            ));
        }
    }

    let bad_tokens = ["ofstream", "ifstream", "fstream", "environ"];

    for bad in &bad_tokens {
        if contains_word(normalized, bad) {
            return Err(format!(
                "Segurança: O uso de '{}' não é permitido neste ambiente.",
                bad
            ));
        }
    }

    for asm in ["asm", "__asm", "__asm__"] {
        if contains_word(normalized, asm) {
            return Err(
                "Segurança: Código de montagem embutido não é permitido neste ambiente.".into(),
            );
        }
    }

    Ok(())
}

pub fn verify_cpp_preprocessed(new_lines: &str) -> Result<(), String> {
    let normalized = normalize_cpp(new_lines);
    check_cpp_calls_and_tokens(&normalized)
}

pub fn extract_include_lines(code: &str) -> Vec<&str> {
    code.lines()
        .map(str::trim)
        .filter(|line| line.starts_with("#include"))
        .collect()
}

pub fn header_baseline_source(code: &str) -> String {
    let mut source = extract_include_lines(code).join("\n");
    source.push_str("\nint main(){return 0;}\n");
    source
}

pub fn diff_new_lines(full: &str, baseline: &str) -> String {
    let mut counts: std::collections::HashMap<&str, i64> = std::collections::HashMap::new();

    for line in baseline.lines() {
        *counts.entry(line).or_insert(0) += 1;
    }

    let mut result = String::with_capacity(full.len());

    for line in full.lines() {
        let count = counts.entry(line).or_insert(0);

        if *count > 0 {
            *count -= 1;
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }

    result
}

pub fn verify_cpp_code(code: &str) -> Result<(), String> {
    let bad_includes = [
        "<unistd.h>",
        "<sys/socket.h>",
        "<sys/types.h>",
        "<sys/mman.h>",
        "<sys/stat.h>",
        "<sys/wait.h>",
        "<sys/ptrace.h>",
        "<arpa/inet.h>",
        "<netinet/in.h>",
        "<netdb.h>",
        "<windows.h>",
        "<winsock2.h>",
        "<thread>",
        "<mutex>",
        "<fstream>",
        "<filesystem>",
        "<experimental/filesystem>",
        "<cstdio>",
        "<stdio.h>",
        "<cstdlib>",
        "<stdlib.h>",
        "<dlfcn.h>",
        "<fcntl.h>",
        "<spawn.h>",
        "<pthread.h>",
        "<link.h>",
        "<csignal>",
        "<signal.h>",
    ];

    for bad in &bad_includes {
        if code.contains(bad) {
            return Err(format!(
                "Segurança: O cabeçalho '{}' não é permitido neste ambiente.",
                bad
            ));
        }
    }

    let normalized = normalize_cpp(code);
    check_cpp_calls_and_tokens(&normalized)
}

const ZIG_FORBIDDEN_PATTERNS: &[&str] = &[
    "std.os",
    "std.posix",
    "std.c",
    "std.net",
    "std.process",
    "std.Thread",
    "std.ChildProcess",
    "std.DynLib",
    "extern",
    "asm",
    "@cImport",
    "@cInclude",
    "@cDefine",
    "@extern",
    "@embedFile",
    "@syscall",
    "@field",
];

const MAX_ZIG_ALIASES: usize = 512;

fn check_zig_patterns(code: &str) -> Result<(), String> {
    for pattern in ZIG_FORBIDDEN_PATTERNS {
        if code.contains(pattern) {
            return Err(format!(
                "Segurança: O uso de '{}' não é permitido.",
                pattern
            ));
        }
    }

    if code.contains("std.fs")
        && !code.contains("std.fs.File.stdout")
        && !code.contains("std.fs.File.stderr")
    {
        return Err("Segurança: O uso geral de 'std.fs' não é permitido. Use apenas 'std.fs.File.stdout()' ou 'std.fs.File.stderr()'.".into());
    }

    Ok(())
}

fn normalize_zig(code: &str) -> String {
    let mut normalized = String::with_capacity(code.len());
    let mut chars = code.chars().peekable();

    while let Some(c) = chars.next() {
        if !c.is_whitespace() {
            normalized.push(c);
            continue;
        }

        while chars.peek().is_some_and(|p| p.is_whitespace()) {
            chars.next();
        }

        if chars.peek() == Some(&'.') || normalized.ends_with('.') {
            continue;
        }

        normalized.push(' ');
    }

    normalized
}

fn zig_binding_target(statement: &str) -> Option<(String, String)> {
    let statement = statement.trim().trim_start_matches("pub ").trim_start();

    let rest = statement
        .strip_prefix("const ")
        .or_else(|| statement.strip_prefix("var "))?;

    let (name, rhs) = rest.split_once('=')?;
    let name = name.trim();
    let rhs: String = rhs.chars().filter(|c| !c.is_whitespace()).collect();

    if name.is_empty() || !name.chars().all(is_identifier_char) {
        return None;
    }

    if rhs == "@import(\"std\")" {
        return Some((name.to_string(), "std".to_string()));
    }

    let looks_like_a_path =
        !rhs.is_empty() && rhs.chars().all(|c| is_identifier_char(c) || c == '.');

    if looks_like_a_path {
        return Some((name.to_string(), rhs));
    }

    None
}

fn zig_alias_table(code: &str) -> Result<HashMap<String, String>, String> {
    let mut aliases = HashMap::new();

    for statement in code.split(';') {
        if let Some((name, target)) = zig_binding_target(statement) {
            aliases.insert(name, target);

            if aliases.len() > MAX_ZIG_ALIASES {
                return Err(format!(
                    "Segurança: o arquivo declara mais de {} bindings; recuse-se a resolver aliases além desse limite.",
                    MAX_ZIG_ALIASES
                ));
            }
        }
    }

    Ok(aliases)
}

fn zig_resolve_one(path: &str, aliases: &HashMap<String, String>) -> Option<String> {
    let (head, rest) = match path.split_once('.') {
        Some((head, rest)) => (head, Some(rest)),
        None => (path, None),
    };

    aliases.get(head).map(|resolved_head| match rest {
        Some(rest) => format!("{resolved_head}.{rest}"),
        None => resolved_head.clone(),
    })
}

fn zig_fully_resolve(start: &str, aliases: &HashMap<String, String>) -> String {
    let mut current = start.to_string();
    let mut seen = std::collections::HashSet::new();

    while let Some(next) = zig_resolve_one(&current, aliases) {
        if next == current || !seen.insert(current.clone()) {
            break;
        }
        current = next;
    }

    current
}

fn zig_resolve_aliases_to_a_fixed_point(aliases: &mut HashMap<String, String>) {
    let snapshot = aliases.clone();

    for value in aliases.values_mut() {
        *value = zig_fully_resolve(value, &snapshot);
    }
}

fn replace_word(text: &str, target: &str, replacement: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let target_chars: Vec<char> = target.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let matches_here = chars[i..].starts_with(target_chars.as_slice());
        let before_ok = i == 0 || !is_identifier_char(chars[i - 1]);
        let after = i + target_chars.len();
        let after_ok = after >= chars.len() || !is_identifier_char(chars[after]);

        if matches_here && before_ok && after_ok {
            result.push_str(replacement);
            i = after;
            continue;
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

fn expand_zig_aliases(code: &str) -> Result<String, String> {
    let mut aliases = zig_alias_table(code)?;
    zig_resolve_aliases_to_a_fixed_point(&mut aliases);

    let mut expanded = code.to_string();
    for (name, resolved) in &aliases {
        if name != resolved {
            expanded = replace_word(&expanded, name, resolved);
        }
    }

    Ok(expanded)
}

pub fn verify_zig_code(code: &str) -> Result<(), String> {
    check_zig_patterns(code)?;

    let expanded = normalize_zig(&expand_zig_aliases(code)?);
    check_zig_patterns(&expanded)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GO_HELLO: &str = r#"package main

import "fmt"

func main() { fmt.Println("hello") }
"#;

    #[test]
    fn go_hello_still_passes() {
        assert!(verify_go_code(GO_HELLO).is_ok());
    }

    #[test]
    fn go_blocks_import_with_hex_escape() {
        let code = "package main\n\nimport (\n\t\"fmt\"\n\t\"\\x6f\\x73\"\n)\n";

        let error = verify_go_code(code).expect_err("hex escape should be blocked");

        assert!(error.contains("escape"), "{error}");
    }

    #[test]
    fn go_blocks_import_with_backtick() {
        let code = "package main\n\nimport `os`\n";

        assert!(
            verify_go_code(code).is_err(),
            "import with backtick got past the filter"
        );
    }

    #[test]
    fn go_blocks_single_line_block_import() {
        let code = "package main\n\nimport ( \"fmt\"; \"syscall\" )\n";

        assert!(
            verify_go_code(code).is_err(),
            "single-line import got through"
        );
    }

    #[test]
    fn go_blocks_subpackage_and_alias() {
        assert!(verify_go_code("package main\nimport \"os/exec\"\n").is_err());
        assert!(verify_go_code("package main\nimport (\n\tsys \"syscall\"\n)\n").is_err());
    }

    #[test]
    fn go_blocks_a_dot_import_of_a_forbidden_package() {
        let code = "package main\n\nimport . \"syscall\"\n\nfunc main() { Exit(1) }\n";

        assert!(
            verify_go_code(code).is_err(),
            "dot-import brings every exported symbol into scope unqualified, and must not bypass the path check"
        );
    }

    #[test]
    fn go_blocks_a_blank_import_of_a_forbidden_package() {
        let code = "package main\n\nimport _ \"unsafe\"\n\nfunc main() {}\n";

        assert!(
            verify_go_code(code).is_err(),
            "a blank (side-effect only) import must still be checked by path"
        );
    }

    #[test]
    fn go_does_not_confuse_a_similarly_named_package() {
        let code = "package main\n\nimport \"osmosis/fmt\"\n";

        assert!(
            verify_go_code(code).is_ok(),
            "similarly named package was blocked by mistake"
        );
    }

    #[test]
    fn go_blocks_any_go_directive() {
        assert!(verify_go_code("package main\n//go:linkname x y\n").is_err());
    }

    #[test]
    fn cpp_hello_still_passes() {
        let code = "#include <iostream>\nint main(){ std::cout << \"hello\"; }\n";

        assert!(verify_cpp_code(code).is_ok());
    }

    #[test]
    fn cpp_blocks_reading_the_environment() {
        let code = "#include <iostream>\nextern char **environ;\nint main(){ return environ != nullptr; }\n";

        let error = verify_cpp_code(code).expect_err("environ should be blocked");

        assert!(error.contains("environ"), "{error}");
    }

    #[test]
    fn cpp_blocks_system_with_a_space_before_the_paren() {
        let code = "#include <iostream>\nint main(){ std::system (\"id\"); }\n";

        assert!(
            verify_cpp_code(code).is_err(),
            "space before the parenthesis dodged the filter"
        );
    }

    #[test]
    fn cpp_blocks_inline_asm() {
        let code = "int main(){ asm volatile(\"syscall\"); }\n";

        assert!(verify_cpp_code(code).is_err(), "inline asm got through");
    }

    #[test]
    fn cpp_blocks_getenv_and_cstdlib() {
        assert!(verify_cpp_code("#include <cstdlib>\nint main(){}\n").is_err());
        assert!(verify_cpp_code("int main(){ getenv(\"HOME\"); }\n").is_err());
    }

    #[test]
    fn cpp_does_not_block_an_identifier_containing_a_token() {
        let code = "#include <iostream>\nint my_system(int x){ return x; }\nint main(){ return my_system(1); }\n";

        assert!(
            verify_cpp_code(code).is_ok(),
            "user identifier was blocked by mistake"
        );
    }

    #[test]
    fn cpp_does_not_block_a_variable_similar_to_a_forbidden_token() {
        let code = "#include <iostream>\nint main(){ int environment = 1; return environment; }\n";

        assert!(
            verify_cpp_code(code).is_ok(),
            "variable 'environment' was confused with 'environ'"
        );
    }

    #[test]
    fn header_baseline_source_keeps_only_the_includes() {
        let code =
            "#include <iostream>\n#include <vector>\n\nint main(){ system(\"id\"); return 0; }\n";

        let baseline = header_baseline_source(code);

        assert!(baseline.contains("#include <iostream>"), "{baseline}");
        assert!(baseline.contains("#include <vector>"), "{baseline}");
        assert!(
            !baseline.contains("system"),
            "the user's own body must not leak into the baseline: {baseline}"
        );
    }

    #[test]
    fn diff_new_lines_keeps_only_what_the_full_file_adds() {
        let baseline = "namespace std {\nvoid junk();\n}\n";
        let full = "namespace std {\nvoid junk();\n}\nint main(){ system(\"id\"); }\n";

        let diff = diff_new_lines(full, baseline);

        assert!(diff.contains("system(\"id\")"), "{diff}");
        assert!(!diff.contains("void junk"), "{diff}");
    }

    #[test]
    fn verify_cpp_preprocessed_catches_a_macro_that_reassembles_system() {
        let own_file_view = "#define RUN system\nint main(){ RUN(\"id\"); }\n";

        let expanded = "int main(){ system(\"id\"); }\n";

        assert!(
            verify_cpp_code(own_file_view).is_ok(),
            "raw-source check should not see through the macro"
        );
        assert!(
            verify_cpp_preprocessed(expanded).is_err(),
            "the diffed view should catch the reassembled call"
        );
    }

    fn clang_available() -> bool {
        std::process::Command::new("sh")
            .args(["-c", "command -v clang++"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn preprocess_p(dir: &std::path::Path, file_name: &str, source: &str) -> String {
        let source_path = dir.join(file_name);
        std::fs::write(&source_path, source).expect("write fixture");

        let output = std::process::Command::new("clang++")
            .args(["-E", "-P", "-std=c++20", file_name])
            .current_dir(dir)
            .output()
            .expect("clang++ should run");

        assert!(output.status.success(), "{:?}", output);

        String::from_utf8_lossy(&output.stdout).to_string()
    }

    fn scan_cpp_source(dir: &std::path::Path, code: &str) -> Result<(), String> {
        let full = preprocess_p(dir, "main.cpp", code);
        let baseline_source = header_baseline_source(code);
        let baseline = preprocess_p(dir, "baseline.cpp", &baseline_source);
        let new_lines = diff_new_lines(&full, &baseline);

        verify_cpp_preprocessed(&new_lines)
    }

    #[test]
    fn clang_preprocessing_exposes_a_macro_reconstructed_call() {
        if !clang_available() {
            eprintln!("clang++ missing; test skipped");
            return;
        }

        let dir = std::env::temp_dir().join("zeile_cpp_preprocess_test_macro");
        std::fs::create_dir_all(&dir).ok();

        let code = "#define RUN system\nint main(){ RUN(\"id\"); return 0; }\n";
        let result = scan_cpp_source(&dir, code);

        std::fs::remove_dir_all(&dir).ok();

        assert!(
            result.is_err(),
            "macro-reconstructed system() should be caught after preprocessing"
        );
    }

    #[test]
    fn diffing_is_not_fooled_by_a_forged_line_directive() {
        if !clang_available() {
            eprintln!("clang++ missing; test skipped");
            return;
        }

        let dir = std::env::temp_dir().join("zeile_cpp_preprocess_test_line");
        std::fs::create_dir_all(&dir).ok();

        let code = concat!(
            "#define RUN system\n",
            "#line 1 \"/usr/include/c++/v1/fake_header.h\"\n",
            "static void evil(){ RUN(\"id\"); }\n",
            "#line 20 \"main.cpp\"\n",
            "int main(){ evil(); return 0; }\n",
        );
        let result = scan_cpp_source(&dir, code);

        std::fs::remove_dir_all(&dir).ok();

        assert!(
            result.is_err(),
            "a #line directive claiming the call lives in a header must not hide it"
        );
    }

    #[test]
    fn diffing_is_not_fooled_by_a_raw_string_forging_a_marker_line() {
        if !clang_available() {
            eprintln!("clang++ missing; test skipped");
            return;
        }

        let dir = std::env::temp_dir().join("zeile_cpp_preprocess_test_raw_string");
        std::fs::create_dir_all(&dir).ok();

        let code = concat!(
            "#define RUN system\n",
            "const char* fake_marker = R\"(\n",
            "# 1 \"/usr/include/c++/v1/fake.h\"\n",
            ")\";\n",
            "int main(){ RUN(\"id\"); return 0; }\n",
        );
        let result = scan_cpp_source(&dir, code);

        std::fs::remove_dir_all(&dir).ok();

        assert!(
            result.is_err(),
            "a raw string that looks like a marker line must not hide subsequent code"
        );
    }

    #[test]
    fn zig_blocks_posix_and_cimport() {
        assert!(verify_zig_code("const p = std.posix;").is_err());
        assert!(verify_zig_code("const c = @cImport({});").is_err());
    }

    #[test]
    fn zig_still_allows_stdout() {
        let code = "const std = @import(\"std\");\npub fn main() void { const o = std.fs.File.stdout(); _ = o; }\n";

        assert!(verify_zig_code(code).is_ok());
    }

    #[test]
    fn zig_blocks_a_chained_alias_of_std_itself() {
        let code = "const s = std;\nconst p = s.posix;\npub fn main() void { p.exit(0); }\n";

        assert!(
            verify_zig_code(code).is_err(),
            "aliasing std itself before reaching a forbidden submodule must not bypass the check"
        );
    }

    #[test]
    fn zig_blocks_an_alias_from_a_renamed_import() {
        let code =
            "const s = @import(\"std\");\nconst p = s.posix;\npub fn main() void { p.exit(0); }\n";

        assert!(
            verify_zig_code(code).is_err(),
            "renaming @import(\"std\") itself must not bypass the check"
        );
    }

    #[test]
    fn zig_blocks_a_deeper_alias_chain() {
        let code =
            "const a = std;\nconst b = a;\nconst c = b.posix;\npub fn main() void { c.exit(0); }\n";

        assert!(verify_zig_code(code).is_err());
    }

    #[test]
    fn zig_blocks_whitespace_split_around_the_dot() {
        let code = "pub fn main() void { std . posix.exit(0); }\n";

        assert!(
            verify_zig_code(code).is_err(),
            "whitespace around the dot must not bypass the substring check"
        );
    }

    #[test]
    fn zig_blocks_reflective_field_access() {
        let code = "pub fn main() void { @field(std, \"posix\").exit(0); }\n";

        assert!(
            verify_zig_code(code).is_err(),
            "@field is a reflective, builtin path to any namespace and has no legitimate use here"
        );
    }

    #[test]
    fn zig_rejects_an_excessive_number_of_bindings_instead_of_silently_skipping_them() {
        let mut code = String::new();
        for i in 0..(MAX_ZIG_ALIASES + 1) {
            code.push_str(&format!("const junk_{i} = 1;\n"));
        }
        code.push_str("pub fn main() void {}\n");

        assert!(
            verify_zig_code(&code).is_err(),
            "an excessive binding count must be rejected outright, not silently skipped from resolution"
        );
    }

    #[test]
    fn zig_does_not_confuse_an_unrelated_alias() {
        let code =
            "const not_std = 1;\nconst posix = not_std;\npub fn main() void { _ = posix; }\n";

        assert!(
            verify_zig_code(code).is_ok(),
            "an alias unrelated to std must not be flagged"
        );
    }
}
