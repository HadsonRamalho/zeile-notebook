use std::path::Path;
use std::time::Duration;

use tokio::process::Command;

use crate::file::{RunLimits, prlimit_interno_args};

pub const MOUNT_POINT: &str = "/app";

pub const CACHE_MOUNT: &str = "/cache";

const DEFAULT_CACHE_DIR: &str = "files/.build-cache";

pub fn shared_cache_dir() -> Option<String> {
    let dir = std::env::var("ZEILE_BUILD_CACHE").unwrap_or_else(|_| DEFAULT_CACHE_DIR.to_string());

    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!("shared build cache unavailable at {dir}: {e}");
        return None;
    }

    caminho_absoluto(&dir).ok()
}

pub const COMPILE_LIMITS: RunLimits = RunLimits {
    cpu_secs: 30,
    mem_kb: 4 * 1024 * 1024,
    wall_ms: 120_000,
};

pub const COMPILE_TMPFS_MB: u64 = 512;

pub const COMPILE_MAX_PROCESSOS: u64 = 512;

#[derive(Clone)]
pub struct CompileSandbox {
    pub workdir: String,
    pub toolchain: Vec<String>,
    pub cache: Option<String>,
    pub env: Vec<(String, String)>,
    pub limits: RunLimits,
}

impl CompileSandbox {
    pub fn new(workdir: impl Into<String>) -> Self {
        Self {
            workdir: workdir.into(),
            toolchain: Vec::new(),
            cache: None,
            env: Vec::new(),
            limits: COMPILE_LIMITS,
        }
    }

    pub fn com_cache_compartilhado(mut self) -> Self {
        self.cache = shared_cache_dir();
        self
    }

    pub fn cache_path(&self, sufixo: &str) -> String {
        match self.cache {
            Some(_) => format!("{CACHE_MOUNT}/{sufixo}"),
            None => format!("{MOUNT_POINT}/.cache/{sufixo}"),
        }
    }

    pub fn com_toolchain(mut self, path: impl Into<String>) -> Self {
        self.toolchain.push(path.into());
        self
    }

    pub fn com_compilador(self, program: &str) -> Self {
        let path = Path::new(program);

        if !path.is_absolute() {
            return self;
        }

        match path.parent().and_then(|p| p.to_str()) {
            Some(dir) if dir != "/usr/bin" && dir != "/bin" => self.com_toolchain(dir),
            _ => self,
        }
    }

    pub fn com_env(mut self, chave: &str, valor: impl Into<String>) -> Self {
        self.env.push((chave.to_string(), valor.into()));
        self
    }

    pub fn args(&self) -> Vec<String> {
        let mut args = self.limits.prlimit_args();
        args.push("--".into());
        args.push("bwrap".into());

        for flag in [
            "--unshare-all",
            "--die-with-parent",
            "--new-session",
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
            "--dev",
            "/dev",
            "--proc",
            "/proc",
            "--size",
            &(COMPILE_TMPFS_MB * 1024 * 1024).to_string(),
            "--tmpfs",
            "/tmp",
        ] {
            args.push(flag.into());
        }

        for dir in &self.toolchain {
            args.push("--ro-bind-try".into());
            args.push(dir.clone());
            args.push(dir.clone());
        }

        if let Some(cache) = &self.cache {
            args.push("--bind".into());
            args.push(cache.clone());
            args.push(CACHE_MOUNT.into());
        }

        args.push("--bind".into());
        args.push(self.workdir.clone());
        args.push(MOUNT_POINT.into());
        args.push("--chdir".into());
        args.push(MOUNT_POINT.into());

        args.extend(prlimit_interno_args(COMPILE_MAX_PROCESSOS));

        args
    }

    pub fn command(&self, program: &str, program_args: &[&str]) -> Command {
        let mut cmd = Command::new("prlimit");
        cmd.args(self.args());
        cmd.arg(program);
        cmd.args(program_args);

        cmd.env_clear();
        cmd.env("PATH", "/usr/bin:/bin");
        cmd.env("HOME", MOUNT_POINT);
        cmd.env("TMPDIR", "/tmp");

        for (chave, valor) in &self.env {
            cmd.env(chave, valor);
        }

        cmd
    }

    pub async fn executar(
        &self,
        program: &str,
        program_args: &[&str],
    ) -> Result<std::process::Output, String> {
        let execucao = self.command(program, program_args).output();

        match tokio::time::timeout(Duration::from_millis(self.limits.wall_ms), execucao).await {
            Ok(Ok(output)) => Ok(output),
            Ok(Err(e)) => Err(format!("Falha ao invocar {}: {}", program, e)),
            Err(_) => Err(format!(
                "A compilação passou de {}s e foi interrompida.",
                self.limits.wall_ms / 1000
            )),
        }
    }
}

pub fn caminho_absoluto(dir: &str) -> Result<String, String> {
    std::fs::canonicalize(dir)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Erro ao resolver o diretório da sessão: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn posicao(args: &[String], alvo: &str) -> usize {
        args.iter()
            .position(|a| a == alvo)
            .unwrap_or_else(|| panic!("{alvo} ausente em {args:?}"))
    }

    #[test]
    fn o_envelope_isola_namespace_processo_e_sessao() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        for flag in ["--unshare-all", "--die-with-parent", "--new-session"] {
            assert!(args.contains(&flag.to_string()), "{flag} ausente: {args:?}");
        }
    }

    #[test]
    fn o_workspace_da_sessao_e_o_unico_ponto_de_escrita() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        let bind = posicao(&args, "--bind");
        assert_eq!(args[bind + 1], "/srv/files/go/abc");
        assert_eq!(args[bind + 2], MOUNT_POINT);

        let usr = posicao(&args, "/usr");
        assert_eq!(args[usr - 1], "--ro-bind");
    }

    #[test]
    fn o_limite_de_memoria_faz_parte_do_envelope() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        assert_eq!(args[0], "--cpu=30");
        assert_eq!(args[1], "--as=4294967296");
        assert_eq!(args[2], "--");
        assert_eq!(args[3], "bwrap");
    }

    #[test]
    fn a_compilacao_tem_teto_de_processos_dentro_do_namespace() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        let bwrap = posicao(&args, "bwrap");
        let nproc = posicao(&args, &format!("--nproc={COMPILE_MAX_PROCESSOS}"));

        assert!(nproc > bwrap, "--nproc precisa ficar dentro do user namespace");
        assert_eq!(args[nproc - 1], "/usr/bin/prlimit");
        assert_eq!(args.last().unwrap(), "--");
    }

    #[test]
    fn a_compilacao_tem_tmpfs_com_teto() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        let size = posicao(&args, "--size");

        assert_eq!(args[size + 1], (COMPILE_TMPFS_MB * 1024 * 1024).to_string());
        assert_eq!(args[size + 2], "--tmpfs");
        assert_eq!(args[size + 3], "/tmp");
    }

    #[test]
    fn a_compilacao_tem_watchdog_de_wall_clock() {
        assert!(
            COMPILE_LIMITS.wall_ms > 0,
            "sem wall_ms a compilação pode ficar presa para sempre"
        );
    }

    #[tokio::test]
    async fn a_compilacao_travada_e_interrompida_pelo_watchdog() {
        let existe = |b: &str| {
            std::process::Command::new("sh")
                .args(["-c", &format!("command -v {b}")])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        };

        if !existe("bwrap") || !existe("prlimit") {
            eprintln!("bwrap/prlimit ausente; teste pulado");
            return;
        }

        let dir = "files/teste_watchdog";
        std::fs::create_dir_all(dir).expect("diretório da sessão");
        let abs = caminho_absoluto(dir).expect("caminho absoluto");

        let mut sandbox = CompileSandbox::new(abs);
        sandbox.limits.wall_ms = 1_000;

        let erro = sandbox
            .executar("sleep", &["30"])
            .await
            .expect_err("o watchdog deveria interromper");

        let _ = std::fs::remove_dir_all(dir);

        assert!(erro.contains("interrompida"), "{erro}");
    }

    #[test]
    fn compilador_fora_de_usr_entra_como_bind_de_leitura() {
        let args = CompileSandbox::new("/srv/files/zig/abc")
            .com_compilador("/opt/zig-0.13/zig")
            .args();

        let bind = posicao(&args, "/opt/zig-0.13");
        assert_eq!(args[bind - 1], "--ro-bind-try");
    }

    #[test]
    fn compilador_do_path_nao_gera_bind_extra() {
        let sandbox = CompileSandbox::new("/srv/files/go/abc").com_compilador("go");

        assert!(sandbox.toolchain.is_empty());
    }

    #[test]
    fn compilador_em_usr_bin_nao_gera_bind_redundante() {
        let sandbox = CompileSandbox::new("/srv/files/go/abc").com_compilador("/usr/bin/go");

        assert!(sandbox.toolchain.is_empty());
    }
}
