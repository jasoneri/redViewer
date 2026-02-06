//! uv runtime download module
//!
//! Downloads uv from mirror sources on macOS/Linux at first startup.

use anyhow::{anyhow, Context};
use flate2::read::GzDecoder;
use futures_util::stream::StreamExt;
use serde::Deserialize;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::Duration;
use tar::Archive;
use tokio::io::AsyncWriteExt;

/// Mirror source for uv download
#[derive(Debug, Clone, Deserialize)]
pub struct UvMirror {
    pub name: String,
    pub url: String,
}

/// Download configuration
#[derive(Debug, Clone)]
pub struct UvDownloadConfig {
    pub mirrors: Vec<UvMirror>,
    pub max_retries: usize,
    pub connect_timeout_secs: u64,
    pub read_timeout_secs: u64,
}

impl Default for UvDownloadConfig {
    fn default() -> Self {
        Self {
            mirrors: vec![UvMirror {
                name: "github".to_string(),
                url: "https://github.com/astral-sh/uv/releases/latest/download/".to_string(),
            }],
            max_retries: 3,
            connect_timeout_secs: 5,
            read_timeout_secs: 30,
        }
    }
}

/// Download progress callback data
#[derive(Debug, Clone)]
pub struct DownloadProgress {
    pub current: u64,
    pub total: Option<u64>,
    pub mirror_name: String,
}

/// Resolve the asset name for the current platform
pub fn resolve_asset_name() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "uv-aarch64-apple-darwin.tar.gz"
    }

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "uv-x86_64-apple-darwin.tar.gz"
    }

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "uv-x86_64-unknown-linux-gnu.tar.gz"
    }

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "uv-aarch64-unknown-linux-gnu.tar.gz"
    }

    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
    )))]
    {
        // Fallback for unsupported platforms - will fail at download time
        "uv-unknown-unknown.tar.gz"
    }
}

/// Resolve the full download URL
pub fn resolve_download_url(mirror: &UvMirror, asset: &str) -> String {
    let base = mirror.url.trim_end_matches('/');
    format!("{}/{}", base, asset)
}

/// File lock for preventing concurrent downloads
struct FileLock {
    _file: std::fs::File,
}

impl FileLock {
    fn try_acquire(lock_path: &Path) -> anyhow::Result<Option<Self>> {
        if lock_path.exists() {
            // Try to create the lock file exclusively
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(lock_path)
            {
                Ok(file) => {
                    return Ok(Some(FileLock { _file: file }));
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Ok(None);
                }
                Err(e) => return Err(e.into()),
            }
        }
        Ok(Some(FileLock {
            _file: std::fs::File::create(lock_path)?,
        }))
    }

    fn release(&self, lock_path: &Path) {
        let _ = std::fs::remove_file(lock_path);
    }
}

/// Download uv from mirrors
pub async fn download_uv<F>(
    config: &UvDownloadConfig,
    target_dir: &Path,
    mut progress_cb: F,
) -> anyhow::Result<PathBuf>
where
    F: FnMut(DownloadProgress),
{
    let asset = resolve_asset_name();
    tracing::info!("Downloading uv asset: {}", asset);

    // Ensure target directory exists
    std::fs::create_dir_all(target_dir)
        .context("create target directory")?;

    let lock_path = target_dir.join("uv.lock");
    let tmp_path = target_dir.join("uv.tmp");
    let final_path = target_dir.join("uv");

    // Try to acquire lock
    let _lock = FileLock::try_acquire(&lock_path)?.ok_or_else(|| {
        anyhow!("Another download is already in progress")
    })?;

    // Try each mirror
    let mut last_error = None;
    for mirror in &config.mirrors {
        let url = resolve_download_url(mirror, asset);
        tracing::info!("Trying mirror: {} ({})", mirror.name, url);

        match download_from_url(&url, &tmp_path, &mirror.name, config, &mut progress_cb).await {
            Ok(_) => {
                // Download succeeded, extract and install
                match extract_and_install(&tmp_path, &final_path) {
                    Ok(path) => {
                        _lock.release(&lock_path);
                        return Ok(path);
                    }
                    Err(e) => {
                        tracing::warn!("Extraction failed: {}", e);
                        last_error = Some(e);
                        let _ = std::fs::remove_file(&tmp_path);
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Download from {} failed: {}", mirror.name, e);
                last_error = Some(e);
                // Clean up partial download
                let _ = std::fs::remove_file(&tmp_path);
            }
        }
    }

    // All mirrors failed
    _lock.release(&lock_path);
    Err(last_error.unwrap_or_else(|| anyhow!("All mirrors failed")))
}

async fn download_from_url<F>(
    url: &str,
    target_path: &Path,
    mirror_name: &str,
    config: &UvDownloadConfig,
    progress_cb: &mut F,
) -> anyhow::Result<()>
where
    F: FnMut(DownloadProgress),
{
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(config.connect_timeout_secs))
        .read_timeout(Duration::from_secs(config.read_timeout_secs))
        .build()
        .context("build HTTP client")?;

    let response = client
        .get(url)
        .send()
        .await
        .context("send HTTP request")?;

    if !response.status().is_success() {
        return Err(anyhow!(
            "HTTP error: {}",
            response.status()
        ));
    }

    let total = response.content_length();
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();

    let mut file = tokio::fs::File::create(target_path)
        .await
        .context("create temp file")?;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.context("read response chunk")?;
        file.write_all(&chunk)
            .await
            .context("write to temp file")?;

        downloaded += chunk.len() as u64;
        progress_cb(DownloadProgress {
            current: downloaded,
            total,
            mirror_name: mirror_name.to_string(),
        });
    }

    file.flush().await.context("flush temp file")?;
    Ok(())
}

fn extract_and_install(tmp_path: &Path, final_path: &Path) -> anyhow::Result<PathBuf> {
    tracing::info!("Extracting uv archive");

    // Open the gz archive
    let compressed = std::fs::File::open(tmp_path)
        .context("open downloaded archive")?;
    let decoder = GzDecoder::new(compressed);
    let mut archive = Archive::new(decoder);

    // Find the uv binary in the archive
    for entry in archive.entries()?.flatten() {
        let path = entry.path()?;
        // Look for uv binary in the archive
        if path.ends_with("uv") || path.ends_with("uv.exe") {
            // Extract to temp location first
            let temp_uv = final_path.with_extension("tmp_extract");
            let mut file = std::fs::File::create(&temp_uv)
                .context("create extracted file")?;

            // Copy entry data to file
            let mut reader = entry;
            std::io::copy(&mut reader, &mut file)
                .context("write extracted file")?;
            file.flush()?;

            // Atomic rename
            std::fs::rename(&temp_uv, final_path)
                .context("rename to final path")?;

            // Set executable permission
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(final_path)
                    .context("get metadata")?
                    .permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(final_path, perms)
                    .context("set executable permission")?;
            }

            // Clean up downloaded archive
            let _ = std::fs::remove_file(tmp_path);

            tracing::info!("uv installed at: {}", final_path.display());
            return Ok(final_path.to_path_buf());
        }
    }

    Err(anyhow!("uv binary not found in archive"))
}

/// TOML config representation for [uv] section
#[derive(Debug, Deserialize)]
struct UvConfig {
    pub mirrors: Vec<UvMirror>,
}

/// Raw TOML structure (top-level)
#[derive(Debug, Deserialize)]
struct RawToml {
    uv: Option<UvConfig>,
}

/// Parse uv download config from TOML content
pub fn parse_uv_config(toml_content: &str) -> anyhow::Result<UvDownloadConfig> {
    let raw: RawToml = toml::from_str(toml_content)
        .context("parse TOML content")?;

    let uv_config = raw.uv.ok_or_else(|| {
        anyhow!("Missing [uv] section in TOML")
    })?;

    Ok(UvDownloadConfig {
        mirrors: uv_config.mirrors,
        max_retries: 3,
        connect_timeout_secs: 5,
        read_timeout_secs: 30,
    })
}

/// Load uv config from resource directory
///
/// Looks for {res_dir}/res/conf/{profile} where profile is like "cn.toml" or "global.toml"
/// Returns default GitHub config if file not found.
pub fn load_uv_config_from_resource(res_dir: &Path, profile: &str) -> UvDownloadConfig {
    let conf_path = res_dir.join("res").join("conf").join(profile);

    match std::fs::read_to_string(&conf_path) {
        Ok(content) => {
            match parse_uv_config(&content) {
                Ok(config) => {
                    tracing::info!("Loaded uv config from: {}", conf_path.display());
                    return config;
                }
                Err(e) => {
                    tracing::warn!("Failed to parse uv config from {}: {}, using defaults", conf_path.display(), e);
                }
            }
        }
        Err(_) => {
            tracing::info!("uv config file not found: {}, using defaults", conf_path.display());
        }
    }

    UvDownloadConfig::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_asset_name() {
        let name = resolve_asset_name();
        assert!(name.contains("uv"));
        assert!(name.ends_with(".tar.gz"));
    }

    #[test]
    fn test_resolve_download_url() {
        let mirror = UvMirror {
            name: "test".to_string(),
            url: "https://example.com/uv/".to_string(),
        };
        let url = resolve_download_url(&mirror, "uv-x86_64-apple-darwin.tar.gz");
        assert_eq!(url, "https://example.com/uv/uv-x86_64-apple-darwin.tar.gz");
    }

    #[test]
    fn test_download_config_default() {
        let config = UvDownloadConfig::default();
        assert_eq!(config.mirrors.len(), 1);
        assert_eq!(config.mirrors[0].name, "github");
        assert_eq!(config.max_retries, 3);
    }

    #[test]
    fn test_parse_uv_config_cn() {
        let toml_content = r#"
python-install-mirror = "https://mirror.nju.edu.cn/github-release/astral-sh/python-build-standalone"

[[index]]
url = "https://repo.huaweicloud.com/repository/pypi/simple"
default = true

[uv]
mirrors = [
  { name = "ustc", url = "https://mirrors.ustc.edu.cn/github-release/astral-sh/uv/LatestRelease/" },
  { name = "github", url = "https://github.com/astral-sh/uv/releases/latest/download/" }
]
"#;
        let config = parse_uv_config(toml_content).unwrap();
        assert_eq!(config.mirrors.len(), 2);
        assert_eq!(config.mirrors[0].name, "ustc");
        assert_eq!(config.mirrors[1].name, "github");
    }

    #[test]
    fn test_parse_uv_config_global() {
        let toml_content = r#"
[[index]]
url = "https://pypi.org/simple"
default = true

[uv]
mirrors = [
  { name = "github", url = "https://github.com/astral-sh/uv/releases/latest/download/" }
]
"#;
        let config = parse_uv_config(toml_content).unwrap();
        assert_eq!(config.mirrors.len(), 1);
        assert_eq!(config.mirrors[0].name, "github");
    }
}
