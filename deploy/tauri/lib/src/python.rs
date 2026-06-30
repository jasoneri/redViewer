//! Python process management for redViewer backend
//!
//! Shared between src-tauri and other components that need to manage
//! the Python backend process.

use anyhow::{Context, anyhow};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::config::AppPaths;
use crate::paths::UvPaths;

/// Backend server configuration
#[derive(Debug, Clone)]
pub struct BackendConfig {
    pub host: String,
    pub port: u16,
}

impl Default for BackendConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 12345,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DesktopLocksState {
    pub config_path: bool,
    pub book_handle: bool,
    pub switch_doujin: bool,
    pub force_rescan: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DesktopLocksUpdate {
    pub config_path: Option<bool>,
    pub book_handle: Option<bool>,
    pub switch_doujin: Option<bool>,
    pub force_rescan: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopAdminState {
    pub has_secret: bool,
    pub locks: DesktopLocksState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopAdminLocksResponse {
    pub success: bool,
    pub locks: DesktopLocksState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopAdminSecretResponse {
    pub success: bool,
    pub has_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopAdminLogLevelResponse {
    pub success: bool,
    pub log_level: String,
    pub restart_required: bool,
}

#[derive(Serialize)]
struct DesktopSecretPayload<'a> {
    secret: &'a str,
}

#[derive(Serialize)]
struct DesktopLogLevelPayload<'a> {
    log_level: &'a str,
}

/// Python process manager - handles starting, stopping, and monitoring the backend
#[derive(Clone)]
pub struct PythonManager {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    child: Option<Child>,
    cfg: BackendConfig,
    paths: AppPaths,
    uv: UvPaths,
}

impl PythonManager {
    /// Create a new Python manager
    pub fn new(paths: AppPaths, uv: UvPaths, cfg: BackendConfig) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                child: None,
                cfg,
                paths,
                uv,
            })),
        }
    }

    /// Start the Python backend process
    pub fn start(&self) -> anyhow::Result<()> {
        let mut g = self.inner.lock();
        if g.child.is_some() {
            tracing::info!("Backend already running");
            return Ok(());
        }

        tracing::info!("Starting backend: uv run backend/app.py");
        tracing::info!("Project dir: {}", g.uv.pyproject_dir.display());

        // Setup stderr logging to help diagnose issues
        let log_path = g.paths.log_dir.join("backend-stderr.log");
        let stderr_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .context("open backend stderr log")?;

        let mut cmd = Command::new(&g.uv.uv);
        cmd.current_dir(&g.uv.pyproject_dir)
            .arg("run")
            .arg("backend/app.py")
            .env("RV_HOST", &g.cfg.host)
            .env("RV_PORT", g.cfg.port.to_string())
            .env("RV_DEPLOY_MODE", "local")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(stderr_file);

        // Windows: prevent console window
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd
            .spawn()
            .context("spawn backend (uv run backend/app.py)")?;
        tracing::info!("Backend started with PID: {}", child.id());
        tracing::info!("Backend stderr log: {}", log_path.display());
        g.child = Some(child);
        Ok(())
    }

    /// Stop the Python backend process
    pub fn stop(&self) -> anyhow::Result<()> {
        let pid = {
            let mut g = self.inner.lock();
            match g.child.take() {
                Some(c) => c.id(),
                None => {
                    tracing::info!("Backend not running");
                    return Ok(());
                }
            }
        };

        tracing::info!("Stopping backend (PID: {})", pid);
        kill_process_tree(pid)?;
        tracing::info!("Backend stopped");
        Ok(())
    }

    /// Restart the Python backend process
    pub fn restart(&self) -> anyhow::Result<()> {
        self.stop().ok();
        thread::sleep(Duration::from_millis(500));
        self.start()
    }

    /// Wait until the backend is healthy (responding to HTTP requests)
    pub fn wait_until_healthy(&self, timeout: Duration) -> anyhow::Result<()> {
        let port = {
            let g = self.inner.lock();
            g.cfg.port
        };

        // Health check always uses 127.0.0.1 (loopback), not 0.0.0.0
        let url = format!("http://127.0.0.1:{}/root/", port);
        let start = Instant::now();

        tracing::info!("Waiting for backend at {} (timeout: {:?})", url, timeout);

        loop {
            if start.elapsed() > timeout {
                return Err(anyhow!("Backend health check timeout: {}", url));
            }
            if is_healthy(&url) {
                tracing::info!("Backend is healthy");
                return Ok(());
            }
            thread::sleep(Duration::from_millis(500));
        }
    }

    /// Get the backend URL (for proxy configuration, use 127.0.0.1 for local access)
    pub fn backend_url(&self) -> String {
        let g = self.inner.lock();
        format!("http://127.0.0.1:{}/", g.cfg.port)
    }

    pub fn desktop_admin_state(&self) -> anyhow::Result<DesktopAdminState> {
        let base_url = self.desktop_admin_base_url();
        let mut response = desktop_admin_request(
            ureq::get(format!("{}/root/desktop-admin/state", base_url)).call(),
        )?;
        response
            .body_mut()
            .read_json::<DesktopAdminState>()
            .context("parse desktop admin state")
    }

    pub fn desktop_admin_update_secret(
        &self,
        secret: &str,
    ) -> anyhow::Result<DesktopAdminSecretResponse> {
        let base_url = self.desktop_admin_base_url();
        let mut response = desktop_admin_request(
            ureq::post(format!("{}/root/desktop-admin/secret", base_url))
                .send_json(DesktopSecretPayload { secret }),
        )?;
        response
            .body_mut()
            .read_json::<DesktopAdminSecretResponse>()
            .context("parse desktop admin secret response")
    }

    pub fn desktop_admin_update_locks(
        &self,
        updates: &DesktopLocksUpdate,
    ) -> anyhow::Result<DesktopAdminLocksResponse> {
        let base_url = self.desktop_admin_base_url();
        let mut response = desktop_admin_request(
            ureq::post(format!("{}/root/desktop-admin/locks", base_url)).send_json(updates),
        )?;
        response
            .body_mut()
            .read_json::<DesktopAdminLocksResponse>()
            .context("parse desktop admin locks response")
    }

    pub fn desktop_admin_update_log_level(
        &self,
        log_level: &str,
    ) -> anyhow::Result<DesktopAdminLogLevelResponse> {
        let base_url = self.desktop_admin_base_url();
        let mut response = desktop_admin_request(
            ureq::post(format!("{}/root/desktop-admin/log-level", base_url))
                .send_json(DesktopLogLevelPayload { log_level }),
        )?;
        response
            .body_mut()
            .read_json::<DesktopAdminLogLevelResponse>()
            .context("parse desktop admin log-level response")
    }

    fn desktop_admin_base_url(&self) -> String {
        let g = self.inner.lock();
        format!("http://127.0.0.1:{}", g.cfg.port)
    }

    /// Get the log directory path
    pub fn log_dir(&self) -> PathBuf {
        let g = self.inner.lock();
        g.paths.log_dir.clone()
    }
}

fn desktop_admin_request(
    result: Result<http::Response<ureq::Body>, ureq::Error>,
) -> anyhow::Result<http::Response<ureq::Body>> {
    let mut response = match result {
        Ok(response) => response,
        Err(error) => return Err(error).context("call desktop admin endpoint"),
    };
    let status = response.status().as_u16();
    if (200..300).contains(&status) {
        return Ok(response);
    }

    let detail = response
        .body_mut()
        .read_to_string()
        .unwrap_or_else(|_| "desktop admin request failed".to_string());
    Err(anyhow!(
        "desktop admin endpoint returned {}: {}",
        status,
        detail
    ))
}

/// Check if the backend is healthy by making an HTTP request
fn is_healthy(url: &str) -> bool {
    // Use ureq for synchronous HTTP requests
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(2)))
        .build()
        .into();
    match agent.get(url).call() {
        Ok(resp) => {
            let status: u16 = resp.status().as_u16();
            (200..300).contains(&status) || status == 401
        }
        Err(_) => false,
    }
}

/// Kill a process and its children
fn kill_process_tree(pid: u32) -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let status = Command::new("taskkill")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .context("taskkill")?;

        if !status.success() {
            tracing::warn!("taskkill returned non-zero exit code");
        }
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Best-effort: SIGTERM then SIGKILL
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
        thread::sleep(Duration::from_millis(300));
        let _ = Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .status();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backend_config_default_values() {
        let cfg = BackendConfig::default();
        assert_eq!(cfg.host, "0.0.0.0");
        assert_eq!(cfg.port, 12345);
    }
}
