//! Main window management for redViewer
//!
//! Manages the desktop main window with i18n support.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, Emitter};
use tauri_plugin_opener::OpenerExt;
use tokio::time::{sleep, Duration};

use crate::python::PythonManager;
use crate::tray::resolve_open_url;
use crate::webserver::WebServer;

// i18n translations embedded at compile time
const I18N_ZH_CN: &str = include_str!("../i18n/zh-CN.json");
const I18N_EN_US: &str = include_str!("../i18n/en-US.json");

/// Main window label (Tauri embedded window)
pub const MAIN_WIN_LABEL: &str = "main";

/// Tracks whether the window has been hidden to tray at least once
pub struct MainWindowState {
    has_hidden_once: AtomicBool,
}

impl MainWindowState {
    pub fn new() -> Self {
        Self {
            has_hidden_once: AtomicBool::new(false),
        }
    }

    /// Mark that window has been hidden at least once, returns true if this was the first time
    pub fn mark_hidden(&self) -> bool {
        !self.has_hidden_once.swap(true, Ordering::SeqCst)
    }
}

impl Default for MainWindowState {
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

/// Get translated text by key based on system locale
fn get_i18n_text(key: &str) -> String {
    let locale = get_system_locale();
    let json_str = match locale.as_str() {
        l if l.starts_with("zh") => I18N_ZH_CN,
        _ => I18N_EN_US,
    };
    
    // Parse JSON and get the value
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
        if let Some(text) = json.get(key).and_then(|v| v.as_str()) {
            return text.to_string();
        }
    }
    
    // Fallback to key name
    key.to_string()
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
    // Manage window state only on first creation (safe for re-creation via show_main_win)
    if app.try_state::<MainWindowState>().is_none() {
        app.manage(MainWindowState::new());
    }

    // Build initialization script with i18n
    let i18n_script = get_i18n_script();

    // Create the main window
    let window = WebviewWindowBuilder::new(
        app,
        MAIN_WIN_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("redViewer")
    .inner_size(450.0, 300.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .center()
    .visible(false) // Start hidden, show after ready
    .initialization_script(&i18n_script)
    .build()?;

    // Intercept OS close button (X): hide to tray instead of destroying the window.
    // Without this, the window is destroyed on close and show_main_win() cannot bring it back.
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let app = app_for_close.clone();
            tauri::async_runtime::spawn(async move {
                let is_first_hide = app
                    .try_state::<MainWindowState>()
                    .map(|s| s.mark_hidden())
                    .unwrap_or(false);

                if is_first_hide {
                    let message = get_i18n_text("hiden_to_tray");
                    match crate::toast::show_toast(app.clone(), message).await {
                        Ok(_) => tracing::info!("Toast notification sent"),
                        Err(e) => tracing::warn!("Toast notification failed: {}", e),
                    }
                    tracing::info!("Main window hidden to tray (first time, via OS close)");
                }

                hide_main_win(&app);
            });
        }
    });

    // Show window after a brief delay to ensure it's loaded
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(100)).await;
        if let Some(win) = app_handle.get_webview_window(MAIN_WIN_LABEL) {
            let _ = win.show();
            tracing::info!("Main window shown");
        }
    });

    tracing::info!("Main window created");
    Ok(())
}

/// Show the main window (e.g., from tray menu)
pub fn show_main_win(app: &tauri::AppHandle) {
    tracing::info!("show_main_win called");

    if let Some(window) = app.get_webview_window(MAIN_WIN_LABEL) {
        // Emit show event to reset frontend state
        let _ = window.emit("main-window-show", ());
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        // Fallback: window was destroyed unexpectedly; recreate it.
        // Normally the CloseRequested handler prevents this, but guard against edge cases.
        tracing::warn!("Main window not found, recreating...");
        if let Err(e) = create_main_win(app) {
            tracing::error!("Failed to recreate main window: {}", e);
        }
    }
}

/// Hide the main window
pub fn hide_main_win(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WIN_LABEL) {
        let _ = window.hide();
    }
}

// ============== Tauri Commands ==============

/// Open the browser and close the main window
#[tauri::command]
pub fn main_window_open_browser(app: tauri::AppHandle) -> Result<(), String> {
    let ws = app.try_state::<WebServer>();
    let pm = app.try_state::<PythonManager>();
    let url = resolve_open_url(ws.as_deref(), pm.as_deref());

    tracing::info!("Main window: opening browser at {}", url);

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Hide window after opening browser
    hide_main_win(&app);

    Ok(())
}

/// Close/hide the main window (called from frontend)
#[tauri::command]
pub async fn main_window_close(app: tauri::AppHandle) {
    // Check if this is the first hide
    let is_first_hide = app
        .try_state::<MainWindowState>()
        .map(|s| s.mark_hidden())
        .unwrap_or(false);

    if is_first_hide {
        let message = get_i18n_text("hiden_to_tray");

        match crate::toast::show_toast(app.clone(), message).await {
            Ok(_) => tracing::info!("Toast notification sent"),
            Err(e) => tracing::warn!("Toast notification failed: {}", e),
        }
        tracing::info!("Main window hidden to tray (first time)");
    }

    hide_main_win(&app);
}
