//! Configuration and path management for redViewer desktop application
//!
//! Provides paths, logging, and application settings shared between
//! src-tauri (main application) and installer (installer utility).

use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing_subscriber::prelude::*;

/// Application paths for config, logs, and runtime data
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub config_file: PathBuf,
    pub log_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub app_settings_file: PathBuf,
}

/// Resolve application paths based on platform
///
/// Path strategy:
/// - Windows: All data in %LOCALAPPDATA%\redViewer
/// - macOS: Data in ~/Library/Application Support/redViewer, logs in ~/Library/Logs/redViewer
/// - Linux: Data in ~/.local/share/redViewer, config in ~/.config/redViewer (XDG)
pub fn resolve_paths() -> anyhow::Result<AppPaths> {
    let base = dirs::data_local_dir().context("failed to resolve data_local_dir")?;
    let data_root = base.join("redViewer");

    let config_dir = if cfg!(target_os = "linux") {
        dirs::config_dir()
            .context("failed to resolve config_dir")?
            .join("redViewer")
    } else {
        data_root.join("config")
    };

    let log_dir = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .context("failed to resolve home_dir")?
            .join("Library/Logs/redViewer")
    } else {
        data_root.join("logs")
    };

    let runtime_dir = data_root.join("runtime");
    let config_file = config_dir.join("conf.yml");
    let app_settings_file = config_dir.join("app-settings.json");

    Ok(AppPaths {
        config_dir,
        config_file,
        log_dir,
        runtime_dir,
        app_settings_file,
    })
}

/// Ensure all required directories exist
pub fn ensure_dirs(paths: &AppPaths) -> anyhow::Result<()> {
    std::fs::create_dir_all(&paths.config_dir).context("create config_dir")?;
    std::fs::create_dir_all(&paths.log_dir).context("create log_dir")?;
    std::fs::create_dir_all(&paths.runtime_dir).context("create runtime_dir")?;
    Ok(())
}

/// Initialize logging with file and optional console output
pub fn init_logging(paths: &AppPaths, verbose: bool) -> anyhow::Result<tracing_appender::non_blocking::WorkerGuard> {
    let level = if verbose { "debug" } else { "info" };
    let env_filter = tracing_subscriber::EnvFilter::try_new(level)
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    let log_file = if std::env::var("RV_INSTALLER").is_ok() {
        "redviewer-installer.log"
    } else {
        "redviewer-tray.log"
    };

    let file_appender = tracing_appender::rolling::daily(&paths.log_dir, log_file);
    let (non_blocking_file, guard) = tracing_appender::non_blocking(file_appender);

    let enable_console = cfg!(debug_assertions) || verbose;

    if enable_console {
        let file_layer = tracing_subscriber::fmt::layer()
            .with_writer(non_blocking_file)
            .with_ansi(false)
            .with_file(true)
            .with_line_number(true);

        let console_layer = tracing_subscriber::fmt::layer()
            .with_writer(std::io::stderr)
            .with_ansi(true)
            .with_file(true)
            .with_line_number(true);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(file_layer)
            .with(console_layer)
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_writer(non_blocking_file)
            .with_ansi(false)
            .with_file(true)
            .with_line_number(true)
            .with_env_filter(env_filter)
            .init();
    }

    tracing::info!("Logging initialized: log_dir={}, console={}, level={}",
        paths.log_dir.display(),
        enable_console,
        level
    );

    Ok(guard)
}

/// Application settings (persisted across runs)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub last_pyenv: Option<String>,
    pub installed_once: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            last_pyenv: None,
            installed_once: false,
        }
    }
}

/// Load application settings from disk
pub fn load_app_config(paths: &AppPaths) -> anyhow::Result<AppConfig> {
    if !paths.app_settings_file.exists() {
        return Ok(AppConfig::default());
    }

    let content = std::fs::read_to_string(&paths.app_settings_file)
        .context("read app settings file")?;

    serde_json::from_str(&content).context("parse app settings")
}

/// Save application settings to disk
pub fn save_app_config(paths: &AppPaths, cfg: &AppConfig) -> anyhow::Result<()> {
    let content = serde_json::to_string_pretty(cfg).context("serialize app settings")?;

    std::fs::write(&paths.app_settings_file, content.as_bytes()).context("write app settings")?;

    tracing::debug!("Saved app settings: {:?}", cfg);
    Ok(())
}

/// Open a path in the system file manager
pub fn open_in_file_manager<P: AsRef<Path>>(path: P) -> anyhow::Result<()> {
    let path = path.as_ref();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .context("spawn explorer")?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .context("spawn open")?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .context("spawn xdg-open")?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}
