//! Path resolution utilities
//!
//! Shared between src-tauri and installer to ensure consistent path resolution.

use anyhow::Context;
use std::path::PathBuf;

use crate::config::AppPaths;

/// Paths related to uv and the project
#[derive(Debug, Clone)]
pub struct UvPaths {
    /// Path to uv executable
    pub uv: PathBuf,
    /// Path to directory containing pyproject.toml
    pub pyproject_dir: PathBuf,
}

/// Resolve uv executable path.
///
/// In debug builds with DEV_ENV set, uses uv from PATH.
/// In production, uses uv.exe from the same directory as the executable.
pub fn resolve_uv() -> anyhow::Result<PathBuf> {
    // DEV_ENV check only applies to debug builds
    #[cfg(debug_assertions)]
    if std::env::var("DEV_ENV").is_ok() {
        return Ok(PathBuf::from("uv.exe"));
    }

    let exe_dir = std::env::current_exe()
        .context("get exe path")?
        .parent()
        .ok_or_else(|| anyhow::anyhow!("cannot get exe dir"))?
        .to_path_buf();

    Ok(exe_dir.join("uv.exe"))
}

/// Resolve uv paths for backend execution.
///
/// Returns the uv executable path and the directory containing pyproject.toml.
pub fn resolve_uv_paths(paths: &AppPaths) -> anyhow::Result<UvPaths> {
    let uv = resolve_uv()?;
    let pyproject_dir = paths.runtime_dir.join("src");

    if !pyproject_dir.join("pyproject.toml").exists() {
        return Err(anyhow::anyhow!(
            "pyproject.toml not found in {}",
            pyproject_dir.display()
        ));
    }

    tracing::info!("Using uv at: {}", uv.display());
    tracing::info!("Project dir: {}", pyproject_dir.display());

    Ok(UvPaths { uv, pyproject_dir })
}
