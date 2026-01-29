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
mod guide;
mod python;
mod tray;
mod webserver;

use rv_lib::{resolve_paths, resolve_uv, ensure_dirs, init_logging, UvPaths};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

use crate::python::PythonManager;
use crate::webserver::{WebServer, WebServerConfig};

/// Global flag to indicate user-initiated quit (vs window close)
static USER_QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Set the quit flag (called from tray menu)
pub fn request_quit() {
    USER_QUIT_REQUESTED.store(true, Ordering::SeqCst);
}

/// Check if quit was requested by user
fn is_quit_requested() -> bool {
    USER_QUIT_REQUESTED.load(Ordering::SeqCst)
}

/// Check if running in development environment
fn is_dev_env() -> bool {
    std::env::var("DEV_ENV").is_ok()
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

    // Custom panic hook that writes crash report to file and shows MessageBox on Windows
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        // Call default hook first (prints to stderr if console available)
        default_hook(panic_info);

        // Build crash report
        let crash_msg = format!(
            "redViewer crashed!\n\n{}\n\nBacktrace:\n{}",
            panic_info,
            std::backtrace::Backtrace::force_capture()
        );

        // Write crash report to file
        if let Some(log_dir) = dirs::data_dir().map(|d| d.join("redViewer").join("logs")) {
            let _ = std::fs::create_dir_all(&log_dir);
            let crash_file = log_dir.join("crash.log");
            let _ = std::fs::write(&crash_file, &crash_msg);

            // In dev mode or debug build, show MessageBox on Windows
            #[cfg(target_os = "windows")]
            if is_dev_env() || cfg!(debug_assertions) {
                show_error_message_box(&format!(
                    "redViewer crashed!\n\nCrash report saved to:\n{}\n\n{}",
                    crash_file.display(),
                    panic_info
                ));
            }
        }
    }));

    Ok(())
}

/// Show error message box on Windows
#[cfg(target_os = "windows")]
fn show_error_message_box(msg: &str) {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;

    unsafe extern "system" {
        fn MessageBoxW(hwnd: *mut std::ffi::c_void, text: *const u16, caption: *const u16, utype: u32) -> i32;
    }

    let wide_msg: Vec<u16> = OsStr::new(msg).encode_wide().chain(once(0)).collect();
    let wide_title: Vec<u16> = OsStr::new("redViewer Error").encode_wide().chain(once(0)).collect();

    const MB_OK: u32 = 0x00000000;
    const MB_ICONERROR: u32 = 0x00000010;
    unsafe {
        MessageBoxW(null_mut(), wide_msg.as_ptr(), wide_title.as_ptr(), MB_OK | MB_ICONERROR);
    }
}

/// Fatal error handler - logs error and shows message box in dev mode
fn fatal_error(msg: &str, err: &dyn std::fmt::Display) -> ! {
    let full_msg = format!("{}: {:#}", msg, err);
    eprintln!("{}", full_msg);
    tracing::error!("{}", full_msg);

    #[cfg(target_os = "windows")]
    if is_dev_env() || cfg!(debug_assertions) {
        show_error_message_box(&full_msg);
    }

    std::process::exit(1);
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

            // Resolve uv binary path
            let uv = match resolve_uv() {
                Ok(uv) => uv,
                Err(e) => {
                    tracing::error!("Failed to resolve uv: {}", e);
                    return Err(e.into());
                }
            };

            let uv_paths = UvPaths {
                uv,
                pyproject_dir: paths.runtime_dir.join("src"),
            };

            // Create and start Python manager
            let pm = PythonManager::new(
                paths.clone(),
                uv_paths,
                python::BackendConfig::default(),
            );

            tracing::info!("Starting Python backend...");
            if let Err(e) = pm.start() {
                tracing::error!("Failed to start backend: {}", e);
                return Err(e.into());
            }

            // Wait for backend to be ready
            tracing::info!("Waiting for backend to be ready...");
            if let Err(e) = pm.wait_until_healthy(std::time::Duration::from_secs(30)) {
                tracing::error!("Backend health check failed: {}", e);
                return Err(e.into());
            }

            tracing::info!("Backend is ready at {}", pm.backend_url());

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

            // Start embedded web server
            tracing::info!("Starting embedded web server on http://0.0.0.0:8080...");
            let ws = match WebServer::start(WebServerConfig {
                backend_base: pm.backend_url(),
                ..Default::default()
            }) {
                Ok(ws) => ws,
                Err(e) => {
                    tracing::error!("Failed to start embedded web server: {}", e);
                    return Err(e.into());
                }
            };
            tracing::info!("Embedded web server ready at {}", ws.url());

            // Store managers in app state
            app.manage(ws);
            app.manage(pm);

            // Build system tray (unless disabled)
            if !args.no_tray {
                let _tray = tray::build_tray(&app.handle())?;
            }

            // Create and show main window
            if let Err(e) = guide::create_main_win(&app.handle()) {
                tracing::warn!("Failed to create main window: {}", e);
                // Non-fatal: continue without main window
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            guide::guide_cancel_auto_close,
            guide::guide_open_browser,
            guide::guide_close,
            get_system_theme,
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
    let uv = match resolve_uv() {
        Ok(uv) => uv,
        Err(e) => fatal_error("Failed to resolve uv", &e),
    };

    let uv_paths = UvPaths {
        uv,
        pyproject_dir: paths.runtime_dir.join("src"),
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
