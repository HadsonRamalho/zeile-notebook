use std::path::{Path, PathBuf};
use tokio::process::Command;
use tracing::info;

use crate::file::{RunLimits, RunOutcome, run_safe_bin, setup_user_env};
use crate::sec::{verify_code, verify_cpp_code, verify_go_code, verify_zig_code};

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

pub async fn execute_code(
    language: &str,
    code: &str,
    stdin: Option<&str>,
    session: &str,
    limits: RunLimits,
) -> ExecResult {
    let safe_session = sanitize_session(session);
    match language {
        "rust" => exec_rust(code, stdin, &safe_session, limits).await,
        "go" => exec_go(code, stdin, &safe_session, limits).await,
        "cpp" => exec_cpp(code, stdin, &safe_session, limits).await,
        "zig" => exec_zig(code, stdin, &safe_session, limits).await,
        other => ExecResult::compile_error(format!("Linguagem não suportada: {}", other)),
    }
}

async fn exec_rust(
    code: &str,
    stdin: Option<&str>,
    safe_session: &str,
    limits: RunLimits,
) -> ExecResult {
    if let Err(msg) = verify_code(code) {
        return ExecResult::compile_error(msg);
    }

    let project_path = setup_user_env(safe_session).await;
    let src_path = project_path.join("src");
    let file_path = src_path.join("main.rs");

    let safe_code = format!("#![forbid(unsafe_code)]\n{}", code);
    if let Err(e) = tokio::fs::write(&file_path, &safe_code).await {
        return ExecResult::compile_error(format!("Erro ao salvar arquivo: {}", e));
    }

    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let abs_project_path = std::fs::canonicalize(&project_path)
        .unwrap_or_else(|_| current_dir.join(&project_path))
        .to_string_lossy()
        .to_string();

    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let rustup_dir =
        std::env::var("RUSTUP_HOME").unwrap_or_else(|_| format!("{}/.rustup", home_dir));
    let cargo_dir = std::env::var("CARGO_HOME").unwrap_or_else(|_| format!("{}/.cargo", home_dir));

    let mut build_cmd = Command::new("bwrap");
    build_cmd.args(["--unshare-all", "--die-with-parent", "--new-session"]);
    build_cmd.args(["--ro-bind", "/usr", "/usr"]);
    build_cmd.args(["--ro-bind-try", "/lib", "/lib"]);
    build_cmd.args(["--ro-bind-try", "/lib64", "/lib64"]);
    build_cmd.args(["--ro-bind-try", "/bin", "/bin"]);
    build_cmd.args(["--dev", "/dev", "--proc", "/proc", "--dir", "/tmp"]);
    build_cmd.args(["--ro-bind-try", &rustup_dir, &rustup_dir]);
    build_cmd.args(["--ro-bind-try", &cargo_dir, &cargo_dir]);
    build_cmd.args(["--bind", &abs_project_path, "/app"]);
    build_cmd.args(["--chdir", "/app"]);
    build_cmd.env("PATH", format!("{}/bin:/usr/bin:/bin", cargo_dir));
    build_cmd.env("HOME", &home_dir);
    build_cmd
        .arg("cargo")
        .arg("build")
        .arg("--message-format=json")
        .arg("--target=wasm32-wasip1")
        .arg("--offline")
        .arg("-q");

    let compile_output = match build_cmd.output().await {
        Ok(out) => out,
        Err(e) => return ExecResult::compile_error(format!("Erro ao invocar cargo: {}", e)),
    };

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
                        let real_path = project_path
                            .join("target/wasm32-wasip1/debug")
                            .join(name);
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
        return ExecResult::compile_error(format!("Erro de Compilação:\n{}", final_stderr));
    }

    let path = exe_path.unwrap_or_else(|| {
        project_path
            .join("target/wasm32-wasip1/debug")
            .join(format!("app_{}.wasm", safe_session))
            .to_string_lossy()
            .to_string()
    });

    info!("Executando submissão Rust: {}", path);
    ExecResult::from_run(run_safe_bin(&path, stdin, limits).await)
}

async fn exec_go(
    code: &str,
    stdin: Option<&str>,
    safe_session: &str,
    limits: RunLimits,
) -> ExecResult {
    if let Err(msg) = verify_go_code(code) {
        return ExecResult::compile_error(msg);
    }

    let bin_name = format!("app_{}", safe_session);
    let user_dir = format!("files/go/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.go");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    if let Err(e) = tokio::fs::write(&file_path, code).await {
        return ExecResult::compile_error(e.to_string());
    }

    let go_path = std::env::var("GO_PATH").unwrap_or_else(|_| "go".to_string());
    let compile_output = Command::new(go_path)
        .current_dir(&user_dir)
        .arg("build")
        .arg("-o")
        .arg(&bin_name)
        .arg("main.go")
        .output()
        .await;

    match compile_output {
        Ok(out) if out.status.success() => {
            let bin_path_str = bin_path.to_string_lossy().to_string();
            ExecResult::from_run(run_safe_bin(&bin_path_str, stdin, limits).await)
        }
        Ok(out) => ExecResult::compile_error(format!(
            "Erro de Compilação Go:\n{}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Err(e) => ExecResult::compile_error(format!("Falha ao invocar compilador Go: {}", e)),
    }
}

async fn exec_cpp(
    code: &str,
    stdin: Option<&str>,
    safe_session: &str,
    limits: RunLimits,
) -> ExecResult {
    if let Err(msg) = verify_cpp_code(code) {
        return ExecResult::compile_error(msg);
    }

    let bin_name = format!("app_{}", safe_session);
    let user_dir = format!("files/cpp/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.cpp");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    if let Err(e) = tokio::fs::write(&file_path, code).await {
        return ExecResult::compile_error(e.to_string());
    }

    let cpp_path = std::env::var("CPP_PATH").unwrap_or_else(|_| "clang++".to_string());
    let compile_output = Command::new("prlimit")
        .current_dir(&user_dir)
        .arg("--cpu=10")
        .arg("--as=2147483648")
        .arg("--")
        .arg(&cpp_path)
        .arg("-O2")
        .arg("-std=c++20")
        .arg("-o")
        .arg(&bin_name)
        .arg("main.cpp")
        .output()
        .await;

    match compile_output {
        Ok(out) if out.status.success() => {
            let bin_path_str = bin_path.to_string_lossy().to_string();
            ExecResult::from_run(run_safe_bin(&bin_path_str, stdin, limits).await)
        }
        Ok(out) => ExecResult::compile_error(format!(
            "Erro de Compilação C++:\n{}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Err(e) => ExecResult::compile_error(format!("Falha ao invocar compilador C++: {}", e)),
    }
}

async fn exec_zig(
    code: &str,
    stdin: Option<&str>,
    safe_session: &str,
    limits: RunLimits,
) -> ExecResult {
    if let Err(msg) = verify_zig_code(code) {
        return ExecResult::compile_error(msg);
    }

    let bin_name = format!("app_{}", safe_session);
    let user_dir = format!("files/zig/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.zig");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    if let Err(e) = tokio::fs::write(&file_path, code).await {
        return ExecResult::compile_error(e.to_string());
    }

    let zig_path = std::env::var("ZIG_PATH").unwrap_or_else(|_| "zig".to_string());
    let compile_output = Command::new(zig_path)
        .current_dir(&user_dir)
        .arg("build-exe")
        .arg("-O")
        .arg("ReleaseSmall")
        .arg("--name")
        .arg(&bin_name)
        .arg("main.zig")
        .output()
        .await;

    match compile_output {
        Ok(out) if out.status.success() => {
            let bin_path_str = bin_path.to_string_lossy().to_string();
            ExecResult::from_run(run_safe_bin(&bin_path_str, stdin, limits).await)
        }
        Ok(out) => ExecResult::compile_error(format!(
            "Erro de Compilação Zig:\n{}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Err(e) => ExecResult::compile_error(format!("Falha ao invocar compilador Zig: {}", e)),
    }
}
