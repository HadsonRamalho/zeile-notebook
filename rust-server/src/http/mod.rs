use axum::extract::ConnectInfo;
use axum::extract::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::deadpool::Pool;
use std::net::SocketAddr;
use std::path::Path;
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
use crate::executor::sanitize_session;
use crate::executor::{
    compile_rust_with_warnings, project_absolute_path, run_compiled, sandbox_rust,
};
use crate::file::RunLimits;
use crate::file::register_log;
use crate::file::run_safe_bin;
use crate::file::setup_user_env;
use crate::sec::ast::rust::verify_rust_ast;
use crate::sec::verify_code;
use crate::sec::verify_cpp_code;
use crate::sec::verify_go_code;
use crate::sec::verify_zig_code;

fn execution_denied(reason: &str) -> CodeResponse {
    CodeResponse {
        stdout: String::new(),
        stderr: reason.to_string(),
    }
}

pub fn execution_session(user_id: Uuid, notebook_id: Uuid) -> String {
    sanitize_session(&format!("u_{}_n_{}", user_id, notebook_id))
}

async fn enforce_execute(
    pool: &Pool<AsyncPgConnection>,
    headers: &HeaderMap,
    notebook_id: Option<Uuid>,
    language: &str,
) -> Result<String, CodeResponse> {
    let user_id = match extract_claims_from_header(headers).await {
        Ok(claims) => claims.1.id,
        Err(_) => {
            return Err(execution_denied(
                "É necessário estar autenticado para executar código.",
            ));
        }
    };

    let notebook_id = match notebook_id {
        Some(id) => id,
        None => {
            return Err(execution_denied(
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
        Ok(_) => Ok(execution_session(user_id, notebook_id)),
        Err(_) => Err(execution_denied(
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

#[utoipa::path(post, path = "/run", request_body = CodeRequest, responses((status = OK, body = CodeResponse)))]
pub async fn verify_request(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    let safe_session =
        match enforce_execute(&state.pool, &headers, payload.notebook_id, "rust").await {
            Ok(session) => session,
            Err(denied) => return Json(denied),
        };

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execution_denied(
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

    info!("New request from IP: {}", ip);

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("File log failure: {}", e);
    }

    if let Err(msg) = verify_code(&payload.code) {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: msg,
        });
    }

    if let Err(msg) = verify_rust_ast(&payload.code) {
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

    if !is_main {
        let file_path = src_path.join(&file_name);

        if let Err(e) = tokio::fs::write(&file_path, &payload.code).await {
            return Json(CodeResponse {
                stdout: "".into(),
                stderr: format!("Erro ao salvar arquivo {}: {}", file_name, e),
            });
        }

        let sandbox = sandbox_rust(project_absolute_path(&project_path));

        return match sandbox.run("cargo", &["check"]).await {
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

    info!("Starting isolated build for session {}", safe_session);

    let (bin_path, warnings) = match compile_rust_with_warnings(&payload.code, &safe_session).await {
        Ok(compiled) => compiled,
        Err(msg) => {
            error!("Compilation failed.");
            return Json(CodeResponse {
                stdout: "".into(),
                stderr: msg,
            });
        }
    };

    let out = run_compiled(&bin_path, None, RunLimits::default()).await;

    Json(CodeResponse {
        stdout: out.stdout,
        stderr: warnings + &out.stderr,
    })
}

#[utoipa::path(post, path = "/run/go", request_body = CodeRequest, responses((status = OK, body = CodeResponse)))]
pub async fn verify_go_request(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    let safe_session =
        match enforce_execute(&state.pool, &headers, payload.notebook_id, "go").await {
            Ok(session) => session,
            Err(denied) => return Json(denied),
        };

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execution_denied(
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

    info!("New request from IP: {}", ip);

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("File log failure: {}", e);
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

    info!("Compiling Go...");

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

#[utoipa::path(post, path = "/run/cpp", request_body = CodeRequest, responses((status = OK, body = CodeResponse)))]
pub async fn verify_cpp_request(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    let safe_session =
        match enforce_execute(&state.pool, &headers, payload.notebook_id, "cpp").await {
            Ok(session) => session,
            Err(denied) => return Json(denied),
        };

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execution_denied(
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

    info!("New C++ request from IP: {}", ip);

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("File log failure: {}", e);
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

    info!("Compiling C++...");

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

#[utoipa::path(post, path = "/run/zig", request_body = CodeRequest, responses((status = OK, body = CodeResponse)))]
pub async fn verify_zig_request(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CodeRequest>,
) -> Json<CodeResponse> {
    if !cfg!(unix) {
        return Json(unsupported_execution());
    }
    let safe_session =
        match enforce_execute(&state.pool, &headers, payload.notebook_id, "zig").await {
            Ok(session) => session,
            Err(denied) => return Json(denied),
        };

    let _permit = match state.judge_semaphore.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return Json(execution_denied(
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

    info!("New Zig request from IP: {}", ip);

    if let Err(e) = register_log(&payload.code, &safe_session, &ip, &user_agent).await {
        error!("File log failure: {}", e);
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

    info!("Compiling Zig...");

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
