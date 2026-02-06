//! Splash window for uv download on macOS/Linux first startup
//!
//! Provides a setup UI for region selection and shows download progress.

use anyhow::Context;
use rv_lib::{download_uv, load_uv_config_from_resource, DownloadProgress, ResultExt, UvDownloadConfig};
use serde_json::json;
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::time::{sleep, Duration};

pub const SPLASH_WIN_LABEL: &str = "splash";

const SPLASH_WIDTH: f64 = 400.0;
const SPLASH_HEIGHT: f64 = 300.0;

/// Splash state - holds selected config
pub struct SplashState {
    config: Mutex<Option<UvDownloadConfig>>,
    bin_dir: Mutex<Option<PathBuf>>,
}

impl SplashState {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(None),
            bin_dir: Mutex::new(None),
        }
    }

    pub fn set_config(&self, config: UvDownloadConfig) {
        *self.config.lock().unwrap() = Some(config);
    }

    pub fn get_config(&self) -> Option<UvDownloadConfig> {
        self.config.lock().unwrap().clone()
    }

    pub fn set_bin_dir(&self, dir: PathBuf) {
        *self.bin_dir.lock().unwrap() = Some(dir);
    }

    pub fn get_bin_dir(&self) -> Option<PathBuf> {
        self.bin_dir.lock().unwrap().clone()
    }
}

impl Default for SplashState {
    fn default() -> Self {
        Self::new()
    }
}

/// Create the splash window
pub fn create_splash_window(app: &AppHandle) -> tauri::Result<()> {
    app.manage(SplashState::new());

    let _window = WebviewWindowBuilder::new(
        app,
        SPLASH_WIN_LABEL,
        WebviewUrl::App("splash.html".into()),
    )
    .title("Setup")
    .inner_size(SPLASH_WIDTH, SPLASH_HEIGHT)
    .resizable(false)
    .decorations(false)
    .center()
    .visible(true)
    .build()?;

    tracing::info!("Splash window created");
    Ok(())
}

/// State machine for setup flow
enum SetupState {
    Checking,
    SelectingRegion,
    Downloading,
    Extracting,
    Complete,
    Error(String),
}

/// Emit state to frontend
fn emit_state(app: &AppHandle, state: &SetupState) -> anyhow::Result<()> {
    let splash_win = app
        .get_webview_window(SPLASH_WIN_LABEL)
        .context("splash window not found")?;

    let payload = match state {
        SetupState::Checking => json!({ "state": "checking" }),
        SetupState::SelectingRegion => json!({ "state": "selecting_region" }),
        SetupState::Downloading => json!({ "state": "downloading" }),
        SetupState::Extracting => json!({ "state": "extracting" }),
        SetupState::Complete => json!({ "state": "complete" }),
        SetupState::Error(msg) => json!({ "state": "error", "message": msg }),
    };

    splash_win.emit("splash:state", payload)?;
    Ok(())
}

/// Emit progress to frontend
fn emit_progress(app: &AppHandle, progress: &DownloadProgress) -> anyhow::Result<()> {
    let splash_win = app
        .get_webview_window(SPLASH_WIN_LABEL)
        .context("splash window not found")?;

    let percent = if let Some(total) = progress.total {
        (progress.current as f64 / total as f64 * 100.0) as u32
    } else {
        0
    };

    let payload = json!({
        "current": progress.current,
        "total": progress.total,
        "percent": percent,
        "mirror": progress.mirror_name,
    });

    splash_win.emit("splash:progress", payload)?;
    Ok(())
}

/// Tauri command: Select region (cn or global)
#[tauri::command]
pub fn select_region(app: AppHandle, region: String) -> tauri::Result<()> {
    let profile = match region.as_str() {
        "cn" => "cn.toml",
        "global" => "global.toml",
        _ => return Err(anyhow::anyhow!("Invalid region").into()),
    };

    let resource_dir = app.path().resource_dir()
        .context("get resource dir")?;

    let config = load_uv_config_from_resource(&resource_dir, profile);

    let state = app.try_state::<SplashState>()
        .context("splash state not found")?;

    state.set_config(config);
    tracing::info!("Region selected: {}, mirrors: {}", region, state.get_config().as_ref().map(|c| c.mirrors.len()).unwrap_or(0));

    // Start download flow
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_download_flow(&app_clone).await.log_err("download flow failed");
    });

    Ok(())
}

/// Tauri command: Retry download
#[tauri::command]
pub fn retry_download(app: AppHandle) -> tauri::Result<()> {
    let state = app.try_state::<SplashState>()
        .context("splash state not found")?;

    if state.get_config().is_none() {
        return Err(anyhow::anyhow!("No config selected").into());
    }

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_download_flow(&app_clone).await.log_err("download retry failed");
    });

    Ok(())
}

/// Run the download flow
async fn run_download_flow(app: &AppHandle) -> anyhow::Result<()> {
    let state = app
        .try_state::<SplashState>()
        .context("splash state not found")?;

    let config = state
        .get_config()
        .ok_or_else(|| anyhow::anyhow!("No config selected"))?;

    let bin_dir = state
        .get_bin_dir()
        .ok_or_else(|| anyhow::anyhow!("Bin dir not set"))?;

    emit_state(app, &SetupState::Downloading)?;

    let app_clone = app.clone();
    let result = download_uv(&config, &bin_dir, move |progress| {
        let _ = emit_progress(&app_clone, &progress);
    })
    .await;

    match result {
        Ok(_) => {
            emit_state(app, &SetupState::Complete)?;

            // Close splash and start backend after brief delay
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                sleep(Duration::from_millis(500)).await;
                if let Some(splash_win) = app_clone.get_webview_window(SPLASH_WIN_LABEL) {
                    let _ = splash_win.close();
                }
                // Start backend (which will show main window when ready)
                let _ = app_clone.emit("splash:uv_ready", ()).log_err("emit splash:uv_ready");
                // Also invoke the command to start backend
                let app_clone_inner = app_clone.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = super::start_backend_after_splash(app_clone_inner.clone()).await
                        .log_err("start backend after splash");
                });
            });

            Ok(())
        }
        Err(e) => {
            emit_state(app, &SetupState::Error(e.to_string()))?;
            Err(e)
        }
    }
}

/// Run the setup flow - entry point for first-time setup
pub async fn run_setup_flow(app: AppHandle, bin_dir: PathBuf) -> anyhow::Result<()> {
    let state = app
        .try_state::<SplashState>()
        .context("splash state not found")?;

    state.set_bin_dir(bin_dir);

    emit_state(&app, &SetupState::SelectingRegion)?;

    Ok(())
}
