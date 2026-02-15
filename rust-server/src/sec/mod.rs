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
