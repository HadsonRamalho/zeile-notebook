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

pub const MAX_PROCESSES: u64 = 64;

pub const WASM_MEMORY_RESERVATION: u64 = 64 * 1024 * 1024;

pub const WASM_MEMORY_GUARD: u64 = 0;

pub const MAX_FILE_KB: u64 = 32 * 1024;

pub const MAX_DESCRIPTORS: u64 = 64;

pub const TMPFS_MB: u64 = 64;

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

impl RunLimits {
    pub fn prlimit_args(&self) -> Vec<String> {
        vec![
            format!("--cpu={}", self.cpu_secs),
            format!("--as={}", self.mem_kb.saturating_mul(1024)),
        ]
    }

    pub fn run_prlimit_args(&self) -> Vec<String> {
        let mut args = self.prlimit_args();
        args.push(format!("--fsize={}", MAX_FILE_KB.saturating_mul(1024)));
        args.push(format!("--nofile={}", MAX_DESCRIPTORS));
        args
    }
}

pub fn internal_prlimit_args(max_processos: u64) -> Vec<String> {
    vec![
        "/usr/bin/prlimit".to_string(),
        format!("--nproc={}", max_processos),
        "--".to_string(),
    ]
}

#[derive(Debug, Clone)]
pub struct RunOutcome {
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub exit_ok: bool,
    pub wall_ms: u64,
}

pub(crate) fn wasmtime_path() -> String {
    if let Ok(path) = std::env::var("WASMTIME_PATH") {
        return path;
    }

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
            warn!("WARNING: wasmtime not found in the default paths. Using a blind fallback.");
            "wasmtime".to_string()
        })
}

pub fn run_envelope_args(binary_path: &str, limits: RunLimits) -> Vec<String> {
    let mut args = limits.run_prlimit_args();
    args.push("--".into());
    args.push("bwrap".into());

    for flag in [
        "--unshare-all",
        "--die-with-parent",
        "--new-session",
        "--clearenv",
        "--ro-bind",
        "/usr",
        "/usr",
        "--ro-bind-try",
        "/lib",
        "/lib",
        "--ro-bind-try",
        "/lib64",
        "/lib64",
        "--ro-bind-try",
        "/bin",
        "/bin",
        "--size",
        &(TMPFS_MB * 1024 * 1024).to_string(),
        "--tmpfs",
        "/tmp",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--chdir",
        "/tmp",
        "--setenv",
        "PATH",
        "/usr/bin:/bin",
        "--setenv",
        "HOME",
        "/tmp",
        "--setenv",
        "TMPDIR",
        "/tmp",
    ] {
        args.push(flag.into());
    }

    if binary_path.ends_with(".wasm") {
        for arg in [
            "--ro-bind-try",
            &wasmtime_path(),
            "/app/wasmtime",
            "--ro-bind",
            binary_path,
            "/app/main.wasm",
        ] {
            args.push(arg.into());
        }

        args.extend(internal_prlimit_args(MAX_PROCESSES));

        for arg in [
            "/app/wasmtime",
            "run",
            "-O",
            &format!("memory-reservation={}", WASM_MEMORY_RESERVATION),
            "-O",
            &format!("memory-guard-size={}", WASM_MEMORY_GUARD),
            "/app/main.wasm",
        ] {
            args.push(arg.into());
        }

        return args;
    }

    for arg in [
        "--setenv",
        "GOMAXPROCS",
        "1",
        "--setenv",
        "CGO_ENABLED",
        "0",
        "--ro-bind",
        binary_path,
        "/app/main",
    ] {
        args.push(arg.into());
    }

    args.extend(internal_prlimit_args(MAX_PROCESSES));
    args.push("/app/main".into());

    args
}

pub async fn run_safe_bin(binary_path: &str, stdin: Option<&str>, limits: RunLimits) -> RunOutcome {
    let path_obj = Path::new(binary_path);
    if !path_obj.exists() {
        error!("ERROR: Binary does not exist: {}", binary_path);
        return RunOutcome {
            stdout: "".into(),
            stderr: "Erro interno: Binário não encontrado.".into(),
            timed_out: false,
            exit_ok: false,
            wall_ms: 0,
        };
    }

    let mut cmd = Command::new("prlimit");
    cmd.args(run_envelope_args(binary_path, limits));

    cmd.env_clear();
    cmd.env("PATH", "/usr/bin:/bin");

    #[cfg(unix)]
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
                error!("CRITICAL FAILURE KILLING PROCESSES: {}", e);
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
        error!("ERROR: Failed to create directories {}: {}", src_dir, e);
    }

    if !Path::new(&format!("{}/Cargo.toml", user_dir)).exists() {
        info!("LOG: Starting new Cargo project at {}", user_dir);

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
                        "ERROR: Cargo init failed: {}",
                        String::from_utf8_lossy(&o.stderr)
                    );
                }
            }
            Err(e) => error!("ERROR: Failed to run cargo init: {}", e),
        }
    }

    PathBuf::from(user_dir)
}

pub async fn register_log(
    code: &str,
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
        "--- REQUEST AT {} ---\n\
         IP: {}\n\
         USER-AGENT: {}\n\
         ---------------------------\n\
         CODE RECEIVED:\n\n\
         {}\n",
        timestamp, real_ip, user_agent, code
    );

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(file_path)?;

    file.write_all(log_content.as_bytes())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_envelope_carries_cpu_and_memory() {
        let limits = RunLimits {
            cpu_secs: 3,
            mem_kb: 4096,
            wall_ms: 1000,
        };

        let args = limits.prlimit_args();

        assert_eq!(args[0], "--cpu=3");
        assert_eq!(args[1], "--as=4194304");
    }

    #[test]
    fn the_envelope_limits_disk_writes_and_descriptors() {
        let args = RunLimits::default().run_prlimit_args();

        assert!(args.contains(&"--fsize=33554432".to_string()), "{args:?}");
        assert!(args.contains(&"--nofile=64".to_string()), "{args:?}");
    }

    #[test]
    fn the_process_limit_is_applied_inside_the_namespace() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        let bwrap = args.iter().position(|a| a == "bwrap").expect("bwrap");
        let nproc = args
            .iter()
            .position(|a| a == "--nproc=64")
            .expect("--nproc missing");

        assert!(
            nproc > bwrap,
            "--nproc must come after bwrap: outside the user namespace, clone fails with EAGAIN"
        );
        assert_eq!(args[nproc - 1], "/usr/bin/prlimit");
        assert_eq!(args[nproc + 1], "--");
    }

    #[test]
    fn the_execution_tmpfs_has_a_size_ceiling() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        let size = args.iter().position(|a| a == "--size").expect("--size");

        assert_eq!(args[size + 1], (TMPFS_MB * 1024 * 1024).to_string());
        assert_eq!(args[size + 2], "--tmpfs");
        assert_eq!(args[size + 3], "/tmp");
    }

    #[test]
    fn the_wasm_envelope_limits_wasmtimes_memory_reservation() {
        let args = run_envelope_args("/app/prog.wasm", RunLimits::default());

        let run = args
            .iter()
            .position(|a| a == "run")
            .expect("run subcommand missing");
        let module = args
            .iter()
            .rposition(|a| a == "/app/main.wasm")
            .expect("module missing");

        let reservation = format!("memory-reservation={}", WASM_MEMORY_RESERVATION);
        let guard = format!("memory-guard-size={}", WASM_MEMORY_GUARD);

        assert!(args.contains(&reservation), "reservation missing: {args:?}");
        assert!(args.contains(&guard), "guard missing: {args:?}");
        let reservation_pos = args.iter().position(|a| a == &reservation).unwrap();
        assert!(
            run < reservation_pos && reservation_pos < module,
            "the reservation must be passed as a run option, before the module: {args:?}"
        );
        assert_eq!(
            WASM_MEMORY_RESERVATION,
            64 * 1024 * 1024,
            "the reservation must fit inside the run envelope's prlimit --as"
        );
    }

    #[test]
    fn native_binary_does_not_get_wasm_flags() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        assert!(
            !args.iter().any(|a| a.starts_with("memory-reservation=")),
            "wasm flags leaked into the native envelope: {args:?}"
        );
    }

    #[tokio::test]
    async fn a_fork_bomb_does_not_escape_the_sandbox() {
        if !exists("bwrap") || !exists("prlimit") || !exists("sh") {
            eprintln!("bwrap/prlimit/sh missing; test skipped");
            return;
        }

        let before = process_count();

        let limits = RunLimits {
            cpu_secs: 5,
            mem_kb: 262_144,
            wall_ms: 4_000,
        };

        let _ = run_safe_bin("/usr/bin/sh", None, limits).await;

        let after = process_count();

        assert!(
            after < before + 200,
            "the host gained too many processes during execution: {before} -> {after}"
        );
    }

    fn process_count() -> usize {
        std::fs::read_dir("/proc")
            .map(|d| {
                d.filter_map(|e| e.ok())
                    .filter(|e| {
                        e.file_name()
                            .to_string_lossy()
                            .chars()
                            .all(|c| c.is_ascii_digit())
                    })
                    .count()
            })
            .unwrap_or(0)
    }

    #[test]
    fn the_default_declares_1_gib_of_memory() {
        let args = RunLimits::default().prlimit_args();

        assert!(args.contains(&"--as=1073741824".to_string()), "{args:?}");
    }

    fn exists(binary: &str) -> bool {
        std::process::Command::new("sh")
            .args(["-c", &format!("command -v {binary}")])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn the_execution_envelope_clears_the_servers_environment() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        assert!(
            args.contains(&"--clearenv".to_string()),
            "--clearenv missing: {args:?}"
        );
    }

    #[test]
    fn the_envelope_declares_only_neutral_variables() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        let declared: Vec<&String> = args
            .iter()
            .enumerate()
            .filter(|(i, _)| *i > 0 && args[i - 1] == "--setenv")
            .map(|(_, v)| v)
            .collect();

        assert_eq!(
            declared,
            vec!["PATH", "HOME", "TMPDIR", "GOMAXPROCS", "CGO_ENABLED"],
            "the envelope declared unexpected variables"
        );
    }

    #[tokio::test]
    async fn the_servers_environment_does_not_leak_into_user_code() {
        if !exists("bwrap") || !exists("prlimit") {
            eprintln!("bwrap/prlimit missing; test skipped");
            return;
        }

        unsafe {
            std::env::set_var("ZEILE_TEST_SECRET", "jwt-secret-must-not-leak");
        }

        let output = run_safe_bin("/usr/bin/env", None, RunLimits::default()).await;

        unsafe {
            std::env::remove_var("ZEILE_TEST_SECRET");
        }

        assert!(
            !output.stdout.contains("jwt-secret-must-not-leak"),
            "the server's environment leaked into the sandbox:\n{}",
            output.stdout
        );
    }

    #[test]
    fn the_limits_reach_the_child_process() {
        if !exists("prlimit") || !exists("sh") {
            eprintln!("prlimit or sh missing; test skipped");
            return;
        }

        let limits = RunLimits {
            cpu_secs: 7,
            mem_kb: 262_144,
            wall_ms: 1000,
        };

        let output = std::process::Command::new("prlimit")
            .args(limits.prlimit_args())
            .args(["--", "sh", "-c", "ulimit -v; ulimit -t"])
            .output()
            .expect("prlimit should run");

        let text = String::from_utf8_lossy(&output.stdout);
        let mut lines = text.split_whitespace();

        assert_eq!(lines.next(), Some("262144"), "memory: {text}");
        assert_eq!(lines.next(), Some("7"), "cpu: {text}");
    }
}
