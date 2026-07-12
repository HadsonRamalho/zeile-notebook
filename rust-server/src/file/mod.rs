use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Instant;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::{Duration, timeout};
use tracing::{error, info, warn};

#[derive(Debug, Clone, Copy)]
pub struct RunLimits {
    pub cpu_secs: u64,
    pub mem_kb: u64,
    pub wall_ms: u64,
}

impl Default for RunLimits {
    fn default() -> Self {
        Self {
            cpu_secs: 10,
            mem_kb: 1_048_576,
            wall_ms: 5_000,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RunOutcome {
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub exit_ok: bool,
    pub wall_ms: u64,
}

pub async fn run_safe_bin(
    caminho_binario: &str,
    stdin: Option<&str>,
    limits: RunLimits,
) -> RunOutcome {
    let path_obj = Path::new(caminho_binario);
    if !path_obj.exists() {
        error!("ERRO: Binário não existe: {}", caminho_binario);
        return RunOutcome {
            stdout: "".into(),
            stderr: "Erro interno: Binário não encontrado.".into(),
            timed_out: false,
            exit_ok: false,
            wall_ms: 0,
        };
    }

    let is_wasm = caminho_binario.ends_with(".wasm");

    let cpu_arg = format!("--cpu={}", limits.cpu_secs);

    let mut cmd = Command::new("prlimit");
    cmd.args([cpu_arg.as_str(), "--"]);

    cmd.arg("bwrap");

    cmd.args(["--unshare-all"]);
    cmd.args(["--die-with-parent"]);
    cmd.args(["--new-session"]);

    cmd.args(["--ro-bind", "/usr", "/usr"]);
    cmd.args(["--ro-bind-try", "/lib", "/lib"]);
    cmd.args(["--ro-bind-try", "/lib64", "/lib64"]);
    cmd.args(["--ro-bind-try", "/bin", "/bin"]);

    cmd.args(["--dir", "/tmp"]);
    cmd.args(["--proc", "/proc"]);
    cmd.args(["--dev", "/dev"]);
    cmd.args(["--chdir", "/tmp"]);

    if is_wasm {
        let wasmtime_path = std::env::var("WASMTIME_PATH").unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_default();

            let possible_paths = [
                format!("{}/.wasmtime/bin/wasmtime", home),
                "/usr/bin/wasmtime".to_string(),
                "/usr/local/bin/wasmtime".to_string(),
            ];

            possible_paths
                .into_iter()
                .find(|p| Path::new(p).exists())
                .unwrap_or_else(|| {
                    warn!(
                        "AVISO: wasmtime não encontrado nos caminhos padrões. Usando fallback cego."
                    );
                    "wasmtime".to_string()
                })
        });

        cmd.args(["--ro-bind-try", &wasmtime_path, "/app/wasmtime"]);
        cmd.args(["--ro-bind", caminho_binario, "/app/main.wasm"]);

        cmd.arg("/app/wasmtime").arg("run").arg("/app/main.wasm");
    } else {
        cmd.args(["--ro-bind", caminho_binario, "/app/main"]);
        cmd.arg("/app/main");

        cmd.env("GOMAXPROCS", "1");
        cmd.env("CGO_ENABLED", "0");
    }

    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    info!("COMANDO: {:?}", cmd);

    let stdin_cfg = if stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    };

    let started = Instant::now();

    let mut child = match cmd
        .stdin(stdin_cfg)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            error!("ERRO FATAL ao spawnar sandbox: {}", e);
            return RunOutcome {
                stdout: "".into(),
                stderr: format!("Erro ao iniciar execução: {}", e),
                timed_out: false,
                exit_ok: false,
                wall_ms: 0,
            };
        }
    };

    if let Some(input) = stdin {
        if let Some(mut sink) = child.stdin.take() {
            let _ = sink.write_all(input.as_bytes()).await;
            let _ = sink.flush().await;
        }
    }

    let pid = child.id().expect("Falha ao obter PID");
    info!("Sandbox iniciado no Grupo de Processos PGID: {}", pid);

    match timeout(
        Duration::from_millis(limits.wall_ms),
        child.wait_with_output(),
    )
    .await
    {
        Ok(Ok(output)) => {
            let _ = std::process::Command::new("kill")
                .args(["-9", &format!("-{}", pid)])
                .output();

            let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_status = output.status;

            info!("EXIT STATUS: {}", exit_status);

            if !stdout_str.is_empty() {
                info!("STDOUT CAPTURADO:\n{}", stdout_str);
            }
            if !stderr_str.is_empty() {
                error!("STDERR CAPTURADO:\n{}", stderr_str);
            }

            RunOutcome {
                stdout: stdout_str,
                stderr: stderr_str,
                timed_out: false,
                exit_ok: exit_status.success(),
                wall_ms: started.elapsed().as_millis() as u64,
            }
        }
        Ok(Err(e)) => {
            let _ = std::process::Command::new("kill")
                .args(["-9", &format!("-{}", pid)])
                .output();
            error!("ERRO de I/O no container: {}", e);
            RunOutcome {
                stdout: "".into(),
                stderr: format!("Erro interno de sandbox: {}", e),
                timed_out: false,
                exit_ok: false,
                wall_ms: started.elapsed().as_millis() as u64,
            }
        }
        Err(_) => {
            error!(
                "TIMEOUT DETECTADO! Encerrando Grupo de Processos (PGID) {}",
                pid
            );

            let kill_cmd = std::process::Command::new("kill")
                .args(["-9", &format!("-{}", pid)])
                .output();

            if let Err(e) = kill_cmd {
                error!("FALHA CRÍTICA AO MATAR PROCESSOS: {}", e);
            }

            RunOutcome {
                stdout: "".into(),
                stderr: "Erro: Execução interrompida. O código demorou muito para responder (Loop Infinito ou Timeout).".into(),
                timed_out: true,
                exit_ok: false,
                wall_ms: started.elapsed().as_millis() as u64,
            }
        }
    }
}

pub async fn setup_user_env(ip_safe: &str) -> PathBuf {
    let user_dir = format!("files/{}", ip_safe);
    let src_dir = format!("{}/src", user_dir);

    if let Err(e) = tokio::fs::create_dir_all(&src_dir).await {
        error!("ERRO: Falha ao criar diretórios {}: {}", src_dir, e);
    }

    if !Path::new(&format!("{}/Cargo.toml", user_dir)).exists() {
        info!("LOG: Iniciando novo projeto Cargo em {}", user_dir);

        let package_name = format!("app_{}", ip_safe);

        let output = Command::new("cargo")
            .arg("init")
            .arg("--bin")
            .arg("--name")
            .arg(&package_name)
            .arg(&user_dir)
            .output()
            .await;

        match output {
            Ok(o) => {
                if !o.status.success() {
                    error!(
                        "ERRO: Cargo init falhou: {}",
                        String::from_utf8_lossy(&o.stderr)
                    );
                }
            }
            Err(e) => error!("ERRO: Falha ao executar cargo init: {}", e),
        }
    }

    PathBuf::from(user_dir)
}

pub async fn register_log(
    codigo: &str,
    safe_ip: &str,
    real_ip: &str,
    user_agent: &str,
) -> std::io::Result<()> {
    let log_dir = "logs";

    if !Path::new(log_dir).exists() {
        fs::create_dir(log_dir)?;
    }

    if !Path::new(&format!("{}/{}", log_dir, safe_ip)).exists() {
        fs::create_dir(format!("{}/{}", log_dir, safe_ip))?;
    }

    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
    let file_path = format!("{}/{}/{}.log", log_dir, safe_ip, timestamp);

    let log_content = format!(
        "--- REQUISIÇÃO EM {} ---\n\
         IP: {}\n\
         USER-AGENT: {}\n\
         ---------------------------\n\
         CÓDIGO RECEBIDO:\n\n\
         {}\n",
        timestamp, real_ip, user_agent, codigo
    );

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(file_path)?;

    file.write_all(log_content.as_bytes())?;

    Ok(())
}
