//! Embedded HTTP server for redViewer desktop app.
//!
//! Responsibilities:
//! - Serve `frontend/dist/assets/*` at `/assets/*`
//! - SPA fallback: all other non-proxy paths -> `frontend/dist/index.html`
//! - Reverse proxy: `/comic/*`, `/root/*`, `/kemono/*`, `/static/*`, `/static_kemono/*`, `/api/*`
//!   -> Python backend (default: `http://127.0.0.1:12345`)

use anyhow::{anyhow, Context};
use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderValue, Request, StatusCode, Uri},
    response::Response,
    routing::any,
    Router,
};
use http_body_util::BodyExt;
use hyper_util::{
    client::legacy::{connect::HttpConnector, Client},
    rt::TokioExecutor,
};
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::oneshot;
use tower_http::services::{ServeDir, ServeFile};

/// Configuration for the embedded web server
#[derive(Debug, Clone)]
pub struct WebServerConfig {
    /// Address to listen on
    pub listen: SocketAddr,
    /// Path to frontend dist directory
    pub dist_dir: PathBuf,
    /// Base URL of Python backend for proxying
    pub backend_base: String,
}

impl Default for WebServerConfig {
    fn default() -> Self {
        Self {
            listen: SocketAddr::new(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)), 8080),
            dist_dir: PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../../frontend/dist"),
            backend_base: "http://127.0.0.1:12345".to_string(),
        }
    }
}

/// Embedded web server that serves frontend assets and proxies API requests
#[derive(Clone)]
pub struct WebServer {
    inner: Arc<Inner>,
}

struct Inner {
    url: String,
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl WebServer {
    /// Start the embedded web server
    pub fn start(cfg: WebServerConfig) -> anyhow::Result<Self> {
        // Resolve dist directory (allow override via env var for packaging)
        let dist_dir = std::env::var("RV_DIST_DIR")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| cfg.dist_dir.clone());

        if !dist_dir.exists() {
            return Err(anyhow::anyhow!(
                "Frontend dist directory not found: {}. \
                Please ensure frontend/dist is packaged in the installer resources. \
                Set RV_DIST_DIR environment variable to override.",
                dist_dir.display()
            ));
        }

        // Parse backend base URL
        let backend_base = cfg.backend_base.trim_end_matches('/').to_string();
        let backend_authority = backend_base
            .strip_prefix("http://")
            .or_else(|| backend_base.strip_prefix("https://"))
            .and_then(|s| s.split('/').next())
            .ok_or_else(|| anyhow!("invalid backend_base: {}", backend_base))?
            .to_string();

        // Create non-blocking TCP listener
        let std_listener = std::net::TcpListener::bind(cfg.listen)
            .with_context(|| format!("bind embedded web server at {}", cfg.listen))?;
        std_listener.set_nonblocking(true).context("set_nonblocking")?;

        let assets_dir = dist_dir.join("assets");
        let index_file = dist_dir.join("index.html");

        // Create HTTP client for proxying (hyper 1.x)
        let client: Client<HttpConnector, Body> =
            Client::builder(TokioExecutor::new()).build(HttpConnector::new());

        let state = AppState {
            backend_base,
            backend_authority,
            client,
        };

        // Router order matters: more specific routes first
        // 1) API proxy routes (with and without trailing slash)
        // 2) Static files (both /assets/* and root files with extensions)
        // 3) SPA fallback only for non-file routes
        let app = Router::new()
            // API proxy routes - must match first
            .route("/comic", any(proxy_to_backend))
            .route("/comic/", any(proxy_to_backend))
            .route("/comic/{*path}", any(proxy_to_backend))
            .route("/root", any(proxy_to_backend))
            .route("/root/", any(proxy_to_backend))
            .route("/root/{*path}", any(proxy_to_backend))
            .route("/kemono", any(proxy_to_backend))
            .route("/kemono/", any(proxy_to_backend))
            .route("/kemono/{*path}", any(proxy_to_backend))
            .route("/static", any(proxy_to_backend))
            .route("/static/", any(proxy_to_backend))
            .route("/static/{*path}", any(proxy_to_backend))
            .route("/static_kemono", any(proxy_to_backend))
            .route("/static_kemono/", any(proxy_to_backend))
            .route("/static_kemono/{*path}", any(proxy_to_backend))
            .route("/api", any(proxy_to_backend))
            .route("/api/", any(proxy_to_backend))
            .route("/api/{*path}", any(proxy_to_backend))
            // Static assets from /assets
            .nest_service("/assets", ServeDir::new(assets_dir))
            // Root static files (favicon, etc) + SPA fallback for HTML routes
            // Use fallback_service with ServeDir, configuring not_found_service
            // to serve index.html for SPA routing
            .fallback_service(
                ServeDir::new(dist_dir.clone())
                    .precompressed_gzip()
                    .not_found_service(ServeFile::new(index_file)),
            )
            .with_state(state);

        // Create shutdown channel
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        // Use localhost for browser access (0.0.0.0 is not valid in browsers)
        let url = format!("http://localhost:{}/", cfg.listen.port());
        let task_url = url.clone();

        // Spawn server in Tauri's async runtime
        tauri::async_runtime::spawn(async move {
            let listener = tokio::net::TcpListener::from_std(std_listener)
                .expect(&format!("failed to create tokio listener for {}", task_url));

            tracing::info!("Embedded web server listening at {}", task_url);

            let server = axum::serve(listener, app.into_make_service()).with_graceful_shutdown(
                async move {
                    let _ = shutdown_rx.await;
                },
            );

            if let Err(e) = server.await {
                panic!("embedded web server error ({}): {}", task_url, e);
            }
        });

        Ok(Self {
            inner: Arc::new(Inner {
                url,
                shutdown_tx: Mutex::new(Some(shutdown_tx)),
            }),
        })
    }

    /// Get the URL where the server is listening
    pub fn url(&self) -> &str {
        &self.inner.url
    }

    /// Stop the web server
    pub fn stop(&self) -> anyhow::Result<()> {
        let tx = self.inner.shutdown_tx.lock()
            .map_err(|e| anyhow::anyhow!("Mutex poisoned: {}", e))?
            .take();
        if let Some(tx) = tx {
            let _ = tx.send(());
        }
        Ok(())
    }
}

/// Application state for the web server
#[derive(Clone)]
struct AppState {
    backend_base: String,
    backend_authority: String,
    client: Client<HttpConnector, Body>,
}

/// Proxy handler that forwards requests to the Python backend
async fn proxy_to_backend(
    State(state): State<AppState>,
    mut req: Request<Body>,
) -> Result<Response<Body>, StatusCode> {
    let pq = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or_else(|| req.uri().path());

    // Build target URI
    let target: Uri = format!("{}{}", state.backend_base, pq)
        .parse()
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    *req.uri_mut() = target;

    // Update Host header
    req.headers_mut().insert(
        header::HOST,
        HeaderValue::from_str(&state.backend_authority).map_err(|_| StatusCode::BAD_GATEWAY)?,
    );
    req.headers_mut().remove(header::CONNECTION);

    // Forward request to backend
    let res = state.client.request(req).await.map_err(|e| {
        tracing::warn!("proxy error: {}", e);
        StatusCode::BAD_GATEWAY
    })?;

    let (parts, body) = res.into_parts();
    let body = Body::from_stream(body.into_data_stream());

    Ok(Response::from_parts(parts, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_server_config_default_values() {
        let cfg = WebServerConfig::default();
        assert_eq!(cfg.listen, SocketAddr::new(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)), 8080));
        assert_eq!(cfg.backend_base, "http://127.0.0.1:12345");
    }
}
