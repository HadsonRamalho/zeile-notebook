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

        literals.push(ImportGo {
            path,
            has_escape,
        });
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
            let blocked = import.path == prefix
                || import.path.starts_with(&format!("{}/", prefix));

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

        !previous.is_some_and(is_identifier_char)
            && !next.is_some_and(is_identifier_char)
    })
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
        if contains_identifier(&normalized, bad) {
            return Err(format!(
                "Segurança: A função '{}' não é permitida neste ambiente.",
                bad.trim_end_matches('(')
            ));
        }
    }

    let bad_tokens = ["ofstream", "ifstream", "fstream", "environ"];

    for bad in &bad_tokens {
        if contains_word(&normalized, bad) {
            return Err(format!(
                "Segurança: O uso de '{}' não é permitido neste ambiente.",
                bad
            ));
        }
    }

    for asm in ["asm", "__asm", "__asm__"] {
        if contains_word(&normalized, asm) {
            return Err(
                "Segurança: Código de montagem embutido não é permitido neste ambiente.".into(),
            );
        }
    }

    Ok(())
}

pub fn verify_zig_code(code: &str) -> Result<(), String> {
    let forbidden_patterns = [
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
    ];

    for pattern in forbidden_patterns {
        if code.contains(pattern) {
            return Err(format!(
                "Segurança: O uso de '{}' não é permitido.",
                pattern
            ));
        }
    }

    // Only allow the specific use of stdout/stderr from std.fs for Zig 0.15.2
    if code.contains("std.fs")
        && !code.contains("std.fs.File.stdout")
        && !code.contains("std.fs.File.stderr")
    {
        return Err("Segurança: O uso geral de 'std.fs' não é permitido. Use apenas 'std.fs.File.stdout()' ou 'std.fs.File.stderr()'.".into());
    }

    Ok(())
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

        assert!(verify_go_code(code).is_err(), "single-line import got through");
    }

    #[test]
    fn go_blocks_subpackage_and_alias() {
        assert!(verify_go_code("package main\nimport \"os/exec\"\n").is_err());
        assert!(verify_go_code("package main\nimport (\n\tsys \"syscall\"\n)\n").is_err());
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
    fn zig_blocks_posix_and_cimport() {
        assert!(verify_zig_code("const p = std.posix;").is_err());
        assert!(verify_zig_code("const c = @cImport({});").is_err());
    }

    #[test]
    fn zig_still_allows_stdout() {
        let code = "const std = @import(\"std\");\npub fn main() void { const o = std.fs.File.stdout(); _ = o; }\n";

        assert!(verify_zig_code(code).is_ok());
    }
}
