use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;

use serde::Serialize;
use utoipa::ToSchema;

fn binary_exists(bin: &str) -> bool {
    if Path::new(bin).is_absolute() {
        return Path::new(bin).exists();
    }

    Command::new("sh")
        .args(["-c", &format!("command -v {bin}")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn sandbox_present() -> bool {
    binary_exists("bwrap") && binary_exists("prlimit")
}

fn rust_wasm_target_installed() -> bool {
    Command::new("rustup")
        .args(["target", "list", "--installed"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("wasm32-wasip1"))
        .unwrap_or(false)
}

fn zig_version_is_compatible() -> bool {
    let zig_path = std::env::var("ZIG_PATH").unwrap_or_else(|_| "zig".to_string());

    Command::new(&zig_path)
        .arg("version")
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .starts_with("0.15")
        })
        .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LanguageCapability {
    pub language: String,
    pub available: bool,
    pub missing: Vec<String>,
}

impl LanguageCapability {
    fn new(language: &str, checks: &[(&str, bool)]) -> Self {
        let missing: Vec<String> = checks
            .iter()
            .filter(|(_, ok)| !ok)
            .map(|(name, _)| name.to_string())
            .collect();

        LanguageCapability {
            language: language.to_string(),
            available: missing.is_empty(),
            missing,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitiesReport {
    pub sandbox: bool,
    pub languages: Vec<LanguageCapability>,
}

fn detect() -> CapabilitiesReport {
    let sandbox = sandbox_present();

    let languages = vec![
        LanguageCapability::new(
            "rust",
            &[
                ("bwrap", sandbox),
                ("cargo", binary_exists("cargo")),
                ("rustup", binary_exists("rustup")),
                ("wasm32-wasip1 target", rust_wasm_target_installed()),
                ("wasmtime", binary_exists(&crate::file::wasmtime_path())),
            ],
        ),
        LanguageCapability::new("go", &[("bwrap", sandbox), ("go", binary_exists("go"))]),
        LanguageCapability::new(
            "cpp",
            &[
                ("bwrap", sandbox),
                (
                    "clang++ or g++",
                    binary_exists("clang++") || binary_exists("g++"),
                ),
            ],
        ),
        LanguageCapability::new(
            "zig",
            &[
                ("bwrap", sandbox),
                ("zig 0.15.x", zig_version_is_compatible()),
            ],
        ),
    ];

    CapabilitiesReport { sandbox, languages }
}

static CAPABILITIES: OnceLock<CapabilitiesReport> = OnceLock::new();

pub fn capabilities_report() -> &'static CapabilitiesReport {
    CAPABILITIES.get_or_init(detect)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_language_with_every_check_passing_reports_no_missing_pieces() {
        let cap = LanguageCapability::new("go", &[("bwrap", true), ("go", true)]);

        assert!(cap.available);
        assert!(cap.missing.is_empty());
    }

    #[test]
    fn a_language_missing_a_check_names_it_and_reports_unavailable() {
        let cap = LanguageCapability::new("go", &[("bwrap", true), ("go", false)]);

        assert!(!cap.available);
        assert_eq!(cap.missing, vec!["go".to_string()]);
    }

    #[test]
    fn detect_always_reports_the_four_execution_languages() {
        let report = detect();

        let names: Vec<&str> = report
            .languages
            .iter()
            .map(|l| l.language.as_str())
            .collect();

        assert_eq!(names, vec!["rust", "go", "cpp", "zig"]);
    }
}
