//! Installation logic for installer
//!
//! Handles Python installation, dependency management, and backend source staging.

use anyhow::{anyhow, Context};
use serde::Deserialize;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::process::Command;

use lib::{AppPaths, resolve_uv};

/// PyEnv configuration for mirror settings
#[derive(Debug, Deserialize)]
pub struct PyEnvConfig {
    pub pypi: Option<PyPIConfig>,
    pub python: Option<PythonConfig>,
}

#[derive(Debug, Deserialize)]
pub struct PyPIConfig {
    pub index_url: Option<String>,
    pub extra_index_urls: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct PythonConfig {
    #[serde(alias = "download_mirror")]
    pub install_mirror: Option<String>,
}

/// Run the installation process
pub fn run_install(paths: &AppPaths, pyenv: Option<String>) -> anyhow::Result<()> {
    let uv = resolve_uv()?;

    // Platform-specific pyproject_dir resolution
    #[cfg(target_os = "windows")]
    let pyproject_dir = {
        // Windows: Use $INSTDIR/res/src directly, no staging to Roaming
        let exe_dir = std::env::current_exe()
            .context("get exe path")?
            .parent()
            .ok_or_else(|| anyhow!("cannot get exe dir"))?
            .to_path_buf();
        exe_dir.join("res").join("src")
    };

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let pyproject_dir = {
        // macOS/Linux: Stage backend to $DATA_LOCAL_DIR/redViewer/backend
        let base = dirs::data_local_dir().context("failed to resolve data_local_dir")?;
        let dst = base.join("redViewer").join("backend");

        let exe_dir = std::env::current_exe()
            .context("get exe path")?
            .parent()
            .ok_or_else(|| anyhow!("cannot get exe dir"))?
            .to_path_buf();

        // On macOS, resources are in Contents/Resources, not Contents/MacOS
        #[cfg(target_os = "macos")]
        let src = exe_dir
            .parent() // Contents
            .map(|p| p.join("Resources").join("res").join("src"))
            .ok_or_else(|| anyhow!("cannot resolve macOS resources path"))?;

        #[cfg(target_os = "linux")]
        let src = exe_dir.join("res").join("src");

        if !dst.join("pyproject.toml").exists() {
            tracing::info!("Staging backend source to {}", dst.display());
            std::fs::create_dir_all(&dst).context("create backend dir")?;
            copy_dir_all(&src, &dst).context("stage backend source")?;
        }

        dst
    };

    tracing::info!("Using uv at: {}", uv.display());
    tracing::info!("Project dir: {}", pyproject_dir.display());

    if !pyproject_dir.join("pyproject.toml").exists() {
        return Err(anyhow!(
            "pyproject.toml not found in {}. Ensure res/src is bundled correctly.",
            pyproject_dir.display()
        ));
    }

    // Load PyEnv profile if specified
    let pyenv_config = pyenv
        .as_ref()
        .and_then(|p| load_pyenv_config(paths, p).ok());

    // Install managed Python
    tracing::info!("Installing Python via uv...");
    ensure_managed_python(&uv, &pyproject_dir, pyenv_config.as_ref())?;

    // Sync dependencies (creates .venv in $INSTDIR/res/src)
    tracing::info!("Syncing dependencies via uv...");
    uv_sync(&uv, &pyproject_dir, pyenv_config.as_ref())?;

    // Create default config if needed
    ensure_default_config(paths)?;

    tracing::info!("Installation completed successfully");
    Ok(())
}

/// Update backend code only (without reinstalling Python/deps)
pub fn update_backend(paths: &AppPaths) -> anyhow::Result<()> {
    tracing::info!("Updating backend code...");

    // Find bundled backend source
    let exe_dir = std::env::current_exe()
        .context("get exe path")?
        .parent()
        .ok_or_else(|| anyhow!("cannot get exe dir"))?
        .to_path_buf();

    let src_in_resources = exe_dir.join("res").join("src");
    let dst = paths.runtime_dir.join("src");

    if !src_in_resources.exists() {
        return Err(anyhow!(
            "Backend source not found in bundled resources: {}",
            src_in_resources.display()
        ));
    }

    // Remove old source and copy new
    if dst.exists() {
        std::fs::remove_dir_all(&dst).context("remove old backend source")?;
    }
    std::fs::create_dir_all(&dst).context("create runtime src dir")?;
    copy_dir_all(&src_in_resources, &dst).context("copy backend source")?;

    tracing::info!("Backend code updated successfully");
    Ok(())
}

/// Stage backend source code from bundled resources to runtime directory
fn stage_backend_source(paths: &AppPaths) -> anyhow::Result<()> {
    let dst = paths.runtime_dir.join("src");

    // If destination already exists and has pyproject.toml, skip staging
    if dst.join("pyproject.toml").exists() {
        tracing::info!("Backend source already staged at {}", dst.display());
        return Ok(());
    }

    // Find bundled backend source
    let exe_dir = std::env::current_exe()
        .context("get exe path")?
        .parent()
        .ok_or_else(|| anyhow!("cannot get exe dir"))?
        .to_path_buf();

    let src_in_resources = exe_dir.join("res").join("src");

    if !src_in_resources.exists() {
        // Debug builds commonly run from the repo
        if cfg!(debug_assertions) {
            tracing::debug!(
                "Backend source not found in resources ({}); debug build will rely on repo sources",
                src_in_resources.display()
            );
            return Ok(());
        }

        return Err(anyhow!(
            "Backend source not found in bundled resources: {}. Rebuild installer resources.",
            src_in_resources.display()
        ));
    }

    tracing::info!("Staging backend source from resources...");
    std::fs::create_dir_all(&dst).context("create runtime src dir")?;
    copy_dir_all(&src_in_resources, &dst).context("stage backend source")?;

    tracing::info!("Backend source staged successfully");
    Ok(())
}

/// Load PyEnv configuration from file
fn load_pyenv_config(_paths: &AppPaths, profile: &str) -> anyhow::Result<PyEnvConfig> {
    // Security: Whitelist allowed profile names to prevent path traversal
    const ALLOWED_PROFILES: &[&str] = &["cn.toml", "global.toml", "custom.toml"];

    // Check if profile is a simple filename (no path separators)
    if profile.contains('/') || profile.contains('\\') || profile.contains("..") {
        return Err(anyhow!(
            "Invalid PyEnv profile name '{}': path separators and '..' are not allowed",
            profile
        ));
    }

    // Ensure profile ends with .toml extension
    if !profile.ends_with(".toml") {
        return Err(anyhow!(
            "Invalid PyEnv profile name '{}': must end with .toml",
            profile
        ));
    }

    // Verify against whitelist
    if !ALLOWED_PROFILES.contains(&profile) {
        return Err(anyhow!(
            "Unknown PyEnv profile '{}'. Allowed profiles: {}",
            profile,
            ALLOWED_PROFILES.join(", ")
        ));
    }

    // Find profile in bundled resources
    // Try both res/conf/ and res/ paths for compatibility
    let exe_dir = std::env::current_exe()
        .context("get exe path")?
        .parent()
        .ok_or_else(|| anyhow!("cannot get exe dir"))?
        .to_path_buf();

    // Try res/conf/<profile> first (new layout)
    let p = exe_dir.join("res").join("conf").join(profile);
    if p.exists() {
        let content = std::fs::read_to_string(&p).context("read pyenv profile")?;
        return toml::from_str(&content).context("parse pyenv profile");
    }

    // Fallback to res/<profile> (legacy layout)
    let p = exe_dir.join("res").join(profile);
    if p.exists() {
        let content = std::fs::read_to_string(&p).context("read pyenv profile")?;
        return toml::from_str(&content).context("parse pyenv profile");
    }

    Err(anyhow!("PyEnv profile not found: {}", profile))
}

/// Install managed Python using uv
fn ensure_managed_python(uv: &Path, pyproject_dir: &Path, pyenv_config: Option<&PyEnvConfig>) -> anyhow::Result<()> {
    let mut cmd = Command::new(uv);
    cmd.current_dir(pyproject_dir)
        .args(["python", "install", "3.12"]);

    // Apply python-build-standalone mirror if configured
    if let Some(config) = pyenv_config {
        if let Some(ref python) = config.python {
            if let Some(ref mirror) = python.install_mirror {
                cmd.arg("--mirror").arg(mirror);
            }
        }
    }

    let status = cmd.status().context("uv python install")?;
    if !status.success() {
        return Err(anyhow!("uv python install failed"));
    }
    Ok(())
}

/// Sync project dependencies using uv
fn uv_sync(uv: &Path, pyproject_dir: &Path, pyenv_config: Option<&PyEnvConfig>) -> anyhow::Result<()> {
    let mut cmd = Command::new(uv);
    cmd.current_dir(pyproject_dir).arg("sync");

    // Apply PyPI mirrors if configured
    if let Some(config) = pyenv_config {
        if let Some(ref pypi) = config.pypi {
            if let Some(ref index_url) = pypi.index_url {
                cmd.arg("--index-url").arg(index_url);
            }
            if let Some(ref extra_urls) = pypi.extra_index_urls {
                for url in extra_urls {
                    cmd.arg("--extra-index-url").arg(url);
                }
            }
        }
    }

    let status = cmd.status().context("uv sync")?;
    if !status.success() {
        return Err(anyhow!("uv sync failed"));
    }
    Ok(())
}

/// Create default configuration file if it doesn't exist
fn ensure_default_config(paths: &AppPaths) -> anyhow::Result<()> {
    if paths.config_file.exists() {
        return Ok(());
    }

    let mut f = File::create(&paths.config_file).context("create conf.yml")?;
    f.write_all(
        b"# redViewer Configuration\n\
          # See: https://github.com/jasoneri/redViewer\n\n\
          path: \"\"\n\
          # kemono_path: \"\"\n\
          # storage_backend: local\n",
    )
    .context("write conf.yml")?;

    tracing::info!("Created default config at: {}", paths.config_file.display());
    Ok(())
}

/// Recursively copy a directory
fn copy_dir_all(src: &Path, dst: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(dst).context("mkdir dst")?;

    for entry in std::fs::read_dir(src).context("read_dir src")? {
        let entry = entry.context("dir entry")?;
        let ty = entry.file_type().context("file_type")?;
        let from = entry.path();
        let to = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else if ty.is_file() {
            std::fs::copy(&from, &to)
                .with_context(|| format!("copy {} -> {}", from.display(), to.display()))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_pyenv_config_rejects_path_traversal() {
        let paths = AppPaths {
            config_dir: std::env::temp_dir(),
            config_file: std::env::temp_dir().join("conf.yml"),
            log_dir: std::env::temp_dir().join("logs"),
            runtime_dir: std::env::temp_dir().join("runtime"),
            app_settings_file: std::env::temp_dir().join("app-settings.json"),
        };

        let err = load_pyenv_config(&paths, "../evil.toml").unwrap_err();
        assert!(err.to_string().contains("path separators"));

        let err = load_pyenv_config(&paths, "unknown.toml").unwrap_err();
        assert!(err.to_string().contains("Unknown PyEnv profile"));
    }
}
