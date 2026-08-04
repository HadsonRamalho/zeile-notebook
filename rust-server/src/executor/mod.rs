use std::path::{Path, PathBuf};
use tracing::info;

use crate::executor::sandbox::{CompileSandbox, absolute_path};
use crate::file::{RunLimits, RunOutcome, run_safe_bin, setup_user_env};
use crate::sec::{
    diff_new_lines, header_baseline_source, verify_code, verify_cpp_code, verify_cpp_preprocessed,
    verify_go_code, verify_zig_code,
};

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
        other => Err(format!("Unsupported language: {}", other)),
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

pub fn project_absolute_path(project_path: &Path) -> String {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    std::fs::canonicalize(project_path)
        .unwrap_or_else(|_| current_dir.join(project_path))
        .to_string_lossy()
        .to_string()
}

pub fn sandbox_rust(abs_project_path: String) -> CompileSandbox {
    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
    let rustup_dir =
        std::env::var("RUSTUP_HOME").unwrap_or_else(|_| format!("{}/.rustup", home_dir));
    let cargo_dir = std::env::var("CARGO_HOME").unwrap_or_else(|_| format!("{}/.cargo", home_dir));

    CompileSandbox::new(abs_project_path)
        .with_toolchain(rustup_dir.clone())
        .with_toolchain(cargo_dir.clone())
        .with_env("HOME", home_dir)
        .with_env("PATH", format!("{}/bin:/usr/bin:/bin", cargo_dir))
        .with_env("RUSTUP_HOME", rustup_dir)
        .with_env("CARGO_HOME", cargo_dir)
}

async fn compile_rust(code: &str, safe_session: &str) -> Result<String, String> {
    compile_rust_with_warnings(code, safe_session)
        .await
        .map(|(path, _)| path)
}

pub async fn compile_rust_with_warnings(
    code: &str,
    safe_session: &str,
) -> Result<(String, String), String> {
    verify_code(code)?;

    let project_path = setup_user_env(safe_session).await;
    let src_path = project_path.join("src");
    let file_path = src_path.join("main.rs");

    let safe_code = format!("#![forbid(unsafe_code)]\n{}", code);
    tokio::fs::write(&file_path, &safe_code)
        .await
        .map_err(|e| format!("Error saving file: {}", e))?;

    let compile_output = sandbox_rust(project_absolute_path(&project_path))
        .run(
            "cargo",
            &[
                "build",
                "--message-format=json",
                "--target=wasm32-wasip1",
                "--offline",
                "-q",
            ],
        )
        .await?;

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
        return Err(format!("Compile error:\n{}", final_stderr));
    }

    let path = exe_path.unwrap_or_else(|| {
        project_path
            .join("target/wasm32-wasip1/debug")
            .join(format!("app_{}.wasm", safe_session))
            .to_string_lossy()
            .to_string()
    });

    info!("Rust submission compiled: {}", path);
    Ok((path, formatted_errors))
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
    let sandbox = CompileSandbox::new(absolute_path(&user_dir)?)
        .with_compiler(&go_path)
        .with_shared_cache();

    let compile_output = sandbox
        .clone()
        .with_env("GOCACHE", sandbox.cache_path("go-build"))
        .with_env("GOMODCACHE", sandbox.cache_path("go-mod"))
        .with_env("GOPATH", "/app/.go")
        .with_env("CGO_ENABLED", "0")
        .with_env("GOTOOLCHAIN", "local")
        .run(&go_path, &["build", "-o", &bin_name, "main.go"])
        .await?;

    if compile_output.status.success() {
        return Ok(bin_path.to_string_lossy().to_string());
    }

    Err(format!(
        "Go compile error:\n{}",
        String::from_utf8_lossy(&compile_output.stderr)
    ))
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

    let baseline_path = Path::new(&user_dir).join("baseline.cpp");
    tokio::fs::write(&baseline_path, header_baseline_source(code))
        .await
        .map_err(|e| e.to_string())?;

    let cpp_path = std::env::var("CPP_PATH").unwrap_or_else(|_| "clang++".to_string());
    let sandbox = CompileSandbox::new(absolute_path(&user_dir)?).with_compiler(&cpp_path);

    let (full_result, baseline_result) = tokio::join!(
        sandbox.run(&cpp_path, &["-E", "-P", "-std=c++20", "main.cpp"]),
        sandbox.run(&cpp_path, &["-E", "-P", "-std=c++20", "baseline.cpp"])
    );

    let full_output = full_result?;

    if !full_output.status.success() {
        return Err(format!(
            "C++ compile error:\n{}",
            String::from_utf8_lossy(&full_output.stderr)
        ));
    }

    let baseline_output = baseline_result?;

    if !baseline_output.status.success() {
        return Err(format!(
            "C++ compile error:\n{}",
            String::from_utf8_lossy(&baseline_output.stderr)
        ));
    }

    let full = String::from_utf8_lossy(&full_output.stdout);
    let baseline = String::from_utf8_lossy(&baseline_output.stdout);
    verify_cpp_preprocessed(&diff_new_lines(&full, &baseline))?;

    let compile_output = sandbox
        .run(
            &cpp_path,
            &["-O2", "-std=c++20", "-o", &bin_name, "main.cpp"],
        )
        .await?;

    if compile_output.status.success() {
        return Ok(bin_path.to_string_lossy().to_string());
    }

    Err(format!(
        "C++ compile error:\n{}",
        String::from_utf8_lossy(&compile_output.stderr)
    ))
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
    let sandbox = CompileSandbox::new(absolute_path(&user_dir)?)
        .with_compiler(&zig_path)
        .with_shared_cache();

    let global_cache = sandbox.cache_path("zig");

    let compile_output = sandbox
        .run(
            &zig_path,
            &[
                "build-exe",
                "-O",
                "ReleaseSmall",
                "--cache-dir",
                "/app/.zig-cache",
                "--global-cache-dir",
                &global_cache,
                "--name",
                &bin_name,
                "main.zig",
            ],
        )
        .await?;

    if compile_output.status.success() {
        return Ok(bin_path.to_string_lossy().to_string());
    }

    Err(format!(
        "Zig compile error:\n{}",
        String::from_utf8_lossy(&compile_output.stderr)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const HELLO_GO: &str = r#"package main

import "fmt"

func main() { fmt.Println("hello from the sandbox") }
"#;

    const HELLO_CPP: &str = r#"#include <iostream>
int main() { std::cout << "hello from the sandbox" << std::endl; }
"#;

    fn exists(binary: &str) -> bool {
        std::process::Command::new("sh")
            .args(["-c", &format!("command -v {binary}")])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn has_sandbox() -> bool {
        exists("bwrap") && exists("prlimit")
    }

    struct Session(String);

    impl Session {
        fn new(name: &str) -> Self {
            Self(format!("test_{name}"))
        }

        fn dir(&self, language: &str) -> String {
            format!("files/{language}/{}", self.0)
        }
    }

    impl Drop for Session {
        fn drop(&mut self) {
            for language in ["go", "cpp", "zig"] {
                let _ = std::fs::remove_dir_all(self.dir(language));
            }
        }
    }

    async fn test_envelope(command: &str, args: &[&str]) -> std::process::Output {
        let dir = "files/test_envelope";
        std::fs::create_dir_all(dir).expect("session directory");
        let abs = absolute_path(dir).expect("absolute path");

        CompileSandbox::new(abs)
            .command(command, args)
            .output()
            .await
            .expect("envelope should run")
    }

    #[tokio::test]
    async fn the_compile_envelope_cannot_see_the_host() {
        if !has_sandbox() {
            eprintln!("bwrap/prlimit missing; test skipped");
            return;
        }

        let output = test_envelope("ls", &["/etc"]).await;

        assert!(
            !output.status.success(),
            "host's /etc was visible to the compiler: {}",
            String::from_utf8_lossy(&output.stdout)
        );
    }

    #[tokio::test]
    async fn the_compile_envelope_only_writes_to_the_session_workspace() {
        if !has_sandbox() {
            eprintln!("bwrap/prlimit missing; test skipped");
            return;
        }

        let inside = test_envelope("touch", &["/app/allowed"]).await;
        assert!(inside.status.success(), "write to /app should work");

        let outside = test_envelope("touch", &["/usr/breach"]).await;
        assert!(!outside.status.success(), "/usr should be read-only");

        let _ = std::fs::remove_file("files/test_envelope/allowed");
        let _ = std::fs::remove_dir_all("files/test_envelope");
    }

    #[tokio::test]
    async fn go_compiles_inside_the_sandbox_and_the_binary_runs() {
        if !has_sandbox() || !exists("go") {
            eprintln!("go/bwrap missing; test skipped");
            return;
        }

        let session = Session::new("go_hello");
        let bin = compile_code("go", HELLO_GO, &session.0)
            .await
            .expect("go should compile inside the sandbox");

        let result = run_compiled(&bin, None, RunLimits::default()).await;

        assert_eq!(result.verdict, ExecVerdict::Ok, "{result:?}");
        assert!(result.stdout.contains("hello from the sandbox"), "{result:?}");
    }

    #[test]
    fn the_rust_envelope_carries_prlimit_and_the_toolchain() {
        let sandbox = sandbox_rust("/srv/files/u_1_n_2".to_string());
        let args = sandbox.args();

        assert_eq!(args[0], "--cpu=30", "{args:?}");
        assert!(args.contains(&"bwrap".to_string()), "{args:?}");
        assert_eq!(
            sandbox.toolchain.len(),
            2,
            "rustup and cargo must be included as read binds"
        );
    }

    #[tokio::test]
    async fn rust_still_compiles_with_the_full_envelope() {
        if !has_sandbox() || !exists("cargo") {
            eprintln!("cargo/bwrap missing; test skipped");
            return;
        }

        let target_installed = std::process::Command::new("rustup")
            .args(["target", "list", "--installed"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains("wasm32-wasip1"))
            .unwrap_or(false);

        if !target_installed {
            eprintln!("wasm32-wasip1 target missing; test skipped");
            return;
        }

        let session = "rust_hello_test";
        let bin = compile_code(
            "rust",
            "fn main() { println!(\"hello from the sandbox\"); }",
            session,
        )
        .await;

        let _ = std::fs::remove_dir_all(format!("files/{session}"));

        assert!(bin.is_ok(), "rust should compile: {bin:?}");
    }

    #[tokio::test]
    async fn cpp_compile_rejects_a_macro_reconstructed_system_call() {
        if !has_sandbox() || !(exists("clang++") || exists("g++")) {
            eprintln!("clang++/g++/bwrap missing; test skipped");
            return;
        }

        let session = Session::new("cpp_macro_bypass");
        let code = "#define RUN system\nint main(){ RUN(\"id\"); return 0; }\n";

        let result = compile_code("cpp", code, &session.0).await;

        assert!(
            result.is_err(),
            "macro-reconstructed system() should be rejected: {result:?}"
        );
    }

    #[tokio::test]
    async fn cpp_compile_rejects_a_line_directive_spoofing_a_header() {
        if !has_sandbox() || !(exists("clang++") || exists("g++")) {
            eprintln!("clang++/g++/bwrap missing; test skipped");
            return;
        }

        let session = Session::new("cpp_line_bypass");
        let code = concat!(
            "#define RUN system\n",
            "#line 1 \"/usr/include/c++/v1/fake_header.h\"\n",
            "static void evil(){ RUN(\"id\"); }\n",
            "#line 20 \"main.cpp\"\n",
            "int main(){ evil(); return 0; }\n",
        );

        let result = compile_code("cpp", code, &session.0).await;

        assert!(
            result.is_err(),
            "a #line directive claiming the call lives in a header must not hide it: {result:?}"
        );
    }

    #[tokio::test]
    async fn cpp_compiles_inside_the_sandbox_and_the_binary_runs() {
        if !has_sandbox() || !(exists("clang++") || exists("g++")) {
            eprintln!("clang++/g++/bwrap missing; test skipped");
            return;
        }

        let session = Session::new("cpp_hello");
        let bin = compile_code("cpp", HELLO_CPP, &session.0)
            .await
            .expect("c++ should compile inside the sandbox");

        let result = run_compiled(&bin, None, RunLimits::default()).await;

        assert_eq!(result.verdict, ExecVerdict::Ok, "{result:?}");
        assert!(result.stdout.contains("hello from the sandbox"), "{result:?}");
    }
}
