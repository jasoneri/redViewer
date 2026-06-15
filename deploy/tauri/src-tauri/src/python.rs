//! Python process management for src-tauri
//!
//! Re-exports lib::PythonManager with additional Tauri-specific functionality.

pub use rv_lib::{
    BackendConfig, DesktopAdminSecretResponse, DesktopAdminState, DesktopLocksState,
    DesktopLocksUpdate, PythonManager,
};
