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
/// In production:
/// - Windows: uv.exe next to the executable
/// - macOS: uv in Contents/Resources (same as other bundled resources)
/// - Linux: uv next to the executable
pub fn resolve_uv() -> anyhow::Result<PathBuf> {
    #[cfg(debug_assertions)]
    if std::env::var("DEV_ENV").is_ok() {
        #[cfg(target_os = "windows")]
        return Ok(PathBuf::from("uv.exe"));
        #[cfg(not(target_os = "windows"))]
        return Ok(PathBuf::from("uv"));
    }

    let exe_dir = std::env::current_exe()
        .context("get exe path")?
        .parent()
        .ok_or_else(|| anyhow::anyhow!("cannot get exe dir"))?
        .to_path_buf();

    #[cfg(target_os = "windows")]
    return Ok(exe_dir.join("uv.exe"));

    #[cfg(target_os = "macos")]
    {
        // On macOS, uv is bundled in Contents/Resources alongside other resources
        let uv_path = exe_dir
            .parent() // Contents
            .map(|p| p.join("Resources").join("uv"))
            .ok_or_else(|| anyhow::anyhow!("cannot resolve macOS resources path"))?;
        return Ok(uv_path);
    }

    #[cfg(target_os = "linux")]
    return Ok(exe_dir.join("uv"));
}

/// Resolve uv paths for backend execution.
///
/// Platform strategy:
/// - Windows: pyproject_dir = $INSTDIR/res/src (same directory as uv.exe)
/// - macOS/Linux: pyproject_dir = $DATA_LOCAL_DIR/redViewer/backend
/// - Debug with DEV_ENV: uses RV_PYPROJECT_DIR env var if set
pub fn resolve_uv_paths(_paths: &AppPaths) -> anyhow::Result<UvPaths> {
    let uv = resolve_uv()?;

    #[cfg(debug_assertions)]
    if std::env::var("DEV_ENV").is_ok() {
        if let Ok(dir) = std::env::var("RV_PYPROJECT_DIR") {
            let pyproject_dir = PathBuf::from(dir);
            tracing::info!("Using uv at: {}", uv.display());
            tracing::info!("Project dir (DEV): {}", pyproject_dir.display());
            return Ok(UvPaths { uv, pyproject_dir });
        }
    }

    let pyproject_dir = resolve_pyproject_dir()?;

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

/// Resolve pyproject directory based on platform
fn resolve_pyproject_dir() -> anyhow::Result<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        resolve_install_src_dir()
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let base = dirs::data_local_dir().context("failed to resolve data_local_dir")?;
        Ok(base.join("redViewer").join("backend"))
    }
}

/// Resolve the src directory in the installation folder ($INSTDIR/res/src)
pub fn resolve_install_src_dir() -> anyhow::Result<PathBuf> {
    let exe_dir = std::env::current_exe()
        .context("get exe path")?
        .parent()
        .ok_or_else(|| anyhow::anyhow!("cannot get exe dir"))?
        .to_path_buf();

    Ok(exe_dir.join("res").join("src"))
}
