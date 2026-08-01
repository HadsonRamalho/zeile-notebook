use axum::extract::ConnectInfo;
use axum::extract::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::deadpool::Pool;
use std::net::SocketAddr;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;
use tracing::error;
use tracing::info;
use uuid::Uuid;

use crate::CodeRequest;
use crate::CodeResponse;
use crate::controllers::jwt::extract_claims_from_header;
use crate::controllers::permissions::{TargetCtx, require};
use crate::models::state::AppState;
use crate::controllers::utils::extract_module_name;
use crate::file::RunLimits;
use crate::file::register_log;
use crate::file::run_safe_bin;
use crate::file::setup_user_env;
use crate::sec::verify_code;
use crate::sec::verify_cpp_code;
use crate::sec::verify_go_code;
use crate::sec::verify_zig_code;

fn execucao_negada(motivo: &str) -> CodeResponse {
    CodeResponse {
        stdout: String::new(),
        stderr: motivo.to_string(),
    }
}

async fn enforce_execute(
    pool: &Pool<AsyncPgConnection>,
    headers: &HeaderMap,
    notebook_id: Option<Uuid>,
    language: &str,
) -> Result<Uuid, CodeResponse> {
    let user_id = match extract_claims_from_header(headers).await {
        Ok(claims) => claims.1.id,
        Err(_) => {
            return Err(execucao_negada(
                "É necessário estar autenticado para executar código.",
            ));
        }
    };

    let notebook_id = match notebook_id {
        Some(id) => id,
        None => {
            return Err(execucao_negada(
                "É necessário informar o notebook do bloco que está sendo executado.",
            ));
        }
    };

    let key = format!("notebook.blocks.{language}.execute");
    let target = TargetCtx {
        block_id: None,
        block_type: Some(language.to_string()),
    };

    match require(pool, Some(user_id), notebook_id, &key, &target).await {
        Ok(_) => Ok(user_id),
        Err(_) => Err(execucao_negada(
            "Você não tem permissão para executar este tipo de bloco.",
        )),
    }
}

fn unsupported_execution() -> CodeResponse {
    CodeResponse {
        stdout: String::new(),
        stderr: "Execução de código compilado (Rust/Go/C++/Zig) não é suportada nesta plataforma. Use blocos Python/JS.".into(),
    }
}

pub async fn verify_request(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    if let Err(denied) =
        enforce_execute(&state.pool, &headers, payload.notebook_id, "rust").await
    {
        return Json(denied);
    }

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execucao_negada(
                "O servidor está encerrando e não aceita novas execuções.",
            ));
        }
    };

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
                    let out = run_safe_bin(&path, None, RunLimits::default()).await;
                    return Json(CodeResponse {
                        stdout: out.stdout,
                        stderr: formatted_errors + &out.stderr,
                    });
                } else {
                    let fallback_name = format!("app_{}.wasm", safe_session);
                    let fallback_path = project_path
                        .join("target/wasm32-wasip1/debug")
                        .join(fallback_name);
                    let path_str = fallback_path.to_string_lossy().to_string();
                    let out = run_safe_bin(&path_str, None, RunLimits::default()).await;
                    return Json(CodeResponse {
                        stdout: out.stdout,
                        stderr: formatted_errors + &out.stderr,
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
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    if let Err(denied) =
        enforce_execute(&state.pool, &headers, payload.notebook_id, "go").await
    {
        return Json(denied);
    }

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execucao_negada(
                "O servidor está encerrando e não aceita novas execuções.",
            ));
        }
    };
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
            let run = run_safe_bin(&bin_path_str, None, RunLimits::default()).await;
            Json(CodeResponse {
                stdout: run.stdout,
                stderr: run.stderr,
            })
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

pub async fn verify_cpp_request(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    if let Err(denied) =
        enforce_execute(&state.pool, &headers, payload.notebook_id, "cpp").await
    {
        return Json(denied);
    }

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execucao_negada(
                "O servidor está encerrando e não aceita novas execuções.",
            ));
        }
    };
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

    info!("Nova requisição C++ de IP: {}", ip);

    let safe_session = payload
        .session_id
        .replace(|c: char| !c.is_alphanumeric(), "_");

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("Falha no log de arquivo: {}", e);
    }

    if let Err(msg) = verify_cpp_code(&payload.code) {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Erro ao salvar arquivo C++: {}", msg),
        });
    }

    let bin_name = if cfg!(windows) {
        format!("app_{}.exe", safe_session)
    } else {
        format!("app_{}", safe_session)
    };

    let user_dir = format!("files/cpp/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.cpp");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    if let Err(e) = tokio::fs::write(&file_path, &payload.code).await {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Erro ao salvar arquivo C++: {}", e),
        });
    }

    info!("Compilando C++...");

    let cpp_path = std::env::var("CPP_PATH").unwrap_or_else(|_| "clang++".to_string());

    let compile_future = Command::new("prlimit")
        .current_dir(&user_dir)
        .arg("--cpu=10")
        .arg("--as=2147483648")
        .arg("--")
        .arg(&cpp_path)
        .arg("-O2")
        .arg("-Wall")
        .arg("-std=c++20")
        .arg("-ftemplate-depth=256")
        .arg("-fconstexpr-steps=1000000")
        .arg("-o")
        .arg(&bin_name)
        .arg("main.cpp")
        .output();

    match timeout(Duration::from_secs(12), compile_future).await {
        Ok(Ok(out)) => {
            if out.status.success() {
                let bin_path_str = bin_path.to_string_lossy().to_string();
                let run = run_safe_bin(&bin_path_str, None, RunLimits::default()).await;
                Json(CodeResponse {
                    stdout: run.stdout,
                    stderr: run.stderr,
                })
            } else {
                let stderr_txt = String::from_utf8_lossy(&out.stderr).to_string();
                let killed_by_signal = out.status.code().is_none();
                let low = stderr_txt.to_lowercase();
                let dos_markers = [
                    "exceeded maximum depth",
                    "recursive template instantiation",
                    "template instantiation depth",
                    "nested too deeply",
                    "memory exhausted",
                    "out of memory",
                ];
                let is_dos =
                    killed_by_signal || dos_markers.iter().any(|m| low.contains(m));
                if is_dos {
                    Json(CodeResponse {
                        stdout: "".into(),
                        stderr: "Segurança: compilação bloqueada por exceder os limites de recurso (possível bomba de compilação — template/include/macro).".into(),
                    })
                } else {
                    Json(CodeResponse {
                        stdout: "".into(),
                        stderr: format!("Erro de Compilação C++:\n{}", stderr_txt),
                    })
                }
            }
        }
        Ok(Err(e)) => Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Falha ao invocar compilador C++: {}", e),
        }),
        Err(_) => {
            let _ = tokio::fs::remove_file(&file_path).await;
            Json(CodeResponse {
                stdout: "".into(),
                stderr: "Segurança: compilação bloqueada por exceder o tempo limite (possível bomba de compilação / negação de serviço).".into(),
            })
        }
    }
}

pub async fn verify_zig_request(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    if let Err(denied) =
        enforce_execute(&state.pool, &headers, payload.notebook_id, "zig").await
    {
        return Json(denied);
    }

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execucao_negada(
                "O servidor está encerrando e não aceita novas execuções.",
            ));
        }
    };
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

    info!("Nova requisição Zig de IP: {}", ip);

    let safe_session = payload
        .session_id
        .replace(|c: char| !c.is_alphanumeric(), "_");

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("Falha no log de arquivo: {}", e);
    }

    if let Err(msg) = verify_zig_code(&payload.code) {
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

    let user_dir = format!("files/zig/{}", safe_session);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.zig");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    if let Err(e) = tokio::fs::write(&file_path, &payload.code).await {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Erro ao salvar arquivo Zig: {}", e),
        });
    }

    info!("Compilando Zig...");

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
            let run = run_safe_bin(&bin_path_str, None, RunLimits::default()).await;
            Json(CodeResponse {
                stdout: run.stdout,
                stderr: run.stderr,
            })
        }
        Ok(out) => Json(CodeResponse {
            stdout: "".into(),
            stderr: format!(
                "Erro de Compilação Zig:\n{}",
                String::from_utf8_lossy(&out.stderr)
            ),
        }),
        Err(e) => Json(CodeResponse {
            stdout: "".into(),
            stderr: format!("Falha ao invocar compilador Zig: {}", e),
        }),
    }
}
