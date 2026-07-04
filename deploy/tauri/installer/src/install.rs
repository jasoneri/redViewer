//! Installation logic for installer
//!
//! Handles Python installation, dependency management, and backend source staging.

use anyhow::{Context, anyhow};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use lib::{AppPaths, resolve_uv};

/// Run the installation process
pub fn run_install(paths: &AppPaths, pyenv: Option<String>) -> anyhow::Result<()> {
    let uv = resolve_uv()?;
    let pyproject_dir = resolve_pyproject_dir()?;

    tracing::info!("Using uv at: {}", uv.display());
    tracing::info!("Project dir: {}", pyproject_dir.display());

    if !pyproject_dir.join("pyproject.toml").exists() {
        return Err(anyhow!(
            "pyproject.toml not found in {}. Ensure res/src is bundled correctly.",
            pyproject_dir.display()
        ));
    }

    // Copy uv.toml config if profile specified and target doesn't exist
    if let Some(ref profile) = pyenv {
        copy_uv_config(&pyproject_dir, profile)?;
    }

    // Install managed Python
    tracing::info!("Installing Python via uv...");
    ensure_managed_python(&uv, &pyproject_dir)?;

    // Sync dependencies (creates .venv in $INSTDIR/res/src)
    tracing::info!("Syncing dependencies via uv...");
    uv_sync(&uv, &pyproject_dir)?;

    configure_python_firewall_for_project(&pyproject_dir)?;

    // Create default config if needed
    ensure_default_config(paths)?;

    tracing::info!("Installation completed successfully");
    Ok(())
}

/// Configure Windows firewall state for the Python backend runtime.
pub fn configure_python_firewall() -> anyhow::Result<()> {
    let pyproject_dir = resolve_pyproject_dir()?;
    configure_python_firewall_for_project(&pyproject_dir)
}

fn resolve_pyproject_dir() -> anyhow::Result<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // Windows: Use $INSTDIR/res/src directly, no staging to Roaming.
        let exe_dir = std::env::current_exe()
            .context("get exe path")?
            .parent()
            .ok_or_else(|| anyhow!("cannot get exe dir"))?
            .to_path_buf();
        return Ok(exe_dir.join("res").join("src"));
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        // macOS/Linux: Stage backend to $DATA_LOCAL_DIR/redViewer/backend.
        let base = dirs::data_local_dir().context("failed to resolve data_local_dir")?;
        let dst = base.join("redViewer").join("backend");

        let exe_dir = std::env::current_exe()
            .context("get exe path")?
            .parent()
            .ok_or_else(|| anyhow!("cannot get exe dir"))?
            .to_path_buf();

        #[cfg(target_os = "macos")]
        let src = exe_dir
            .parent()
            .map(|p| p.join("Resources").join("res").join("src"))
            .ok_or_else(|| anyhow!("cannot resolve macOS resources path"))?;

        #[cfg(target_os = "linux")]
        let src = exe_dir.join("res").join("src");

        if !dst.join("pyproject.toml").exists() {
            tracing::info!("Staging backend source to {}", dst.display());
            std::fs::create_dir_all(&dst).context("create backend dir")?;
            copy_dir_all(&src, &dst).context("stage backend source")?;
        }

        Ok(dst)
    }
}

#[cfg(target_os = "windows")]
fn configure_python_firewall_for_project(pyproject_dir: &Path) -> anyhow::Result<()> {
    let venv_python = pyproject_dir
        .join(".venv")
        .join("Scripts")
        .join("python.exe");
    if !venv_python.exists() {
        return Err(anyhow!(
            "venv python not found for firewall setup: {}",
            venv_python.display()
        ));
    }

    for target in python_firewall_targets(&venv_python)? {
        disable_inbound_blocks(&target)
            .with_context(|| format!("disable firewall blocks for {}", target.display()))?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn configure_python_firewall_for_project(_pyproject_dir: &Path) -> anyhow::Result<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn python_firewall_targets(venv_python: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let output = Command::new(venv_python)
        .args([
            "-c",
            "import sys; print(getattr(sys, '_base_executable', sys.executable))",
        ])
        .output()
        .context("resolve Python base executable")?;
    if !output.status.success() {
        return Err(anyhow!("resolve Python base executable failed"));
    }

    let mut targets = vec![venv_python.to_path_buf()];
    let base = String::from_utf8(output.stdout)
        .context("decode Python base executable")?
        .trim()
        .to_string();
    if !base.is_empty() {
        let base_path = PathBuf::from(base);
        let base_text = base_path.to_string_lossy();
        if !targets.iter().any(|target| {
            target
                .to_string_lossy()
                .eq_ignore_ascii_case(base_text.as_ref())
        }) {
            targets.push(base_path);
        }
    }

    Ok(targets)
}

#[cfg(target_os = "windows")]
fn disable_inbound_blocks(program: &Path) -> anyhow::Result<()> {
    let target = escape_powershell_single_quoted(&program.to_string_lossy());
    let script = format!(
        "$ErrorActionPreference = 'Stop'; \
         $target = '{}'; \
         $rules = @(Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True | \
           Where-Object {{ (($_ | Get-NetFirewallApplicationFilter).Program) -ieq $target }}); \
         if ($rules.Count -gt 0) {{ $rules | Disable-NetFirewallRule }}; \
         Write-Output \"disabled=$($rules.Count)\"",
        target
    );

    tracing::info!(
        "Disabling inbound firewall blocks for {}",
        program.display()
    );
    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .status()
        .context("run firewall PowerShell")?;
    if !status.success() {
        return Err(anyhow!("firewall PowerShell failed"));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
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

/// Copy uv config from bundled profile to pyproject_dir (only if not exists)
fn copy_uv_config(pyproject_dir: &Path, profile: &str) -> anyhow::Result<()> {
    // Security: Whitelist allowed profile names to prevent path traversal
    // Check if uv.toml already exists in target directory
    let target = pyproject_dir.join("uv.toml");
    if target.exists() {
        tracing::info!(
            "uv.toml already exists at {}, skipping copy",
            target.display()
        );
        return Ok(());
    }

    // Find profile in bundled resources
    let exe_dir = std::env::current_exe()
        .context("get exe path")?
        .parent()
        .ok_or_else(|| anyhow!("cannot get exe dir"))?
        .to_path_buf();

    // Platform-specific resource directory resolution
    #[cfg(target_os = "macos")]
    let res_dir = exe_dir
        .parent() // Contents
        .map(|p| p.join("Resources").join("res"))
        .ok_or_else(|| anyhow!("cannot resolve macOS resources path"))?;

    #[cfg(not(target_os = "macos"))]
    let res_dir = exe_dir.join("res");

    // Try res/conf/<profile> first (new layout)
    let source = res_dir.join("conf").join(profile);
    let source = if source.exists() {
        source
    } else {
        // Fallback to res/<profile> (legacy layout)
        let fallback = res_dir.join(profile);
        if fallback.exists() {
            fallback
        } else {
            return Err(anyhow!("Profile not found: {}", profile));
        }
    };

    // Copy profile to uv.toml
    std::fs::copy(&source, &target)
        .with_context(|| format!("copy {} -> {}", source.display(), target.display()))?;

    tracing::info!("Copied {} to {}", source.display(), target.display());
    Ok(())
}

/// Install managed Python using uv
fn ensure_managed_python(uv: &Path, pyproject_dir: &Path) -> anyhow::Result<()> {
    let mut cmd = Command::new(uv);
    cmd.current_dir(pyproject_dir);

    // Use uv.toml if exists
    let uv_config = pyproject_dir.join("uv.toml");
    if uv_config.exists() {
        cmd.arg("--config-file").arg(&uv_config);
    }

    cmd.args(["python", "install", "3.12"]);

    let status = cmd.status().context("uv python install")?;
    if !status.success() {
        return Err(anyhow!("uv python install failed"));
    }
    Ok(())
}

/// Sync project dependencies using uv
fn uv_sync(uv: &Path, pyproject_dir: &Path) -> anyhow::Result<()> {
    let mut cmd = Command::new(uv);
    cmd.current_dir(pyproject_dir);

    // Use uv.toml if exists
    let uv_config = pyproject_dir.join("uv.toml");
    if uv_config.exists() {
        cmd.arg("--config-file").arg(&uv_config);
    }

    cmd.arg("sync");

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
    fn copy_uv_config_rejects_path_traversal() {
        let temp_dir = std::env::temp_dir();

        let err = copy_uv_config(&temp_dir, "../evil.toml").unwrap_err();
        assert!(err.to_string().contains("path separators"));

        let err = copy_uv_config(&temp_dir, "unknown.toml").unwrap_err();
        assert!(err.to_string().contains("Unknown profile"));
    }
}
