//! System tray management for redViewer

use anyhow::Context;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_opener::OpenerExt;

use crate::i18n;
use crate::main_window;
use crate::python::PythonManager;
use crate::webserver::WebServer;
use rv_lib::open_in_file_manager;

// Menu item identifiers
pub const MENU_OPEN: &str = "open";
pub const MENU_LOGS: &str = "logs";
pub const MENU_RESTART: &str = "restart";
pub const MENU_QUIT: &str = "quit";

/// Build the system tray with menu
pub fn build_tray(app: &tauri::AppHandle) -> tauri::Result<TrayIcon> {
    let open = MenuItem::with_id(app, MENU_OPEN, i18n::get_i18n_text("tray_open"), true, None::<&str>)?;
    let logs = MenuItem::with_id(app, MENU_LOGS, i18n::get_i18n_text("tray_logs"), true, None::<&str>)?;
    let restart = MenuItem::with_id(app, MENU_RESTART, i18n::get_i18n_text("tray_restart"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, i18n::get_i18n_text("tray_quit"), true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(app, &[&open, &sep1, &restart, &logs, &sep2, &quit])?;
    let app_handle = app.clone();

    let tray = TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .context("default window icon missing")?
                .clone(),
        )
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let pm = app.try_state::<PythonManager>();
            let ws = app.try_state::<WebServer>();
            handle_menu_click(app, ws.as_deref(), pm.as_deref(), event.id().as_ref());
        })
        .on_tray_icon_event(move |_tray, event| {
            handle_tray_event(&app_handle, event);
        })
        .build(app)?;

    Ok(tray)
}

/// Handle system tray events
pub fn handle_tray_event(app: &tauri::AppHandle, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } => {
            main_window::show_main_win(app);
        }
        TrayIconEvent::DoubleClick { .. } => {
            let pm = app.try_state::<PythonManager>();
            let ws = app.try_state::<WebServer>();
            let url = resolve_open_url(ws.as_deref(), pm.as_deref());
            if let Err(e) = app.opener().open_url(&url, None::<&str>) {
                tracing::warn!("User action failed: open browser (url={}): {}", url, e);
            }
        }
        _ => {}
    }
}

/// Resolve the URL to open when user clicks "Open redViewer"
/// Priority: WebServer (8080) > Backend (12345)
pub fn resolve_open_url(ws: Option<&WebServer>, pm: Option<&PythonManager>) -> String {
    if let Some(ws) = ws {
        return ws.url().to_string();
    }
    if let Some(pm) = pm {
        return pm.backend_url();
    }
    "http://localhost:8080/".to_string()
}

fn handle_menu_click(app: &tauri::AppHandle, ws: Option<&WebServer>, pm: Option<&PythonManager>, id: &str) {
    match id {
        MENU_OPEN => {
            let url = resolve_open_url(ws, pm);
            if let Err(e) = app.opener().open_url(&url, None::<&str>) {
                tracing::warn!("User action failed: open browser (url={}): {}", url, e);
            }
        }
        MENU_LOGS => {
            let Some(pm) = pm else {
                tracing::warn!("PythonManager not available");
                return;
            };
            let path = pm.log_dir();
            if let Err(e) = open_in_file_manager(&path) {
                tracing::warn!("User action failed: open logs dir (path={}): {}", path.display(), e);
            }
        }
        MENU_RESTART => {
            let Some(pm) = pm else {
                tracing::warn!("PythonManager not available");
                return;
            };
            tracing::info!("Restarting backend...");
            if let Err(e) = pm.restart() {
                tracing::warn!("User action failed: restart backend: {}", e);
            } else if let Err(e) = pm.wait_until_healthy(std::time::Duration::from_secs(20)) {
                tracing::warn!("Restart completed but health check failed: {}", e);
            } else {
                tracing::info!("Backend restarted successfully");
            }
        }
        MENU_QUIT => {
            tracing::info!("Quitting application...");
            if let Some(ws) = ws {
                if let Err(e) = ws.stop() {
                    tracing::warn!("Best-effort cleanup failed: stop embedded web server: {}", e);
                }
            }
            if let Some(pm) = pm {
                if let Err(e) = pm.stop() {
                    tracing::warn!("Best-effort cleanup failed: stop backend: {}", e);
                }
            }
            // Set quit flag before calling exit to bypass prevent_exit
            crate::request_quit();
            app.exit(0);
        }
        _ => {}
    }
}
