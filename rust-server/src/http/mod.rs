use axum::extract::ConnectInfo;
use axum::extract::Json;
use axum::http::HeaderMap;
use std::net::SocketAddr;
use std::path::Path;
use tokio::process::Command;

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

    println!("--------------------------------------------------");
    println!("LOG: Nova requisição de IP: {}", ip);

    let safe_ip = ip.replace(|c: char| !c.is_alphanumeric(), "_");

    if let Err(e) = register_log(&payload.code, &safe_ip, &ip, &user_agent).await {
        eprintln!("ERRO: Falha no log de arquivo: {}", e);
    }

    if let Err(msg) = verify_code(&payload.code) {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: msg,
        });
    }

    let project_path = setup_user_env(&safe_ip).await;
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

    if !is_main {
        let check_output = Command::new("cargo")
            .current_dir(&project_path)
            .arg("check")
            .output()
            .await;

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
                stderr: format!("Erro ao verificar módulo: {}", e),
            }),
        };
    }

    eprintln!("LOG: Executando cargo build com JSON output...");

    let compile_output = Command::new("cargo")
        .current_dir(&project_path)
        .arg("build")
        .arg("--message-format=json")
        .arg("--target=wasm32-wasip1")
        .arg("--offline")
        .arg("-q")
        .output()
        .await;

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

                    if line.contains(r#""executable""#) {
                        if let Some(exec) = val.get("executable").and_then(|v| v.as_str()) {
                            exe_path = Some(exec.to_string());
                        }
                    }
                }
            }

            if out.status.success() {
                if let Some(path) = exe_path {
                    eprintln!("LOG: Caminho do executável encontrado via JSON: {}", path);
                    let (stdout, _) = run_safe_bin(&path).await;

                    return Json(CodeResponse {
                        stdout,
                        stderr: formatted_errors,
                    });
                } else {
                    let fallback_name = if cfg!(windows) {
                        format!("app_{}.exe", safe_ip)
                    } else {
                        format!("app_{}", safe_ip)
                    };
                    let fallback_path = project_path.join("target/debug").join(fallback_name);
                    let path_str = fallback_path.to_string_lossy().to_string();
                    let (stdout, stderr) = run_safe_bin(&path_str).await;
                    return Json(CodeResponse { stdout, stderr });
                }
            }

            eprintln!("LOG: Compilação FALHOU.");

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

    println!("--------------------------------------------------");
    println!("LOG: Nova requisição de IP: {}", ip);

    let safe_ip = ip.replace(|c: char| !c.is_alphanumeric(), "_");

    if let Err(e) = register_log(&payload.code, &safe_ip, &ip, &user_agent).await {
        eprintln!("ERRO: Falha no log de arquivo: {}", e);
    }

    if let Err(msg) = verify_go_code(&payload.code) {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: msg,
        });
    }

    let bin_name = if cfg!(windows) {
        format!("app_{}.exe", safe_ip)
    } else {
        format!("app_{}", safe_ip)
    };

    let user_dir = format!("files/go/{}", safe_ip);
    let _ = tokio::fs::create_dir_all(&user_dir).await;

    let file_path = Path::new(&user_dir).join("main.go");
    let bin_path = Path::new(&user_dir).join(&bin_name);

    if let Err(e) = tokio::fs::write(&file_path, &payload.code).await {
        return Json(CodeResponse {
            stdout: "".into(),
            stderr: e.to_string(),
        });
    }

    eprintln!("LOG: Compilando Go...");

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
