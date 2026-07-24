// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
const WEBKIT_ENV_MARKER: &str = "ZEILE_WEBKIT_ENV";

#[cfg(target_os = "linux")]
const WEBKIT_ENV_VARS: [&str; 2] = [
    "WEBKIT_DISABLE_DMABUF_RENDERER",
    "WEBKIT_DISABLE_COMPOSITING_MODE",
];

// o WebKitGTK lê essas variáveis antes do main(), então definí-las com set_var não tem
// efeito: é preciso reexecutar o processo já com elas no ambiente. sem isso o webview
// fica em branco em GPUs/compositores onde a alocação de buffer GBM falha.
#[cfg(target_os = "linux")]
fn reexec_with_webkit_env() {
    use std::os::unix::process::CommandExt;

    if std::env::var_os(WEBKIT_ENV_MARKER).is_some() {
        return;
    }

    let Ok(exe) = std::env::current_exe() else {
        return;
    };

    let mut cmd = std::process::Command::new(exe);
    cmd.args(std::env::args_os().skip(1))
        .env(WEBKIT_ENV_MARKER, "1");

    for key in WEBKIT_ENV_VARS {
        if std::env::var_os(key).is_none() {
            cmd.env(key, "1");
        }
    }

    let _ = cmd.exec();
}

fn main() {
    #[cfg(target_os = "linux")]
    reexec_with_webkit_env();

    app_lib::run();
}
