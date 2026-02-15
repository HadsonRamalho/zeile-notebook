use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{Duration, timeout};

pub async fn run_safe_bin(caminho_binario: &str) -> (String, String) {
    println!(
        "LOG: Tentando iniciar processo no caminho ABSOLUTO: {}",
        caminho_binario
    );

    let path_obj = Path::new(caminho_binario);
    if !path_obj.exists() {
        eprintln!(
            "ERRO CRÍTICO: O arquivo binário NÃO EXISTE no disco: {}",
            caminho_binario
        );
        return ("".into(), format!("Erro interno: Binário não encontrado."));
    }
    println!("CAMINHO RECEBIDO: {}", caminho_binario);

    let is_wasm = caminho_binario.ends_with(".wasm");

    let mut cmd = if is_wasm {
        let mut c = Command::new("wasmtime");
        c.arg("run").arg(caminho_binario);
        c
    } else {
        let mut c = Command::new("bwrap");

        c.args(["--ro-bind", "/usr", "/usr"]);
        c.args(["--ro-bind-try", "/lib", "/lib"]);
        c.args(["--ro-bind-try", "/lib64", "/lib64"]);
        c.args(["--ro-bind-try", "/bin", "/bin"]);

        c.args(["--dev", "/dev"]);
        c.args(["--proc", "/proc"]);

        c.args(["--unshare-all"]);

        c.args(["--ro-bind", caminho_binario, caminho_binario]);

        c.arg(caminho_binario);

        c.env("GOMAXPROCS", "1");
        c.env("CGO_ENABLED", "0");
        c
    };

    let child = match cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("ERRO ao spawnar processo: {}", e);
            return ("".into(), format!("Erro ao iniciar execução: {}", e));
        }
    };

    let pid = child.id().expect("Falha ao obter PID");
    println!("LOG: Processo iniciado com PID: {}", pid);

    match timeout(Duration::from_secs(5), child.wait_with_output()).await {
        Ok(Ok(output)) => {
            println!("LOG: Execução finalizada com sucesso.");
            (
                String::from_utf8_lossy(&output.stdout).to_string(),
                String::from_utf8_lossy(&output.stderr).to_string(),
            )
        }
        Ok(Err(e)) => {
            eprintln!("ERRO de I/O durante execução: {}", e);
            ("".into(), format!("Erro de I/O na execução: {}", e))
        }
        Err(_) => {
            eprintln!("TIMEOUT: Matando processo {}", pid);

            #[cfg(windows)]
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output();

            #[cfg(not(windows))]
            let _ = std::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();

            (
                "".into(),
                "Erro: Tempo limite de execução (5s) excedido.".into(),
            )
        }
    }
}

pub async fn setup_user_env(ip_safe: &str) -> PathBuf {
    let user_dir = format!("files/{}", ip_safe);
    let src_dir = format!("{}/src", user_dir);

    if let Err(e) = tokio::fs::create_dir_all(&src_dir).await {
        eprintln!("ERRO: Falha ao criar diretórios {}: {}", src_dir, e);
    }

    if !Path::new(&format!("{}/Cargo.toml", user_dir)).exists() {
        eprintln!("LOG: Iniciando novo projeto Cargo em {}", user_dir);

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
                    eprintln!(
                        "ERRO: Cargo init falhou: {}",
                        String::from_utf8_lossy(&o.stderr)
                    );
                }
            }
            Err(e) => eprintln!("ERRO: Falha ao executar cargo init: {}", e),
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
