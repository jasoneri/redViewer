//! Guide window management for redViewer
//!
//! Manages the startup guide window with auto-close functionality
//! and i18n support.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, Emitter};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Notify;
use tokio::time::{sleep, Duration};

use crate::python::PythonManager;
use crate::tray::resolve_open_url;
use crate::webserver::WebServer;

// i18n translations embedded at compile time
const I18N_ZH_CN: &str = include_str!("../i18n/guide_zh-CN.json");
const I18N_EN_US: &str = include_str!("../i18n/guide_en-US.json");

/// Main window label (Tauri embedded window)
pub const MAIN_WIN_LABEL: &str = "guide";

/// Auto-close timeout in seconds
const AUTO_CLOSE_TIMEOUT_SECS: u64 = 4;

/// Guide window controller
pub struct GuideController {
    /// Flag to indicate if auto-close has been cancelled
    cancelled: AtomicBool,
    /// Notify to cancel the timer
    cancel_notify: Arc<Notify>,
}

impl GuideController {
    pub fn new() -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            cancel_notify: Arc::new(Notify::new()),
        }
    }

    /// Cancel the auto-close timer, entering PERSISTENT mode
    pub fn cancel_auto_close(&self) {
        if !self.cancelled.swap(true, Ordering::SeqCst) {
            tracing::info!("Guide: auto-close cancelled, entering PERSISTENT mode");
            self.cancel_notify.notify_one();
        }
    }

    /// Check if auto-close has been cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Get a clone of the cancel notify handle
    pub fn get_cancel_notify(&self) -> Arc<Notify> {
        self.cancel_notify.clone()
    }
}

impl Default for GuideController {
    fn default() -> Self {
        Self::new()
    }
}

/// Get i18n injection script based on system locale
fn get_i18n_script() -> String {
    let locale = get_system_locale();
    let json = match locale.as_str() {
        l if l.starts_with("zh") => I18N_ZH_CN,
        _ => I18N_EN_US,
    };
    format!(r#"window.__TRANSLATIONS__ = {};"#, json)
}

/// Detect system locale
fn get_system_locale() -> String {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsString;
        use std::os::windows::ffi::OsStringExt;

        unsafe extern "system" {
            fn GetUserDefaultLocaleName(lpLocaleName: *mut u16, cchLocaleName: i32) -> i32;
        }

        let mut buf = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH
        let len = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
        if len > 0 {
            let os_string = OsString::from_wide(&buf[..len as usize - 1]);
            return os_string.to_string_lossy().to_string();
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("defaults")
            .args(["read", "-g", "AppleLocale"])
            .output()
        {
            if output.status.success() {
                let locale = String::from_utf8_lossy(&output.stdout);
                return locale.trim().replace('_', "-");
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(lang) = std::env::var("LANG") {
            let locale = lang.split('.').next().unwrap_or("en-US");
            return locale.replace('_', "-");
        }
    }

    "en-US".to_string()
}

/// Create and show the main window
pub fn create_main_win(app: &tauri::AppHandle) -> tauri::Result<()> {
    // Create the guide controller
    let controller = GuideController::new();
    let cancel_notify = controller.get_cancel_notify();
    app.manage(controller);

    // Build initialization script with i18n
    let i18n_script = get_i18n_script();

    // Create the guide window
    let _window = WebviewWindowBuilder::new(
        app,
        MAIN_WIN_LABEL,
        WebviewUrl::App("mainWin/index.html".into()),
    )
    .title("redViewer Guide")
    .inner_size(400.0, 240.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .center()
    .visible(false) // Start hidden, show after ready
    .skip_taskbar(true)
    .initialization_script(&i18n_script)
    .build()?;

    // Show window after a brief delay to ensure it's loaded
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(100)).await;
        if let Some(win) = app_handle.get_webview_window(MAIN_WIN_LABEL) {
            let _ = win.show();
            tracing::info!("Guide window shown");
        }

        // Start the auto-close timer
        start_auto_close_timer(app_handle, cancel_notify).await;
    });

    tracing::info!("Guide window created");
    Ok(())
}

/// Start the auto-close timer
async fn start_auto_close_timer(app: tauri::AppHandle, cancel_notify: Arc<Notify>) {
    let timeout = Duration::from_secs(AUTO_CLOSE_TIMEOUT_SECS);

    tokio::select! {
        _ = sleep(timeout) => {
            // Timer expired, trigger close
            let controller = app.try_state::<GuideController>();
            if controller.map(|c| !c.is_cancelled()).unwrap_or(false) {
                tracing::info!("Guide: auto-close timer expired");
                trigger_guide_close(&app);
            }
        }
        _ = cancel_notify.notified() => {
            // Timer was cancelled
            tracing::info!("Guide: auto-close timer cancelled");
        }
    }
}

/// Trigger the guide window close animation
fn trigger_guide_close(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WIN_LABEL) {
        // Emit event to frontend to trigger close animation
        let _ = window.emit("guide-close", ());

        // Hide window after animation completes
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            sleep(Duration::from_millis(250)).await; // 200ms animation + 50ms buffer
            if let Some(win) = app_clone.get_webview_window(MAIN_WIN_LABEL) {
                let _ = win.hide();
                tracing::info!("Guide window hidden");
            }
        });
    }
}

/// Show the main window (e.g., from tray menu)
pub fn show_main_win(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WIN_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Hide the main window
pub fn hide_main_win(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WIN_LABEL) {
        let _ = window.hide();
    }
}

// ============== Tauri Commands ==============

/// Cancel auto-close, entering PERSISTENT mode
#[tauri::command]
pub fn guide_cancel_auto_close(app: tauri::AppHandle) {
    if let Some(controller) = app.try_state::<GuideController>() {
        controller.cancel_auto_close();
    }
}

/// Open the browser and close the guide window
#[tauri::command]
pub fn guide_open_browser(app: tauri::AppHandle) -> Result<(), String> {
    let ws = app.try_state::<WebServer>();
    let pm = app.try_state::<PythonManager>();
    let url = resolve_open_url(ws.as_deref(), pm.as_deref());

    tracing::info!("Guide: opening browser at {}", url);

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Trigger close after successful open
    trigger_guide_close(&app);

    Ok(())
}

/// Close the guide window (called after animation completes)
#[tauri::command]
pub fn guide_close(app: tauri::AppHandle) {
    hide_main_win(&app);
}
