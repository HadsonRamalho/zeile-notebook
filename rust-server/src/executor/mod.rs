use std::path::{Path, PathBuf};
use tracing::info;

use crate::executor::sandbox::{CompileSandbox, caminho_absoluto};
use crate::file::{RunLimits, RunOutcome, run_safe_bin, setup_user_env};
use crate::sec::{verify_code, verify_cpp_code, verify_go_code, verify_zig_code};

pub mod sandbox;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecVerdict {
    Ok,
    CompileError,
    RuntimeError,
    Timeout,
}

#[derive(Debug, Clone)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub verdict: ExecVerdict,
    pub wall_ms: u64,
}

impl ExecResult {
    fn compile_error(message: String) -> Self {
        ExecResult {
            stdout: String::new(),
            stderr: message,
            verdict: ExecVerdict::CompileError,
            wall_ms: 0,
        }
    }

    fn from_run(out: RunOutcome) -> Self {
        let verdict = if out.timed_out {
            ExecVerdict::Timeout
        } else if out.exit_ok {
            ExecVerdict::Ok
        } else {
            ExecVerdict::RuntimeError
        };
        ExecResult {
            stdout: out.stdout,
            stderr: out.stderr,
            verdict,
            wall_ms: out.wall_ms,
        }
    }
}

pub fn sanitize_session(session: &str) -> String {
    session.replace(|c: char| !c.is_alphanumeric(), "_")
}

pub async fn compile_code(language: &str, code: &str, session: &str) -> Result<String, String> {
    let safe_session = sanitize_session(session);
    match language {
        "rust" => compile_rust(code, &safe_session).await,
        "go" => compile_go(code, &safe_session).await,
        "cpp" => compile_cpp(code, &safe_session).await,
        "zig" => compile_zig(code, &safe_session).await,
        other => Err(format!("Linguagem não suportada: {}", other)),
    }
}

pub async fn run_compiled(bin_path: &str, stdin: Option<&str>, limits: RunLimits) -> ExecResult {
    ExecResult::from_run(run_safe_bin(bin_path, stdin, limits).await)
}

pub async fn execute_code(
    language: &str,
    code: &str,
    stdin: Option<&str>,
    session: &str,
    limits: RunLimits,
) -> ExecResult {
    match compile_code(language, code, session).await {
        Ok(bin_path) => run_compiled(&bin_path, stdin, limits).await,
        Err(msg) => ExecResult::compile_error(msg),
    }
}

async fn compile_rust(code: &str, safe_session: &str) -> Result<String, String> {
    verify_code(code)?;

    let project_path = setup_user_env(safe_session).await;
    let src_path = project_path.join("src");
    let file_path = src_path.join("main.rs");

    let safe_code = format!("#![forbid(unsafe_code)]\n{}", code);
    tokio::fs::write(&file_path, &safe_code)
        .await
        .map_err(|e| format!("Erro ao salvar arquivo: {}", e))?;

    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let abs_project_path = std::fs::canonicalize(&project_path)
        .unwrap_or_else(|_| current_dir.join(&project_path))
        .to_string_lossy()
        .to_string();

    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let rustup_dir =
        std::env::var("RUSTUP_HOME").unwrap_or_else(|_| format!("{}/.rustup", home_dir));
    let cargo_dir = std::env::var("CARGO_HOME").unwrap_or_else(|_| format!("{}/.cargo", home_dir));

    let compile_output = CompileSandbox::new(abs_project_path)
        .com_toolchain(rustup_dir.clone())
        .com_toolchain(cargo_dir.clone())
        .com_env("HOME", home_dir)
        .com_env("PATH", format!("{}/bin:/usr/bin:/bin", cargo_dir))
        .com_env("RUSTUP_HOME", rustup_dir)
        .com_env("CARGO_HOME", cargo_dir)
        .command(
            "cargo",
            &[
                "build",
                "--message-format=json",
                "--target=wasm32-wasip1",
                "--offline",
                "-q",
            ],
        )
        .output()
        .await
        .map_err(|e| format!("Erro ao invocar cargo: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&compile_output.stdout);
    let mut formatted_errors = String::new();
    let mut exe_path: Option<String> = None;

    for line in stdout_str.lines() {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(message) = val.get("message") {
                if let Some(rendered) = message.get("rendered").and_then(|r| r.as_str()) {
                    formatted_errors.push_str(rendered);
                    formatted_errors.push('\n');
                }
            }
            if val.get("reason").and_then(|r| r.as_str()) == Some("compiler-artifact") {
                if let Some(executable) = val.get("executable").and_then(|v| v.as_str()) {
                    if let Some(name) = Path::new(executable).file_name() {
                        let real_path = project_path.join("target/wasm32-wasip1/debug").join(name);
                        exe_path = Some(real_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    if !compile_output.status.success() {
        let final_stderr = if !formatted_errors.is_empty() {
            formatted_errors
        } else {
            String::from_utf8_lossy(&compile_output.stderr).to_string()
        };
        return Err(format!("Erro de Compilação:\n{}", final_stderr));
    }

    let path = exe_path.unwrap_or_else(|| {
        project_path
            .join("target/wasm32-wasip1/debug")
            .join(format!("app_{}.wasm", safe_session))
            .to_string_lossy()
            .to_string()
    });

    info!("Submissão Rust compilada: {}", path);
    Ok(path)
}

async fn compile_go(code: &str, safe_session: &str) -> Result<String, String> {
    verify_go_code(code)?;

    let bin_name = format!("app_{}", safe_session);
    let user_dir = format!("files/go/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.go");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    tokio::fs::write(&file_path, code)
        .await
        .map_err(|e| e.to_string())?;

    let go_path = std::env::var("GO_PATH").unwrap_or_else(|_| "go".to_string());
    let sandbox = CompileSandbox::new(caminho_absoluto(&user_dir)?)
        .com_compilador(&go_path)
        .com_cache_compartilhado();

    let compile_output = sandbox
        .clone()
        .com_env("GOCACHE", sandbox.cache_path("go-build"))
        .com_env("GOMODCACHE", sandbox.cache_path("go-mod"))
        .com_env("GOPATH", "/app/.go")
        // `#cgo` faz o go invocar o compilador C com flags do próprio código do usuário
        .com_env("CGO_ENABLED", "0")
        // sem rede no sandbox: `local` falha dizendo isso em vez de tentar baixar
        .com_env("GOTOOLCHAIN", "local")
        .command(&go_path, &["build", "-o", &bin_name, "main.go"])
        .output()
        .await;

    match compile_output {
        Ok(out) if out.status.success() => Ok(bin_path.to_string_lossy().to_string()),
        Ok(out) => Err(format!(
            "Erro de Compilação Go:\n{}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Err(e) => Err(format!("Falha ao invocar compilador Go: {}", e)),
    }
}

async fn compile_cpp(code: &str, safe_session: &str) -> Result<String, String> {
    verify_cpp_code(code)?;

    let bin_name = format!("app_{}", safe_session);
    let user_dir = format!("files/cpp/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.cpp");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    tokio::fs::write(&file_path, code)
        .await
        .map_err(|e| e.to_string())?;

    let cpp_path = std::env::var("CPP_PATH").unwrap_or_else(|_| "clang++".to_string());
    let compile_output = CompileSandbox::new(caminho_absoluto(&user_dir)?)
        .com_compilador(&cpp_path)
        .command(
            &cpp_path,
            &["-O2", "-std=c++20", "-o", &bin_name, "main.cpp"],
        )
        .output()
        .await;

    match compile_output {
        Ok(out) if out.status.success() => Ok(bin_path.to_string_lossy().to_string()),
        Ok(out) => Err(format!(
            "Erro de Compilação C++:\n{}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Err(e) => Err(format!("Falha ao invocar compilador C++: {}", e)),
    }
}

async fn compile_zig(code: &str, safe_session: &str) -> Result<String, String> {
    verify_zig_code(code)?;

    let bin_name = format!("app_{}", safe_session);
    let user_dir = format!("files/zig/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.zig");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    tokio::fs::write(&file_path, code)
        .await
        .map_err(|e| e.to_string())?;

    let zig_path = std::env::var("ZIG_PATH").unwrap_or_else(|_| "zig".to_string());
    let sandbox = CompileSandbox::new(caminho_absoluto(&user_dir)?)
        .com_compilador(&zig_path)
        .com_cache_compartilhado();

    // o cache padrão do zig fica no HOME, que aqui é somente-leitura
    let cache_global = sandbox.cache_path("zig");

    let compile_output = sandbox
        .command(
            &zig_path,
            &[
                "build-exe",
                "-O",
                "ReleaseSmall",
                "--cache-dir",
                "/app/.zig-cache",
                "--global-cache-dir",
                &cache_global,
                "--name",
                &bin_name,
                "main.zig",
            ],
        )
        .output()
        .await;

    match compile_output {
        Ok(out) if out.status.success() => Ok(bin_path.to_string_lossy().to_string()),
        Ok(out) => Err(format!(
            "Erro de Compilação Zig:\n{}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Err(e) => Err(format!("Falha ao invocar compilador Zig: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELLO_GO: &str = r#"package main

import "fmt"

func main() { fmt.Println("ola do sandbox") }
"#;

    const HELLO_CPP: &str = r#"#include <iostream>
int main() { std::cout << "ola do sandbox" << std::endl; }
"#;

    fn existe(binario: &str) -> bool {
        std::process::Command::new("sh")
            .args(["-c", &format!("command -v {binario}")])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn tem_sandbox() -> bool {
        existe("bwrap") && existe("prlimit")
    }

    struct Sessao(String);

    impl Sessao {
        fn nova(nome: &str) -> Self {
            Self(format!("teste_{nome}"))
        }

        fn dir(&self, linguagem: &str) -> String {
            format!("files/{linguagem}/{}", self.0)
        }
    }

    impl Drop for Sessao {
        fn drop(&mut self) {
            for linguagem in ["go", "cpp", "zig"] {
                let _ = std::fs::remove_dir_all(self.dir(linguagem));
            }
        }
    }

    async fn envelope_de_teste(comando: &str, args: &[&str]) -> std::process::Output {
        let dir = "files/teste_envelope";
        std::fs::create_dir_all(dir).expect("diretório da sessão");
        let abs = caminho_absoluto(dir).expect("caminho absoluto");

        CompileSandbox::new(abs)
            .command(comando, args)
            .output()
            .await
            .expect("envelope deveria executar")
    }

    #[tokio::test]
    async fn o_envelope_de_compilacao_nao_enxerga_o_host() {
        if !tem_sandbox() {
            eprintln!("bwrap/prlimit ausente; teste pulado");
            return;
        }

        let saida = envelope_de_teste("ls", &["/etc"]).await;

        assert!(
            !saida.status.success(),
            "/etc do host ficou visível para o compilador: {}",
            String::from_utf8_lossy(&saida.stdout)
        );
    }

    #[tokio::test]
    async fn o_envelope_de_compilacao_so_escreve_no_workspace_da_sessao() {
        if !tem_sandbox() {
            eprintln!("bwrap/prlimit ausente; teste pulado");
            return;
        }

        let dentro = envelope_de_teste("touch", &["/app/permitido"]).await;
        assert!(dentro.status.success(), "escrita em /app deveria funcionar");

        let fora = envelope_de_teste("touch", &["/usr/invasao"]).await;
        assert!(!fora.status.success(), "/usr deveria estar somente-leitura");

        let _ = std::fs::remove_file("files/teste_envelope/permitido");
        let _ = std::fs::remove_dir_all("files/teste_envelope");
    }

    #[tokio::test]
    async fn go_compila_dentro_do_sandbox_e_o_binario_roda() {
        if !tem_sandbox() || !existe("go") {
            eprintln!("go/bwrap ausente; teste pulado");
            return;
        }

        let sessao = Sessao::nova("go_hello");
        let bin = compile_code("go", HELLO_GO, &sessao.0)
            .await
            .expect("go deveria compilar dentro do sandbox");

        let resultado = run_compiled(&bin, None, RunLimits::default()).await;

        assert_eq!(resultado.verdict, ExecVerdict::Ok, "{resultado:?}");
        assert!(resultado.stdout.contains("ola do sandbox"), "{resultado:?}");
    }

    /// o Rust já compilava sob `bwrap`; o que este teste protege é a adição do
    /// `prlimit` — um teto apertado demais quebraria o `rustc` sem quebrar Go nem C++
    #[tokio::test]
    async fn rust_continua_compilando_com_o_envelope_completo() {
        if !tem_sandbox() || !existe("cargo") {
            eprintln!("cargo/bwrap ausente; teste pulado");
            return;
        }

        let alvo_instalado = std::process::Command::new("rustup")
            .args(["target", "list", "--installed"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains("wasm32-wasip1"))
            .unwrap_or(false);

        if !alvo_instalado {
            eprintln!("alvo wasm32-wasip1 ausente; teste pulado");
            return;
        }

        let sessao = "teste_rust_hello";
        let bin = compile_code(
            "rust",
            "fn main() { println!(\"ola do sandbox\"); }",
            sessao,
        )
        .await;

        let _ = std::fs::remove_dir_all(format!("files/{sessao}"));

        assert!(bin.is_ok(), "rust deveria compilar: {bin:?}");
    }

    #[tokio::test]
    async fn cpp_compila_dentro_do_sandbox_e_o_binario_roda() {
        if !tem_sandbox() || !(existe("clang++") || existe("g++")) {
            eprintln!("clang++/g++/bwrap ausente; teste pulado");
            return;
        }

        let sessao = Sessao::nova("cpp_hello");
        let bin = compile_code("cpp", HELLO_CPP, &sessao.0)
            .await
            .expect("c++ deveria compilar dentro do sandbox");

        let resultado = run_compiled(&bin, None, RunLimits::default()).await;

        assert_eq!(resultado.verdict, ExecVerdict::Ok, "{resultado:?}");
        assert!(resultado.stdout.contains("ola do sandbox"), "{resultado:?}");
    }
}
