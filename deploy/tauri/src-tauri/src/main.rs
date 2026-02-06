//! redViewer desktop tray application
//!
//! Main entry point for rv.exe - the tray application that manages
//! the backend Python process and provides the embedded web server.

#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]
#![cfg_attr(
    all(target_os = "windows", debug_assertions),
    windows_subsystem = "console"
)]

mod args;
mod i18n;
mod main_window;
mod python;
mod splash;
mod toast;
mod tray;
mod webserver;

use rv_lib::{resolve_paths, resolve_uv_paths, ensure_dirs, init_logging};
use serde_json::json;
use std::sync::{
    atomic::{AtomicBool, AtomicU8, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

use crate::python::PythonManager;
use crate::webserver::{WebServer, WebServerConfig};

/// Global flag to indicate user-initiated quit (vs window close)
static USER_QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Copy, Clone, Eq, PartialEq)]
enum BackendStatus {
    Starting = 0,
    Running = 1,
    Error = 2,
}

/// Global status to indicate backend readiness (persists across page reloads)
static BACKEND_STATUS: AtomicU8 = AtomicU8::new(BackendStatus::Starting as u8);
static BACKEND_ERROR: Mutex<Option<String>> = Mutex::new(None);

/// Set the quit flag (called from tray menu)
pub fn request_quit() {
    USER_QUIT_REQUESTED.store(true, Ordering::SeqCst);
}

/// Check if quit was requested by user
fn is_quit_requested() -> bool {
    USER_QUIT_REQUESTED.load(Ordering::SeqCst)
}

/// Set backend status and optional error message
fn set_backend_status(status: BackendStatus, error: Option<String>) {
    // Update error first to avoid race where status is ERROR but error is None
    if let Ok(mut guard) = BACKEND_ERROR.lock() {
        if status == BackendStatus::Error {
            *guard = error;
        } else {
            *guard = None;
        }
    }
    BACKEND_STATUS.store(status as u8, Ordering::SeqCst);
}

/// Read backend status from atomic
fn get_backend_status_value() -> BackendStatus {
    match BACKEND_STATUS.load(Ordering::SeqCst) {
        1 => BackendStatus::Running,
        2 => BackendStatus::Error,
        _ => BackendStatus::Starting,
    }
}

fn status_to_str(status: BackendStatus) -> &'static str {
    match status {
        BackendStatus::Starting => "STARTING",
        BackendStatus::Running => "RUNNING",
        BackendStatus::Error => "ERROR",
    }
}

fn build_backend_status_payload() -> serde_json::Value {
    let status = get_backend_status_value();
    let error = if status == BackendStatus::Error {
        BACKEND_ERROR.lock().ok().and_then(|guard| guard.clone())
    } else {
        None
    };
    match error {
        Some(e) => json!({ "status": status_to_str(status), "error": e }),
        None => json!({ "status": status_to_str(status) }),
    }
}

/// Check if running in development environment
fn is_dev_env() -> bool {
    std::env::var("DEV_ENV").is_ok()
}

/// Get backend status (for frontend to query on page load/refresh)
#[tauri::command]
fn get_backend_status() -> serde_json::Value {
    build_backend_status_payload()
}

/// Get the system theme
/// Returns "auto" to let the frontend detect via CSS media query or Tauri JS API
/// In Tauri v2, use `import { setTheme } from '@tauri-apps/api/app'` for theme control
#[tauri::command]
fn get_system_theme(_app_handle: tauri::AppHandle) -> Result<String, String> {
    // Return "auto" - frontend should use CSS `prefers-color-scheme` or Tauri's JS API
    // for actual theme detection and control
    Ok("auto".to_string())
}

/// Start backend after splash setup completes (macOS/Linux)
#[tauri::command]
async fn start_backend_after_splash(app: AppHandle) -> tauri::Result<()> {
    use anyhow::Context;

    // Get PythonManager from app state (clone immediately to release borrow)
    let pm = app.try_state::<PythonManager>()
        .context("PythonManager not found in app state")?
        .inner()
        .clone();

    // First, ensure backend is initialized (copy source + uv sync)
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    ensure_backend_initialized()
        .context("initialize backend")?;

    // Now start the backend
    set_backend_status(BackendStatus::Starting, None);
    let result = tokio::task::spawn_blocking(move || {
        let mut ok = true;
        let mut err_msg: Option<String> = None;

        tracing::info!("Starting Python backend...");
        if let Err(e) = pm.start() {
            tracing::error!("Failed to start backend: {:#}", e);
            ok = false;
            err_msg = Some(format!("{:#}", e));
        }

        let backend_url = if ok {
            tracing::info!("Waiting for backend to be ready...");
            if let Err(e) = pm.wait_until_healthy(std::time::Duration::from_secs(30)) {
                tracing::error!("Backend health check failed: {:#}", e);
                ok = false;
                err_msg = Some(format!("{:#}", e));
                None
            } else {
                tracing::info!("Backend is ready at {}", pm.backend_url());
                Some(pm.backend_url())
            }
        } else {
            None
        };

        let ws = if ok {
            tracing::info!("Starting embedded web server on http://0.0.0.0:8080...");
            match WebServer::start(WebServerConfig {
                backend_base: backend_url.unwrap(),
                ..Default::default()
            }) {
                Ok(ws) => {
                    tracing::info!("Embedded web server ready at {}", ws.url());
                    Some(ws)
                }
                Err(e) => {
                    tracing::error!("Failed to start embedded web server: {:#}", e);
                    ok = false;
                    err_msg = Some(format!("{:#}", e));
                    None
                }
            }
        } else {
            None
        };

        (ok, err_msg, ws)
    })
    .await;

    let (ok, err_msg, ws) = result.context("backend task failed")?;

    if let Some(ws) = ws {
        app.manage(ws);
    }
    let status = if ok { BackendStatus::Running } else { BackendStatus::Error };
    set_backend_status(status, err_msg.clone());

    if ok {
        let payload = build_backend_status_payload();
        let _ = app.emit("backend-ready", payload)
            .map_err(|e| tracing::warn!("emit backend-ready: {}", e));
        // Also show main window
        if let Some(w) = app.get_webview_window(main_window::MAIN_WIN_LABEL) {
            let _ = w.show()
                .map_err(|e| tracing::warn!("show main window: {}", e));
        }
    }

    if ok {
        Ok(())
    } else {
        Err(anyhow::anyhow!(err_msg.unwrap_or_default()).into())
    }
}

/// Install color-eyre error hooks with comprehensive reporting in dev mode
fn install_error_hooks() -> color_eyre::Result<()> {
    // In dev mode, enable all debugging features
    if is_dev_env() {
        // Force backtrace capture
        if std::env::var("RUST_BACKTRACE").is_err() {
            // SAFETY: called before any threads are spawned
            unsafe { std::env::set_var("RUST_BACKTRACE", "full"); }
        }
        if std::env::var("RUST_LIB_BACKTRACE").is_err() {
            // SAFETY: called before any threads are spawned
            unsafe { std::env::set_var("RUST_LIB_BACKTRACE", "1"); }
        }
    }

    // Install color-eyre hooks
    color_eyre::install()?;

    // Custom panic hook: write crash.log for user bug reports
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        // Call default hook first (prints to stderr if console available)
        default_hook(panic_info);

        // Write crash report to file
        if let Some(log_dir) = dirs::data_dir().map(|d| d.join("redViewer").join("logs")) {
            let _ = std::fs::create_dir_all(&log_dir);
            let crash_file = log_dir.join("crash.log");
            let crash_msg = format!(
                "redViewer crashed!\n\n{}\n\nBacktrace:\n{}",
                panic_info,
                std::backtrace::Backtrace::force_capture()
            );
            let _ = std::fs::write(&crash_file, &crash_msg);
        }
    }));

    Ok(())
}

/// Fatal error handler - logs error and exits
fn fatal_error(msg: &str, err: &dyn std::fmt::Display) -> ! {
    let full_msg = format!("{}: {:#}", msg, err);
    eprintln!("{}", full_msg);
    tracing::error!("{}", full_msg);
    std::process::exit(1);
}

/// Ensure backend is initialized on first run (macOS/Linux only)
///
/// On macOS/Linux, the backend source needs to be copied from app resources
/// to the data directory on first run, then `uv sync` is executed to create
/// the virtual environment.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn ensure_backend_initialized() -> anyhow::Result<()> {
    use anyhow::Context;
    use std::process::Command;

    let base = dirs::data_local_dir().context("failed to resolve data_local_dir")?;
    let backend_dir = base.join("redViewer").join("backend");

    // Skip if already fully initialized (pyproject.toml AND .venv exist)
    let pyproject_exists = backend_dir.join("pyproject.toml").exists();
    let venv_exists = backend_dir.join(".venv").exists();

    if pyproject_exists && venv_exists {
        return Ok(());
    }

    // If pyproject exists but .venv doesn't, we need to run uv sync
    let needs_copy = !pyproject_exists;

    tracing::info!("First run: initializing backend (copy={}, sync=true)...", needs_copy);

    // Copy backend source only if needed
    if needs_copy {
        // Find app resources
        let exe_dir = std::env::current_exe()
            .context("get exe path")?
            .parent()
            .ok_or_else(|| anyhow::anyhow!("cannot get exe dir"))?
            .to_path_buf();

        // On macOS, resources are in Contents/Resources/res/src
        // On Linux AppImage, resources are in the same directory as the executable
        #[cfg(target_os = "macos")]
        let src = exe_dir
            .parent() // Contents
            .and_then(|p| Some(p.join("Resources").join("res").join("src")))
            .ok_or_else(|| anyhow::anyhow!("cannot resolve macOS resources path"))?;

        #[cfg(target_os = "linux")]
        let src = exe_dir.join("res").join("src");

        if !src.exists() {
            return Err(anyhow::anyhow!(
                "Backend source not found in app resources: {}",
                src.display()
            ));
        }

        std::fs::create_dir_all(&backend_dir).context("create backend dir")?;
        copy_dir_recursive(&src, &backend_dir).context("copy backend source")?;
        tracing::info!("Backend source copied to {}", backend_dir.display());
    }

    // Resolve uv path and run sync
    let uv = rv_lib::resolve_uv()?;
    tracing::info!("Running uv sync...");

    let status = Command::new(&uv)
        .current_dir(&backend_dir)
        .arg("sync")
        .status()
        .context("uv sync")?;

    if !status.success() {
        return Err(anyhow::anyhow!("uv sync failed"));
    }

    tracing::info!("Backend initialization complete");
    Ok(())
}

/// Recursively copy a directory
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> anyhow::Result<()> {
    use anyhow::Context;

    std::fs::create_dir_all(dst).context("mkdir dst")?;

    for entry in std::fs::read_dir(src).context("read_dir src")? {
        let entry = entry.context("dir entry")?;
        let ty = entry.file_type().context("file_type")?;
        let from = entry.path();
        let to = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if ty.is_file() {
            std::fs::copy(&from, &to)
                .with_context(|| format!("copy {} -> {}", from.display(), to.display()))?;
        }
    }
    Ok(())
}

fn main() {
    // Install error hooks first, before anything else
    if let Err(e) = install_error_hooks() {
        eprintln!("Failed to install error hooks: {:#}", e);
        // Continue anyway - this shouldn't be fatal
    }

    let args = args::Args::parse();

    // Initialize paths and logging
    let paths = match resolve_paths().and_then(|p| {
        ensure_dirs(&p)?;
        Ok(p)
    }) {
        Ok(p) => p,
        Err(e) => fatal_error("Failed to initialize paths", &e),
    };

    let _log_guard = match init_logging(&paths, args.verbose) {
        Ok(g) => g,
        Err(e) => fatal_error("Failed to initialize logging", &e),
    };

    tracing::info!("redViewer tray starting (version {})", env!("CARGO_PKG_VERSION"));
    tracing::info!("Config dir: {}", paths.config_dir.display());

    // Backend-only mode: no Tauri, just Python backend
    if args.backend_only {
        tracing::info!("Backend-only mode requested");
        run_backend_only(&paths, args.verbose);
        return;
    }

    // Build and run Tauri application
    let ctx = tauri::generate_context!();

    let tauri_result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
            // Second instance was launched - do nothing, just exit
            // The first instance continues running
            tracing::info!("Another instance attempted to start, ignoring");
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            tracing::info!("Tauri setup starting...");

            // Resolve uv paths using unified path resolution
            let uv_paths = match resolve_uv_paths(&paths) {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!("Failed to resolve uv paths: {}", e);
                    return Err(e.into());
                }
            };

            // Create Python manager (don't start yet)
            let pm = PythonManager::new(
                paths.clone(),
                uv_paths,
                python::BackendConfig::default(),
            );

            // Store paths and PythonManager for access from commands
            app.manage(paths.clone());
            app.manage(pm.clone());

            // Resolve frontend dist directory
            let resource_dir = match app.path().resource_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    tracing::error!("Failed to resolve resource_dir: {}", e);
                    return Err(e.into());
                }
            };

            let dist_dir = resource_dir.join("res").join("dist");
            if dist_dir.exists() {
                tracing::info!("Found frontend dist at: {}", dist_dir.display());
                // SAFETY: set_var is safe in single-threaded setup context
                unsafe { std::env::set_var("RV_DIST_DIR", &dist_dir); }
            } else {
                #[cfg(not(debug_assertions))]
                {
                    tracing::error!(
                        "Frontend dist not found in resources. Expected: {}",
                        dist_dir.display()
                    );
                    return Err(anyhow::anyhow!(
                        "Frontend dist not found in bundled resources: {}",
                        dist_dir.display()
                    ).into());
                }

                #[cfg(debug_assertions)]
                {
                    tracing::warn!(
                        "Frontend dist not found in resources: {}",
                        dist_dir.display()
                    );
                }
            }

            // === UI First: Create tray, main window, toast before backend startup ===

            // Build system tray (unless disabled)
            if !args.no_tray {
                let _tray = tray::build_tray(&app.handle())?;
            }

            // On macOS/Linux, check if uv needs to be downloaded
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            {
                if !rv_lib::is_uv_ready() {
                    tracing::info!("uv not ready, starting setup flow");

                    // Create splash window for download
                    if let Err(e) = splash::create_splash_window(&app.handle()) {
                        tracing::warn!("Failed to create splash window: {}", e);
                    }

                    // Create main window but keep it hidden
                    if let Err(e) = main_window::create_main_win_hidden(&app.handle()) {
                        tracing::warn!("Failed to create main window: {}", e);
                    }

                    // Create toast window
                    if let Err(e) = toast::create_toast_win(&app.handle()) {
                        tracing::warn!("Failed to create toast window: {}", e);
                    }

                    // Start splash setup flow
                    let bin_dir = dirs::data_local_dir()
                        .map(|d| d.join("redViewer").join("bin"))
                        .ok_or_else(|| tauri::Error::FailedToReceiveMessage)?;
                    let app_clone = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = splash::run_setup_flow(app_clone, bin_dir).await {
                            tracing::error!("Setup flow failed: {}", e);
                            // On error, try to continue anyway
                        }
                    });

                    return Ok(());
                }
            }

            // Normal flow: create and show main window
            if let Err(e) = main_window::create_main_win(&app.handle()) {
                tracing::warn!("Failed to create main window: {}", e);
            }
            // Create toast window
            if let Err(e) = toast::create_toast_win(&app.handle()) {
                tracing::warn!("Failed to create toast window: {}", e);
            }

            // === Async Backend Startup ===
            let app_handle = app.handle().clone();
            let pm_for_task = pm.clone();
            set_backend_status(BackendStatus::Starting, None);
            tauri::async_runtime::spawn(async move {
                let result = tokio::task::spawn_blocking(move || {
                    let mut ok = true;
                    let mut err_msg: Option<String> = None;

                    tracing::info!("Starting Python backend...");
                    if let Err(e) = pm_for_task.start() {
                        tracing::error!("Failed to start backend: {}", e);
                        ok = false;
                        err_msg = Some(format!("Failed to start backend: {}", e));
                    }

                    if ok {
                        tracing::info!("Waiting for backend to be ready...");
                        if let Err(e) = pm_for_task.wait_until_healthy(std::time::Duration::from_secs(30)) {
                            tracing::error!("Backend health check failed: {}", e);
                            ok = false;
                            err_msg = Some(format!("Backend health check failed: {}", e));
                        } else {
                            tracing::info!("Backend is ready at {}", pm_for_task.backend_url());
                        }
                    }

                    let ws = if ok {
                        tracing::info!("Starting embedded web server on http://0.0.0.0:8080...");
                        match WebServer::start(WebServerConfig {
                            backend_base: pm_for_task.backend_url(),
                            ..Default::default()
                        }) {
                            Ok(ws) => {
                                tracing::info!("Embedded web server ready at {}", ws.url());
                                Some(ws)
                            }
                            Err(e) => {
                                tracing::error!("Failed to start embedded web server: {}", e);
                                ok = false;
                                err_msg = Some(format!("Failed to start embedded web server: {}", e));
                                None
                            }
                        }
                    } else {
                        None
                    };

                    (ok, err_msg, ws)
                })
                .await;

                match result {
                    Ok((ok, err_msg, ws)) => {
                        if let Some(ws) = ws {
                            app_handle.manage(ws);
                        }
                        let status = if ok { BackendStatus::Running } else { BackendStatus::Error };
                        set_backend_status(status, err_msg);
                        let payload = build_backend_status_payload();
                        if let Err(e) = app_handle.emit("backend-ready", payload) {
                            tracing::warn!("Failed to emit backend-ready: {}", e);
                        }
                    }
                    Err(e) => {
                        let error = format!("Backend task join error: {}", e);
                        set_backend_status(BackendStatus::Error, Some(error));
                        let payload = build_backend_status_payload();
                        if let Err(e) = app_handle.emit("backend-ready", payload) {
                            tracing::warn!("Failed to emit backend-ready: {}", e);
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            main_window::main_window_open_browser,
            main_window::main_window_close,
            main_window::get_lan_url,
            get_backend_status,
            get_system_theme,
            toast::show_toast,
            splash::select_region,
            splash::retry_download,
            start_backend_after_splash,
        ])
        .build(ctx);

    #[allow(clippy::expect_used)]
    let tauri_app = tauri_result.expect("error building tauri application");

    tauri_app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            // Only prevent exit if NOT explicitly requested by user (e.g., tray quit)
            // This allows the app to stay running when windows are closed
            if !is_quit_requested() {
                api.prevent_exit();
            }
        }
    });
}

/// Run backend-only mode without Tauri
fn run_backend_only(paths: &rv_lib::AppPaths, _verbose: bool) {
    let uv_paths = match resolve_uv_paths(paths) {
        Ok(p) => p,
        Err(e) => fatal_error("Failed to resolve uv paths", &e),
    };

    let pm = PythonManager::new(
        paths.clone(),
        uv_paths,
        python::BackendConfig::default(),
    );

    tracing::info!("Starting Python backend...");
    if let Err(e) = pm.start() {
        fatal_error("Failed to start backend", &e);
    }

    tracing::info!("Waiting for backend to be ready...");
    if let Err(e) = pm.wait_until_healthy(std::time::Duration::from_secs(30)) {
        fatal_error("Backend health check failed", &e);
    }

    tracing::info!("Backend is ready at {}", pm.backend_url());
    eprintln!("Backend running at {}", pm.backend_url());
    eprintln!("Press Ctrl+C to exit");

    loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}
