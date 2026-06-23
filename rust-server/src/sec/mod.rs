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

pub fn verify_go_code(code: &str) -> Result<(), String> {
    if code.contains("//go:generate") || code.contains("//go:build") || code.contains("//go:cgo") {
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

    for prefix in forbidden_prefixes {
        let exact_import = format!("\"{}\"", prefix);
        let sub_import = format!("\"{}/", prefix);

        if code.contains(&exact_import) || code.contains(&sub_import) {
            eprintln!("LOG: Bloqueado pelo prefixo: {}", prefix);
            return Err(format!(
                "Segurança: O uso do pacote '{}' (ou seus subpacotes) não é permitido.",
                prefix
            ));
        }
    }

    Ok(())
}

pub fn verify_cpp_code(codigo: &str) -> Result<(), String> {
    let bad_includes = [
        "<unistd.h>",
        "<sys/socket.h>",
        "<sys/types.h>",
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
    ];

    for bad in &bad_includes {
        if codigo.contains(bad) {
            return Err(format!(
                "Segurança: O cabeçalho '{}' não é permitido neste ambiente.",
                bad
            ));
        }
    }

    let bad_functions = [
        "system(", "popen(", "fork(", "exec(", "kill(", "socket(", "connect(",
        "fopen(", "freopen(", "ofstream", "ifstream", "fstream",
    ];

    for bad in &bad_functions {
        if codigo.contains(bad) {
            return Err(format!(
                "Segurança: A função '{}' não é permitida neste ambiente.",
                bad
            ));
        }
    }

    Ok(())
}

pub fn verify_zig_code(code: &str) -> Result<(), String> {
    let forbidden_patterns = [
        "std.os",
        "std.net",
        "std.process",
        "std.Thread",
        "extern",
        "asm",
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
