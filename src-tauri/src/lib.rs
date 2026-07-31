use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const FRONTEND_PORT: u16 = 3000;
const BACKEND_PORT: u16 = 3099;
const LOOPBACK: &str = "127.0.0.1";

const SHUTDOWN_BUDGET: Duration = Duration::from_secs(10);
const PROBE_TIMEOUT: Duration = Duration::from_millis(500);
const POLL_STEP: Duration = Duration::from_millis(100);

#[derive(Default)]
struct Procs {
    backend: Option<Child>,
    frontend: Option<Child>,
}

struct Shell {
    /// token de sessão do `POST /internal/shutdown`
    token: String,
    procs: Mutex<Procs>,
    stopping: AtomicBool,
}

#[cfg(unix)]
fn ensure_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        perms.set_mode(0o755);
        let _ = std::fs::set_permissions(path, perms);
    }
}

#[cfg(not(unix))]
fn ensure_executable(_path: &Path) {}

#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_console(_cmd: &mut Command) {}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect((LOOPBACK, port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

const BACKEND_NAME: &str = if cfg!(windows) {
    "rust-server.exe"
} else {
    "rust-server"
};
const NODE_NAME: &str = if cfg!(windows) { "node.exe" } else { "node" };

#[cfg(unix)]
fn restrict_to_owner(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

fn jwt_secret(app: &tauri::AppHandle) -> Option<String> {
    let dir = app.path().app_local_data_dir().ok()?;
    let path = dir.join("jwt_secret");

    if let Ok(existing) = std::fs::read_to_string(&path) {
        let existing = existing.trim().to_string();
        if !existing.is_empty() {
            if let Err(e) = restrict_to_owner(&path) {
                log::warn!("nao foi possivel restringir {}: {e}", path.display());
            }
            return Some(existing);
        }
    }

    let secret = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    std::fs::create_dir_all(&dir).ok()?;
    std::fs::write(&path, &secret).ok()?;

    if let Err(e) = restrict_to_owner(&path) {
        log::error!(
            "segredo de JWT gravado sem permissao restrita em {}: {e}",
            path.display()
        );
        return None;
    }

    Some(secret)
}

fn spawn_backend(app: &tauri::AppHandle, resource_dir: &Path, token: &str) -> Option<Child> {
    let bin = if cfg!(debug_assertions) {
        std::env::var("ZEILE_BACKEND_BIN")
            .unwrap_or_else(|_| format!("../rust-server/target/debug/{BACKEND_NAME}"))
            .into()
    } else {
        let bin = resource_dir.join(format!("resources/backend/{BACKEND_NAME}"));
        ensure_executable(&bin);
        bin
    };

    let mut cmd = Command::new(&bin);
    hide_console(&mut cmd);
    cmd.env("DATABASE_TLS", "off")
        .env("PORT", BACKEND_PORT.to_string())
        .env("BIND_ADDR", LOOPBACK)
        .env("ZEILE_SHELL_TOKEN", token);
    if let Ok(app_data) = app.path().app_local_data_dir() {
        cmd.env("ZEILE_PG_DATA", app_data.join("pg"));
    }
    if std::env::var_os("JWT_SECRET").is_none() {
        if let Some(secret) = jwt_secret(app) {
            cmd.env("JWT_SECRET", secret);
        }
    }

    match cmd.spawn() {
        Ok(child) => {
            log::info!("backend local iniciado: {}", bin.display());
            Some(child)
        }
        Err(e) => {
            log::error!("falha ao iniciar backend local ({}): {e}", bin.display());
            None
        }
    }
}

fn open_archive(
    archive: &Path,
) -> std::io::Result<tar::Archive<flate2::read::GzDecoder<std::fs::File>>> {
    let file = std::fs::File::open(archive)?;
    Ok(tar::Archive::new(flate2::read::GzDecoder::new(file)))
}

#[cfg(not(windows))]
fn extract_archive(archive: &Path, dest: &Path) -> std::io::Result<()> {
    open_archive(archive)?.unpack(dest)
}

#[cfg(windows)]
fn extract_archive(archive: &Path, dest: &Path) -> std::io::Result<()> {
    let mut pending: Vec<(PathBuf, PathBuf)> = Vec::new();

    for entry in open_archive(archive)?.entries()? {
        let mut entry = entry?;
        if entry.header().entry_type().is_symlink() {
            let link = dest.join(entry.path()?.into_owned());
            if let Some(target) = entry.link_name()? {
                pending.push((link, target.into_owned()));
            }
            continue;
        }
        entry.unpack_in(dest)?;
    }

    while !pending.is_empty() {
        let before = pending.len();
        let mut retry = Vec::new();

        for (link, target) in pending {
            let Some(parent) = link.parent() else {
                continue;
            };
            let resolved = parent.join(&target);
            if resolved.is_dir() {
                let _ = std::fs::create_dir_all(parent);
                let _ = junction::create(&resolved, &link);
            } else if resolved.is_file() {
                let _ = std::fs::create_dir_all(parent);
                let _ = std::fs::copy(&resolved, &link);
            } else {
                retry.push((link, target));
            }
        }

        if retry.len() == before {
            for (link, _) in &retry {
                log::warn!("link sem alvo apos extracao: {}", link.display());
            }
            break;
        }
        pending = retry;
    }

    Ok(())
}

fn extract_frontend(app: &tauri::AppHandle, resource_dir: &Path) -> Option<PathBuf> {
    let archive = resource_dir.join("resources/next.tar.gz");
    let dest = app.path().app_local_data_dir().ok()?.join("next");
    let stamp = dest.join(".stamp");
    let version = env!("CARGO_PKG_VERSION");

    let up_to_date = dest.join("server.js").exists()
        && std::fs::read_to_string(&stamp).ok().as_deref() == Some(version);

    if !up_to_date {
        let _ = std::fs::remove_dir_all(&dest);
        if std::fs::create_dir_all(&dest).is_err() {
            return None;
        }
        if let Err(e) = extract_archive(&archive, &dest) {
            log::error!("falha ao extrair {}: {e}", archive.display());
            return None;
        }
        let _ = std::fs::write(&stamp, version);
    }

    Some(dest)
}

fn spawn_frontend(app: &tauri::AppHandle, resource_dir: &Path) -> Option<Child> {
    let node = resource_dir.join(format!("resources/{NODE_NAME}"));
    let dir = extract_frontend(app, resource_dir)?;
    let server = dir.join("server.js");
    ensure_executable(&node);

    let mut cmd = Command::new(&node);
    hide_console(&mut cmd);
    cmd.arg(&server)
        .current_dir(&dir)
        .env("PORT", FRONTEND_PORT.to_string())
        .env("HOSTNAME", LOOPBACK);

    match cmd.spawn() {
        Ok(child) => {
            log::info!("frontend local iniciado: {}", server.display());
            Some(child)
        }
        Err(e) => {
            log::error!(
                "falha ao iniciar frontend local ({}): {e}",
                server.display()
            );
            None
        }
    }
}

/// HTTP/1.1 mínimo sobre o loopback: são duas requisições, não vale um cliente HTTP
/// inteiro no bundle.
fn http_status(port: u16, request: &str) -> Option<u16> {
    let addr = SocketAddr::new(LOOPBACK.parse().ok()?, port);
    let mut stream = TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).ok()?;

    stream.set_read_timeout(Some(PROBE_TIMEOUT)).ok()?;
    stream.set_write_timeout(Some(PROBE_TIMEOUT)).ok()?;
    stream.write_all(request.as_bytes()).ok()?;

    let mut buffer = [0u8; 64];
    let mut lidos = 0;

    // "HTTP/1.1 202 " — 13 bytes bastam para o status
    while lidos < 13 {
        match stream.read(&mut buffer[lidos..]) {
            Ok(0) => break,
            Ok(n) => lidos += n,
            Err(_) => break,
        }
    }

    std::str::from_utf8(&buffer[..lidos])
        .ok()?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()
}

fn request_backend_shutdown(token: &str) -> Option<u16> {
    http_status(
        BACKEND_PORT,
        &format!(
            "POST /internal/shutdown HTTP/1.1\r\n\
             Host: {LOOPBACK}:{BACKEND_PORT}\r\n\
             x-zeile-shell-token: {token}\r\n\
             Content-Length: 0\r\n\
             Connection: close\r\n\r\n"
        ),
    )
}

fn backend_ready() -> bool {
    http_status(
        BACKEND_PORT,
        &format!(
            "GET /health/ready HTTP/1.1\r\n\
             Host: {LOOPBACK}:{BACKEND_PORT}\r\n\
             Connection: close\r\n\r\n"
        ),
    )
    .is_some()
}

/// Fecha o backend pedindo, não matando: entre dois ciclos do `checkpoint_loop` o
/// documento Automerge vive só em memória. SIGKILL vira último recurso, por timeout.
fn stop_backend(shell: &Shell) {
    let mut procs = match shell.procs.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    let prazo = Instant::now() + SHUTDOWN_BUDGET;

    if let Some(backend) = procs.backend.as_mut() {
        match request_backend_shutdown(&shell.token) {
            Some(status) if (200..300).contains(&status) => {
                log::info!("shutdown pedido ao backend (HTTP {status})");
            }
            Some(status) => {
                log::warn!("backend recusou o shutdown (HTTP {status}); seguindo para o kill");
            }
            None => {
                log::warn!("backend não respondeu ao pedido de shutdown; seguindo para o kill");
            }
        }

        while Instant::now() < prazo {
            match backend.try_wait() {
                Ok(Some(status)) => {
                    log::info!("backend encerrou sozinho ({status})");
                    procs.backend = None;
                    break;
                }
                Ok(None) => {
                    if backend_ready() {
                        log::debug!("backend ainda atende /health/ready");
                    }
                    std::thread::sleep(POLL_STEP);
                }
                Err(e) => {
                    log::warn!("não foi possível checar o backend: {e}");
                    break;
                }
            }
        }
    }

    if let Some(mut backend) = procs.backend.take() {
        log::warn!("backend não encerrou em {SHUTDOWN_BUDGET:?}; matando o processo");
        let _ = backend.kill();
        let _ = backend.wait();
    }

    // o frontend não guarda estado; encerra depois para a janela não morrer antes do
    // checkpoint do backend
    if let Some(mut frontend) = procs.frontend.take() {
        let _ = frontend.kill();
        let _ = frontend.wait();
    }
}

fn kill_children(handle: &tauri::AppHandle) {
    let Some(shell) = handle.try_state::<Shell>() else {
        return;
    };

    let mut procs = match shell.procs.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    for mut child in procs
        .backend
        .take()
        .into_iter()
        .chain(procs.frontend.take())
    {
        let _ = child.kill();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let resource_dir = app.path().resource_dir().unwrap_or_default();

            let token = uuid::Uuid::new_v4().to_string();

            let backend = spawn_backend(app.handle(), &resource_dir, &token);
            let frontend = if cfg!(debug_assertions) {
                None
            } else {
                spawn_frontend(app.handle(), &resource_dir)
            };

            app.manage(Shell {
                token,
                procs: Mutex::new(Procs { backend, frontend }),
                stopping: AtomicBool::new(false),
            });

            if !wait_for_port(FRONTEND_PORT, Duration::from_secs(30)) {
                log::warn!("frontend em :{FRONTEND_PORT} não respondeu a tempo");
            }

            let url = format!("http://{LOOPBACK}:{FRONTEND_PORT}");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("Zeile Notebook")
                .inner_size(1400.0, 900.0)
                .resizable(true)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|handle, event| match event {
            // sem `prevent_exit` a janela morre antes do checkpoint final
            RunEvent::ExitRequested { api, .. } => {
                let Some(shell) = handle.try_state::<Shell>() else {
                    return;
                };

                if shell.stopping.swap(true, Ordering::AcqRel) {
                    return;
                }

                api.prevent_exit();

                let handle = handle.clone();
                std::thread::spawn(move || {
                    if let Some(shell) = handle.try_state::<Shell>() {
                        stop_backend(&shell);
                    }
                    handle.exit(0);
                });
            }
            RunEvent::Exit => kill_children(handle),
            _ => {}
        });
}
