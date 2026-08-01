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
    pub caminho: String,
    pub tem_escape: bool,
}

fn literais_go(linha: &str) -> Vec<ImportGo> {
    let mut literais = Vec::new();
    let mut chars = linha.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '`' {
            let mut caminho = String::new();
            for c in chars.by_ref() {
                if c == '`' {
                    break;
                }
                caminho.push(c);
            }
            literais.push(ImportGo {
                caminho,
                tem_escape: false,
            });
            continue;
        }

        if c != '"' {
            continue;
        }

        let mut caminho = String::new();
        let mut tem_escape = false;

        while let Some(c) = chars.next() {
            match c {
                '"' => break,
                '\\' => {
                    tem_escape = true;
                    chars.next();
                }
                _ => caminho.push(c),
            }
        }

        literais.push(ImportGo {
            caminho,
            tem_escape,
        });
    }

    literais
}

pub fn imports_go(code: &str) -> Vec<ImportGo> {
    let mut imports = Vec::new();
    let mut em_bloco = false;

    for linha in code.lines() {
        let linha = linha.trim();

        if em_bloco {
            if linha.starts_with(')') {
                em_bloco = false;
                continue;
            }
            imports.extend(literais_go(linha));
            continue;
        }

        if !linha.starts_with("import") {
            continue;
        }

        let resto = linha.trim_start_matches("import").trim_start();

        if resto.starts_with('(') {
            em_bloco = !linha.contains(')');
            imports.extend(literais_go(resto));
            continue;
        }

        imports.extend(literais_go(resto));
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
        if import.tem_escape {
            return Err(format!(
                "Segurança: O caminho de import '{}' usa sequências de escape, o que não é permitido.",
                import.caminho
            ));
        }

        for prefix in forbidden_prefixes {
            let bloqueado = import.caminho == prefix
                || import.caminho.starts_with(&format!("{}/", prefix));

            if bloqueado {
                return Err(format!(
                    "Segurança: O uso do pacote '{}' (ou seus subpacotes) não é permitido.",
                    prefix
                ));
            }
        }
    }

    Ok(())
}

fn normalizar_cpp(code: &str) -> String {
    let mut normalizado = String::with_capacity(code.len());
    let mut chars = code.chars().peekable();

    while let Some(c) = chars.next() {
        if !c.is_whitespace() {
            normalizado.push(c);
            continue;
        }

        while chars.peek().is_some_and(|p| p.is_whitespace()) {
            chars.next();
        }

        if chars.peek() == Some(&'(') {
            continue;
        }

        normalizado.push(' ');
    }

    normalizado
}

fn eh_char_de_identificador(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn ocorrencias<'a>(code: &'a str, alvo: &'a str) -> impl Iterator<Item = usize> + 'a {
    let mut inicio = 0;

    std::iter::from_fn(move || {
        let pos = inicio + code[inicio..].find(alvo)?;
        inicio = pos + 1;
        Some(pos)
    })
}

fn contem_identificador(code: &str, alvo: &str) -> bool {
    let bytes = code.as_bytes();

    ocorrencias(code, alvo).any(|pos| {
        let anterior = pos.checked_sub(1).map(|i| bytes[i] as char);
        !anterior.is_some_and(eh_char_de_identificador)
    })
}

fn contem_palavra(code: &str, alvo: &str) -> bool {
    let bytes = code.as_bytes();

    ocorrencias(code, alvo).any(|pos| {
        let anterior = pos.checked_sub(1).map(|i| bytes[i] as char);
        let seguinte = bytes.get(pos + alvo.len()).map(|b| *b as char);

        !anterior.is_some_and(eh_char_de_identificador)
            && !seguinte.is_some_and(eh_char_de_identificador)
    })
}

pub fn verify_cpp_code(codigo: &str) -> Result<(), String> {
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
        if codigo.contains(bad) {
            return Err(format!(
                "Segurança: O cabeçalho '{}' não é permitido neste ambiente.",
                bad
            ));
        }
    }

    let normalizado = normalizar_cpp(codigo);

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
        if contem_identificador(&normalizado, bad) {
            return Err(format!(
                "Segurança: A função '{}' não é permitida neste ambiente.",
                bad.trim_end_matches('(')
            ));
        }
    }

    let bad_tokens = ["ofstream", "ifstream", "fstream", "environ"];

    for bad in &bad_tokens {
        if contem_palavra(&normalizado, bad) {
            return Err(format!(
                "Segurança: O uso de '{}' não é permitido neste ambiente.",
                bad
            ));
        }
    }

    for asm in ["asm", "__asm", "__asm__"] {
        if contem_palavra(&normalizado, asm) {
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

    // Permitir apenas o uso específico de stdout/stderr de std.fs para Zig 0.15.2
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

func main() { fmt.Println("ola") }
"#;

    #[test]
    fn go_hello_continua_passando() {
        assert!(verify_go_code(GO_HELLO).is_ok());
    }

    #[test]
    fn go_bloqueia_import_com_escape_hexadecimal() {
        let code = "package main\n\nimport (\n\t\"fmt\"\n\t\"\\x6f\\x73\"\n)\n";

        let erro = verify_go_code(code).expect_err("escape hexadecimal deveria ser barrado");

        assert!(erro.contains("escape"), "{erro}");
    }

    #[test]
    fn go_bloqueia_import_com_backtick() {
        let code = "package main\n\nimport `os`\n";

        assert!(
            verify_go_code(code).is_err(),
            "import com backtick passou pelo filtro"
        );
    }

    #[test]
    fn go_bloqueia_import_em_bloco_de_uma_linha() {
        let code = "package main\n\nimport ( \"fmt\"; \"syscall\" )\n";

        assert!(verify_go_code(code).is_err(), "import em linha unica passou");
    }

    #[test]
    fn go_bloqueia_subpacote_e_alias() {
        assert!(verify_go_code("package main\nimport \"os/exec\"\n").is_err());
        assert!(verify_go_code("package main\nimport (\n\tsys \"syscall\"\n)\n").is_err());
    }

    #[test]
    fn go_nao_confunde_pacote_de_nome_parecido() {
        let code = "package main\n\nimport \"osmosis/fmt\"\n";

        assert!(
            verify_go_code(code).is_ok(),
            "pacote de nome parecido foi bloqueado por engano"
        );
    }

    #[test]
    fn go_bloqueia_qualquer_diretiva_go() {
        assert!(verify_go_code("package main\n//go:linkname x y\n").is_err());
    }

    #[test]
    fn cpp_hello_continua_passando() {
        let code = "#include <iostream>\nint main(){ std::cout << \"ola\"; }\n";

        assert!(verify_cpp_code(code).is_ok());
    }

    #[test]
    fn cpp_bloqueia_leitura_do_ambiente() {
        let code = "#include <iostream>\nextern char **environ;\nint main(){ return environ != nullptr; }\n";

        let erro = verify_cpp_code(code).expect_err("environ deveria ser barrado");

        assert!(erro.contains("environ"), "{erro}");
    }

    #[test]
    fn cpp_bloqueia_system_com_espaco_antes_do_parentese() {
        let code = "#include <iostream>\nint main(){ std::system (\"id\"); }\n";

        assert!(
            verify_cpp_code(code).is_err(),
            "espaço antes do parêntese driblou o filtro"
        );
    }

    #[test]
    fn cpp_bloqueia_asm_embutido() {
        let code = "int main(){ asm volatile(\"syscall\"); }\n";

        assert!(verify_cpp_code(code).is_err(), "asm embutido passou");
    }

    #[test]
    fn cpp_bloqueia_getenv_e_cstdlib() {
        assert!(verify_cpp_code("#include <cstdlib>\nint main(){}\n").is_err());
        assert!(verify_cpp_code("int main(){ getenv(\"HOME\"); }\n").is_err());
    }

    #[test]
    fn cpp_nao_bloqueia_identificador_que_contem_token() {
        let code = "#include <iostream>\nint meu_system(int x){ return x; }\nint main(){ return meu_system(1); }\n";

        assert!(
            verify_cpp_code(code).is_ok(),
            "identificador do usuário foi bloqueado por engano"
        );
    }

    #[test]
    fn cpp_nao_bloqueia_variavel_parecida_com_token_proibido() {
        let code = "#include <iostream>\nint main(){ int environment = 1; return environment; }\n";

        assert!(
            verify_cpp_code(code).is_ok(),
            "variável 'environment' foi confundida com 'environ'"
        );
    }

    #[test]
    fn zig_bloqueia_posix_e_cimport() {
        assert!(verify_zig_code("const p = std.posix;").is_err());
        assert!(verify_zig_code("const c = @cImport({});").is_err());
    }

    #[test]
    fn zig_continua_permitindo_stdout() {
        let code = "const std = @import(\"std\");\npub fn main() void { const o = std.fs.File.stdout(); _ = o; }\n";

        assert!(verify_zig_code(code).is_ok());
    }
}
