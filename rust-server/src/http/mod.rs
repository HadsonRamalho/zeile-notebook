use axum::extract::ConnectInfo;
use axum::extract::Json;
use axum::http::HeaderMap;
use std::net::SocketAddr;
use std::path::Path;
use std::path::PathBuf;
use tokio::process::Command;
use tracing::error;
use tracing::info;

use crate::CodeRequest;
use crate::CodeResponse;
use crate::controllers::utils::extract_module_name;
use crate::file::register_log;
use crate::file::run_safe_bin;
use crate::file::setup_user_env;
use crate::sec::verify_code;
use crate::sec::verify_go_code;

pub async fn verify_request(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    let addr = addr.ip();
    let ip = headers
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .unwrap_or(&addr.to_string())
        .to_string();

    let user_agent = headers
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("Unknown Agent")
        .to_string();

    info!("Nova requisição de IP: {}", ip);

    let safe_session = payload
        .session_id
        .replace(|c: char| !c.is_alphanumeric(), "_");

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("Falha no log de arquivo: {}", e);
    }

    if let Err(msg) = verify_code(&payload.code) {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: msg,
        });
    }

    let project_path = setup_user_env(&safe_session).await;
    let src_path = project_path.join("src");

    let module_name = extract_module_name(&payload.code);
    let (file_name, is_main) = match module_name {
        Some(name) => (format!("{}.rs", name), false),
        None => ("main.rs".to_string(), true),
    };

    if file_name == "build.rs" {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: format!(
                "Não é permitido usar build.rs como nome de módulo: {}",
                file_name
            ),
        });
    }

    let file_path = src_path.join(&file_name);

    let safe_code = if is_main {
        format!("#![forbid(unsafe_code)]\n{}", payload.code)
    } else {
        payload.code
    };

    if let Err(e) = tokio::fs::write(&file_path, &safe_code).await {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Erro ao salvar arquivo {}: {}", file_name, e),
        });
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

    if !is_main {
        let mut check_cmd = Command::new("bwrap");
        check_cmd.args(["--unshare-all", "--die-with-parent", "--new-session"]);
        check_cmd.args(["--ro-bind", "/usr", "/usr"]);
        check_cmd.args(["--ro-bind-try", "/lib", "/lib"]);
        check_cmd.args(["--ro-bind-try", "/lib64", "/lib64"]);
        check_cmd.args(["--ro-bind-try", "/bin", "/bin"]);
        check_cmd.args(["--dev", "/dev", "--proc", "/proc", "--dir", "/tmp"]);
        check_cmd.args(["--ro-bind-try", &rustup_dir, &rustup_dir]);
        check_cmd.args(["--ro-bind-try", &cargo_dir, &cargo_dir]);

        check_cmd.args(["--bind", &abs_project_path, "/app"]);
        check_cmd.args(["--chdir", "/app"]);

        check_cmd.env("PATH", format!("{}/bin:/usr/bin:/bin", cargo_dir));
        check_cmd.env("HOME", &home_dir);

        check_cmd.arg("cargo").arg("check");

        let check_output = check_cmd.output().await;

        return match check_output {
            Ok(out) => Json(CodeResponse {
                stdout: format!(
                    "Módulo '{}' salvo.\nStdOut Check: {}",
                    file_name,
                    String::from_utf8_lossy(&out.stdout)
                ),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            }),
            Err(e) => Json(CodeResponse {
                stdout: "".into(),
                stderr: format!("Erro ao verificar módulo no sandbox: {}", e),
            }),
        };
    }

    info!("Executando cargo build com JSON output...");

    info!("Iniciando build isolado em {}", abs_project_path);

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

    let compile_output = build_cmd.output().await;

    match compile_output {
        Ok(out) => {
            let stdout_str = String::from_utf8_lossy(&out.stdout);
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
                            if let Some(file_name) = Path::new(executable).file_name() {
                                let real_path = project_path
                                    .join("target/wasm32-wasip1/debug")
                                    .join(file_name);
                                exe_path = Some(real_path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }

            if out.status.success() {
                if let Some(path) = exe_path {
                    info!("Caminho do executável traduzido: {}", path);
                    let (stdout, stderr) = run_safe_bin(&path).await;
                    return Json(CodeResponse {
                        stdout,
                        stderr: formatted_errors + &stderr,
                    });
                } else {
                    let fallback_name = format!("app_{}.wasm", safe_session);
                    let fallback_path = project_path
                        .join("target/wasm32-wasip1/debug")
                        .join(fallback_name);
                    let path_str = fallback_path.to_string_lossy().to_string();
                    let (stdout, stderr) = run_safe_bin(&path_str).await;
                    return Json(CodeResponse {
                        stdout,
                        stderr: formatted_errors + &stderr,
                    });
                }
            }

            error!("Compilação falhou.");
            let final_stderr = if !formatted_errors.is_empty() {
                formatted_errors
            } else {
                String::from_utf8_lossy(&out.stderr).to_string()
            };

            Json(CodeResponse {
                stdout: "".into(),
                stderr: format!("Erro de Compilação:\n{}", final_stderr),
            })
        }
        Err(e) => Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Erro ao invocar cargo: {}", e),
        }),
    }
}

pub async fn verify_go_request(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    let addr = addr.ip();
    let ip = headers
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .unwrap_or(&addr.to_string())
        .to_string();

    let user_agent = headers
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("Unknown Agent")
        .to_string();

    info!("Nova requisição de IP: {}", ip);

    let safe_session = payload
        .session_id
        .replace(|c: char| !c.is_alphanumeric(), "_");

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("Falha no log de arquivo: {}", e);
    }

    if let Err(msg) = verify_go_code(&payload.code) {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: msg,
        });
    }

    let bin_name = if cfg!(windows) {
        format!("app_{}.exe", safe_session)
    } else {
        format!("app_{}", safe_session)
    };

    let user_dir = format!("files/go/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.go");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    if let Err(e) = tokio::fs::write(&file_path, &payload.code).await {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: e.to_string(),
        });
    }

    info!("Compilando Go...");

    let compile_output = Command::new("go")
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
            let (stdout, stderr) = run_safe_bin(&bin_path_str).await;
            Json(CodeResponse { stdout, stderr })
        }
        Ok(out) => Json(CodeResponse {
            stdout: "".into(),
            stderr: format!(
                "Erro de Compilação Go:\n{}",
                String::from_utf8_lossy(&out.stderr)
            ),
        }),
        Err(e) => Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Falha ao invocar compilador Go: {}", e),
        }),
    }
}
