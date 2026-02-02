//! Toast window management for redViewer
//!
//! Provides a custom toast notification window that appears at the bottom-right
//! of the screen when the main window is minimized to tray.

use anyhow::Context;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::time::{sleep, Duration};

pub const TOAST_WIN_LABEL: &str = "toast";

const TOAST_WIDTH: f64 = 200.0;
const TOAST_HEIGHT: f64 = 40.0;
const TOAST_MARGIN: f64 = 16.0;
const TOAST_DURATION_MS: u64 = 1500;
const ANIMATION_BUFFER_MS: u64 = 500;

/// Toast state for debouncing rapid show calls
pub struct ToastState {
    generation: AtomicU64,
}

impl ToastState {
    pub fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
        }
    }

    /// Increment generation counter and return new value
    pub fn next_generation(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Get current generation
    pub fn current(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }
}

impl Default for ToastState {
    fn default() -> Self {
        Self::new()
    }
}

/// Create the toast window (hidden by default)
pub fn create_toast_win(app: &AppHandle) -> tauri::Result<()> {
    app.manage(ToastState::new());

    let _window = WebviewWindowBuilder::new(
        app,
        TOAST_WIN_LABEL,
        WebviewUrl::App("toast.html".into()),
    )
    .title("Toast")
    .inner_size(TOAST_WIDTH, TOAST_HEIGHT)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()?;

    tracing::info!("Toast window created");
    Ok(())
}

/// Calculate toast position based on main window's monitor
fn calculate_toast_position(
    main_win: &WebviewWindow,
    app: &AppHandle,
) -> tauri::Result<tauri::PhysicalPosition<i32>> {
    // Get the monitor where the main window is located
    let monitor = main_win
        .current_monitor()?
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| tauri::Error::FailedToReceiveMessage)?;

    let scale_factor = monitor.scale_factor();
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();

    // Calculate bottom-right position with margin (scaled for DPI)
    let margin_scaled = (TOAST_MARGIN * scale_factor) as i32;
    let x = monitor_pos.x
        + monitor_size.width as i32
        - (TOAST_WIDTH * scale_factor) as i32
        - margin_scaled;
    let y = monitor_pos.y
        + monitor_size.height as i32
        - (TOAST_HEIGHT * scale_factor) as i32
        - margin_scaled;

    Ok(tauri::PhysicalPosition { x, y })
}

/// Show toast notification with message
#[tauri::command]
pub async fn show_toast(
    app: AppHandle,
    message: String,
) -> Result<(), String> {
    show_toast_inner(&app, &message).map_err(|e| format!("{:#}", e))
}

fn show_toast_inner(app: &AppHandle, message: &str) -> anyhow::Result<()> {
    let toast_win = app
        .get_webview_window(TOAST_WIN_LABEL)
        .ok_or_else(|| anyhow::anyhow!("Toast window not found"))?;

    // Get main window for position calculation
    let main_win = app
        .get_webview_window(super::main_window::MAIN_WIN_LABEL)
        .ok_or_else(|| anyhow::anyhow!("Main window not found"))?;

    // Increment generation for debouncing
    let state = app
        .try_state::<ToastState>()
        .ok_or_else(|| anyhow::anyhow!("ToastState not found"))?;
    let current_generation = state.next_generation();

    // Calculate and set position
    let position = calculate_toast_position(&main_win, app)
        .context("calculate toast position")?;
    toast_win
        .set_position(tauri::Position::Physical(position))
        .context("set toast position")?;

    // Emit event to toast window frontend
    let payload = serde_json::json!({ "message": message });
    toast_win
        .emit("toast-show", payload)
        .context("emit toast-show event")?;

    // Show toast without stealing focus
    toast_win.show().context("show toast window")?;
    toast_win.set_always_on_top(true).context("set toast always on top")?;

    // Hide after duration (with debounce check)
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(TOAST_DURATION_MS + ANIMATION_BUFFER_MS)).await;
        // Only hide if this is still the latest generation
        if let Some(state) = app_clone.try_state::<ToastState>() {
            if state.current() == current_generation {
                if let Some(win) = app_clone.get_webview_window(TOAST_WIN_LABEL) {
                    let _ = win.hide();
                }
            }
        }
    });

    tracing::info!("Toast shown: {}", message);
    Ok(())
}
