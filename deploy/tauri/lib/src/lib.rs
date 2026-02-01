//! Shared library for redViewer desktop application
//!
//! Provides common functionality used by both src-tauri (main application)
//! and installer (installer utility).

pub mod config;
pub mod paths;
pub mod python;

pub use config::{
    AppPaths,
    AppConfig,
    resolve_paths,
    ensure_dirs,
    init_logging,
    load_app_config,
    save_app_config,
    open_in_file_manager,
};

pub use paths::{
    UvPaths,
    resolve_uv,
    resolve_uv_paths,
    resolve_install_src_dir,
};

pub use python::{
    BackendConfig,
    PythonManager,
};
