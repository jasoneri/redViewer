//! Shared library for redViewer desktop application
//!
//! Provides common functionality used by both src-tauri (main application)
//! and installer (installer utility).

pub mod config;
pub mod downloader;
pub mod paths;
pub mod python;

pub use config::{
    AppPaths,
    AppConfig,
    ResultExt,
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
    is_uv_ready,
};

pub use python::{
    BackendConfig,
    PythonManager,
};

pub use downloader::{
    UvMirror,
    UvDownloadConfig,
    DownloadProgress,
    download_uv,
    resolve_asset_name,
    resolve_download_url,
    parse_uv_config,
    load_uv_config_from_resource,
};
