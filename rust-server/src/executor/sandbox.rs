use std::path::Path;
use std::time::Duration;

use tokio::process::Command;

use crate::file::{RunLimits, internal_prlimit_args};

pub const MOUNT_POINT: &str = "/app";

pub const CACHE_MOUNT: &str = "/cache";

const DEFAULT_CACHE_DIR: &str = "files/.build-cache";

pub fn shared_cache_dir() -> Option<String> {
    let dir = std::env::var("ZEILE_BUILD_CACHE").unwrap_or_else(|_| DEFAULT_CACHE_DIR.to_string());

    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!("shared build cache unavailable at {dir}: {e}");
        return None;
    }

    absolute_path(&dir).ok()
}

pub const COMPILE_LIMITS: RunLimits = RunLimits {
    cpu_secs: 30,
    mem_kb: 4 * 1024 * 1024,
    wall_ms: 120_000,
};

pub const COMPILE_TMPFS_MB: u64 = 512;

pub const COMPILE_MAX_PROCESSES: u64 = 512;

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

    pub fn with_shared_cache(mut self) -> Self {
        self.cache = shared_cache_dir();
        self
    }

    pub fn cache_path(&self, suffix: &str) -> String {
        match self.cache {
            Some(_) => format!("{CACHE_MOUNT}/{suffix}"),
            None => format!("{MOUNT_POINT}/.cache/{suffix}"),
        }
    }

    pub fn with_toolchain(mut self, path: impl Into<String>) -> Self {
        self.toolchain.push(path.into());
        self
    }

    pub fn with_compiler(self, program: &str) -> Self {
        let path = Path::new(program);

        if !path.is_absolute() {
            return self;
        }

        match path.parent().and_then(|p| p.to_str()) {
            Some(dir) if dir != "/usr/bin" && dir != "/bin" => self.with_toolchain(dir),
            _ => self,
        }
    }

    pub fn with_env(mut self, key: &str, value: impl Into<String>) -> Self {
        self.env.push((key.to_string(), value.into()));
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

        args.extend(internal_prlimit_args(COMPILE_MAX_PROCESSES));

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

        for (key, value) in &self.env {
            cmd.env(key, value);
        }

        cmd
    }

    pub async fn run(
        &self,
        program: &str,
        program_args: &[&str],
    ) -> Result<std::process::Output, String> {
        let execution = self.command(program, program_args).output();

        match tokio::time::timeout(Duration::from_millis(self.limits.wall_ms), execution).await {
            Ok(Ok(output)) => Ok(output),
            Ok(Err(e)) => Err(format!("Failed to invoke {}: {}", program, e)),
            Err(_) => Err(format!(
                "Compilation exceeded {}s and was interrupted.",
                self.limits.wall_ms / 1000
            )),
        }
    }
}

pub fn absolute_path(dir: &str) -> Result<String, String> {
    std::fs::canonicalize(dir)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to resolve the session directory: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn position(args: &[String], target: &str) -> usize {
        args.iter()
            .position(|a| a == target)
            .unwrap_or_else(|| panic!("{target} missing from {args:?}"))
    }

    #[test]
    fn the_envelope_isolates_namespace_process_and_session() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        for flag in ["--unshare-all", "--die-with-parent", "--new-session"] {
            assert!(args.contains(&flag.to_string()), "{flag} missing: {args:?}");
        }
    }

    #[test]
    fn the_session_workspace_is_the_only_write_point() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        let bind = position(&args, "--bind");
        assert_eq!(args[bind + 1], "/srv/files/go/abc");
        assert_eq!(args[bind + 2], MOUNT_POINT);

        let usr = position(&args, "/usr");
        assert_eq!(args[usr - 1], "--ro-bind");
    }

    #[test]
    fn the_memory_limit_is_part_of_the_envelope() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        assert_eq!(args[0], "--cpu=30");
        assert_eq!(args[1], "--as=4294967296");
        assert_eq!(args[2], "--");
        assert_eq!(args[3], "bwrap");
    }

    #[test]
    fn compilation_has_a_process_ceiling_inside_the_namespace() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        let bwrap = position(&args, "bwrap");
        let nproc = position(&args, &format!("--nproc={COMPILE_MAX_PROCESSES}"));

        assert!(nproc > bwrap, "--nproc must stay inside the user namespace");
        assert_eq!(args[nproc - 1], "/usr/bin/prlimit");
        assert_eq!(args.last().unwrap(), "--");
    }

    #[test]
    fn compilation_has_a_capped_tmpfs() {
        let args = CompileSandbox::new("/srv/files/go/abc").args();

        let size = position(&args, "--size");

        assert_eq!(args[size + 1], (COMPILE_TMPFS_MB * 1024 * 1024).to_string());
        assert_eq!(args[size + 2], "--tmpfs");
        assert_eq!(args[size + 3], "/tmp");
    }

    #[test]
    fn compilation_has_a_wall_clock_watchdog() {
        const {
            assert!(
                COMPILE_LIMITS.wall_ms > 0,
                "without wall_ms compilation could hang forever"
            );
        }
    }

    #[tokio::test]
    async fn a_stuck_compilation_is_interrupted_by_the_watchdog() {
        let exists = |b: &str| {
            std::process::Command::new("sh")
                .args(["-c", &format!("command -v {b}")])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        };

        if !exists("bwrap") || !exists("prlimit") {
            eprintln!("bwrap/prlimit missing; test skipped");
            return;
        }

        let dir = "files/watchdog_test";
        std::fs::create_dir_all(dir).expect("session directory");
        let abs = absolute_path(dir).expect("absolute path");

        let mut sandbox = CompileSandbox::new(abs);
        sandbox.limits.wall_ms = 1_000;

        let error = sandbox
            .run("sleep", &["30"])
            .await
            .expect_err("the watchdog should interrupt");

        std::fs::remove_dir_all(dir).ok();

        assert!(error.contains("interrupted"), "{error}");
    }

    #[test]
    fn compiler_outside_usr_becomes_a_read_bind() {
        let args = CompileSandbox::new("/srv/files/zig/abc")
            .with_compiler("/opt/zig-0.13/zig")
            .args();

        let bind = position(&args, "/opt/zig-0.13");
        assert_eq!(args[bind - 1], "--ro-bind-try");
    }

    #[test]
    fn compiler_from_path_does_not_generate_an_extra_bind() {
        let sandbox = CompileSandbox::new("/srv/files/go/abc").with_compiler("go");

        assert!(sandbox.toolchain.is_empty());
    }

    #[test]
    fn compiler_in_usr_bin_does_not_generate_a_redundant_bind() {
        let sandbox = CompileSandbox::new("/srv/files/go/abc").with_compiler("/usr/bin/go");

        assert!(sandbox.toolchain.is_empty());
    }
}
