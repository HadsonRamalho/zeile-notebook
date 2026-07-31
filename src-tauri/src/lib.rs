use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const FRONTEND_PORT: u16 = 3000;
const BACKEND_PORT: u16 = 3099;
const LOOPBACK: &str = "127.0.0.1";

struct Children(Mutex<Vec<Child>>);

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

fn spawn_backend(app: &tauri::AppHandle, resource_dir: &Path) -> Option<Child> {
    let bin = if cfg!(debug_assertions) {
        std::env::var("ZEILE_BACKEND_BIN")
            .unwrap_or_else(|_| {
                format!("../rust-server/target/debug/{BACKEND_NAME}")
            })
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
        .env("BIND_ADDR", LOOPBACK);
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
            let Some(parent) = link.parent() else { continue };
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
            log::error!("falha ao iniciar frontend local ({}): {e}", server.display());
            None
        }
    }
}

fn kill_children(handle: &tauri::AppHandle) {
    if let Some(state) = handle.try_state::<Children>() {
        if let Ok(mut guard) = state.0.lock() {
            for mut child in guard.drain(..) {
                let _ = child.kill();
            }
        }
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

            let mut children = Vec::new();
            if let Some(child) = spawn_backend(app.handle(), &resource_dir) {
                children.push(child);
            }
            if !cfg!(debug_assertions) {
                if let Some(child) = spawn_frontend(app.handle(), &resource_dir) {
                    children.push(child);
                }
            }
            app.manage(Children(Mutex::new(children)));

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
        .run(|handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                kill_children(handle);
            }
        });
}
