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

pub const MAX_PROCESSOS: u64 = 64;

/// Espaço virtual que o wasmtime reserva por memória linear. O padrão do
/// wasmtime é 4 GiB (o teto de um módulo wasm32), e ele reserva isso de uma vez
/// via mmap PROT_NONE. Sob o `prlimit --as` de 1 GiB do envelope de execução, a
/// reserva de 4 GiB é negada com ENOMEM e NENHUM programa roda. Cortar a reserva
/// para 64 MiB cabe folgado no --as; `memory-may-move` continua deixando a
/// memória crescer por remapeamento se o programa precisar de mais.
pub const WASM_MEMORY_RESERVATION: u64 = 64 * 1024 * 1024;

/// Guard page zerada: com a reserva pequena não há espaço virtual para as guard
/// pages padrão (32 MiB) somarem sem estourar o --as; sem elas o wasmtime usa
/// verificação de limites explícita, que é correta e barata para este uso.
pub const WASM_MEMORY_GUARD: u64 = 0;

pub const MAX_ARQUIVO_KB: u64 = 32 * 1024;

pub const MAX_DESCRITORES: u64 = 64;

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

    pub fn prlimit_args_execucao(&self) -> Vec<String> {
        let mut args = self.prlimit_args();
        args.push(format!("--fsize={}", MAX_ARQUIVO_KB.saturating_mul(1024)));
        args.push(format!("--nofile={}", MAX_DESCRITORES));
        args
    }
}

pub fn prlimit_interno_args(max_processos: u64) -> Vec<String> {
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

fn wasmtime_path() -> String {
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
            warn!("AVISO: wasmtime não encontrado nos caminhos padrões. Usando fallback cego.");
            "wasmtime".to_string()
        })
}

pub fn run_envelope_args(caminho_binario: &str, limits: RunLimits) -> Vec<String> {
    let mut args = limits.prlimit_args_execucao();
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

    if caminho_binario.ends_with(".wasm") {
        for arg in [
            "--ro-bind-try",
            &wasmtime_path(),
            "/app/wasmtime",
            "--ro-bind",
            caminho_binario,
            "/app/main.wasm",
        ] {
            args.push(arg.into());
        }

        args.extend(prlimit_interno_args(MAX_PROCESSOS));

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
        caminho_binario,
        "/app/main",
    ] {
        args.push(arg.into());
    }

    args.extend(prlimit_interno_args(MAX_PROCESSOS));
    args.push("/app/main".into());

    args
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

    let mut cmd = Command::new("prlimit");
    cmd.args(run_envelope_args(caminho_binario, limits));

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn o_envelope_carrega_cpu_e_memoria() {
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
    fn o_envelope_limita_escrita_em_disco_e_descritores() {
        let args = RunLimits::default().prlimit_args_execucao();

        assert!(args.contains(&"--fsize=33554432".to_string()), "{args:?}");
        assert!(args.contains(&"--nofile=64".to_string()), "{args:?}");
    }

    #[test]
    fn o_limite_de_processos_e_aplicado_dentro_do_namespace() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        let bwrap = args.iter().position(|a| a == "bwrap").expect("bwrap");
        let nproc = args
            .iter()
            .position(|a| a == "--nproc=64")
            .expect("--nproc ausente");

        assert!(
            nproc > bwrap,
            "--nproc precisa ficar depois do bwrap: fora do user namespace o clone falha com EAGAIN"
        );
        assert_eq!(args[nproc - 1], "/usr/bin/prlimit");
        assert_eq!(args[nproc + 1], "--");
    }

    #[test]
    fn o_tmpfs_da_execucao_tem_teto_de_tamanho() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        let size = args.iter().position(|a| a == "--size").expect("--size");

        assert_eq!(args[size + 1], (TMPFS_MB * 1024 * 1024).to_string());
        assert_eq!(args[size + 2], "--tmpfs");
        assert_eq!(args[size + 3], "/tmp");
    }

    #[test]
    fn o_envelope_wasm_limita_a_reserva_de_memoria_do_wasmtime() {
        let args = run_envelope_args("/app/prog.wasm", RunLimits::default());

        let run = args
            .iter()
            .position(|a| a == "run")
            .expect("subcomando run ausente");
        // `/app/main.wasm` aparece duas vezes: como alvo do --ro-bind e como
        // módulo do `run`. O que importa é o último, depois do subcomando.
        let modulo = args
            .iter()
            .rposition(|a| a == "/app/main.wasm")
            .expect("módulo ausente");

        let reserva = format!("memory-reservation={}", WASM_MEMORY_RESERVATION);
        let guard = format!("memory-guard-size={}", WASM_MEMORY_GUARD);

        assert!(args.contains(&reserva), "reserva ausente: {args:?}");
        assert!(args.contains(&guard), "guard ausente: {args:?}");
        let pos_reserva = args.iter().position(|a| a == &reserva).unwrap();
        assert!(
            run < pos_reserva && pos_reserva < modulo,
            "a reserva precisa ser passada como opção do run, antes do módulo: {args:?}"
        );
        assert_eq!(
            WASM_MEMORY_RESERVATION,
            64 * 1024 * 1024,
            "a reserva precisa caber no prlimit --as do envelope de execução"
        );
    }

    #[test]
    fn binario_nativo_nao_recebe_flags_de_wasm() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        assert!(
            !args.iter().any(|a| a.starts_with("memory-reservation=")),
            "flags de wasm vazaram para o envelope nativo: {args:?}"
        );
    }

    #[tokio::test]
    async fn uma_fork_bomb_nao_escapa_do_sandbox() {
        if !existe("bwrap") || !existe("prlimit") || !existe("sh") {
            eprintln!("bwrap/prlimit/sh ausente; teste pulado");
            return;
        }

        let antes = contagem_de_processos();

        let limits = RunLimits {
            cpu_secs: 5,
            mem_kb: 262_144,
            wall_ms: 4_000,
        };

        let _ = run_safe_bin("/usr/bin/sh", None, limits).await;

        let depois = contagem_de_processos();

        assert!(
            depois < antes + 200,
            "o host ganhou processos demais durante a execução: {antes} -> {depois}"
        );
    }

    fn contagem_de_processos() -> usize {
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
    fn o_default_declara_1_gib_de_memoria() {
        let args = RunLimits::default().prlimit_args();

        assert!(args.contains(&"--as=1073741824".to_string()), "{args:?}");
    }

    fn existe(binario: &str) -> bool {
        std::process::Command::new("sh")
            .args(["-c", &format!("command -v {binario}")])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn o_envelope_de_execucao_limpa_o_ambiente_do_servidor() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        assert!(
            args.contains(&"--clearenv".to_string()),
            "--clearenv ausente: {args:?}"
        );
    }

    #[test]
    fn o_envelope_declara_apenas_variaveis_neutras() {
        let args = run_envelope_args("/app/bin", RunLimits::default());

        let declaradas: Vec<&String> = args
            .iter()
            .enumerate()
            .filter(|(i, _)| *i > 0 && args[i - 1] == "--setenv")
            .map(|(_, v)| v)
            .collect();

        assert_eq!(
            declaradas,
            vec!["PATH", "HOME", "TMPDIR", "GOMAXPROCS", "CGO_ENABLED"],
            "o envelope declarou variáveis inesperadas"
        );
    }

    #[tokio::test]
    async fn o_ambiente_do_servidor_nao_vaza_para_o_codigo_do_usuario() {
        if !existe("bwrap") || !existe("prlimit") {
            eprintln!("bwrap/prlimit ausente; teste pulado");
            return;
        }

        unsafe {
            std::env::set_var("ZEILE_SEGREDO_DE_TESTE", "jwt-secret-nao-deve-vazar");
        }

        let saida = run_safe_bin("/usr/bin/env", None, RunLimits::default()).await;

        unsafe {
            std::env::remove_var("ZEILE_SEGREDO_DE_TESTE");
        }

        assert!(
            !saida.stdout.contains("jwt-secret-nao-deve-vazar"),
            "o ambiente do servidor vazou para dentro do sandbox:\n{}",
            saida.stdout
        );
    }

    #[test]
    fn os_limites_chegam_ao_processo_filho() {
        if !existe("prlimit") || !existe("sh") {
            eprintln!("prlimit ou sh ausente; teste pulado");
            return;
        }

        let limits = RunLimits {
            cpu_secs: 7,
            mem_kb: 262_144,
            wall_ms: 1000,
        };

        let saida = std::process::Command::new("prlimit")
            .args(limits.prlimit_args())
            .args(["--", "sh", "-c", "ulimit -v; ulimit -t"])
            .output()
            .expect("prlimit deveria executar");

        let texto = String::from_utf8_lossy(&saida.stdout);
        let mut linhas = texto.split_whitespace();

        assert_eq!(linhas.next(), Some("262144"), "memória: {texto}");
        assert_eq!(linhas.next(), Some("7"), "cpu: {texto}");
    }
}
