//! redViewer Installer
//!
//! Command-line installer that sets up Python environment and dependencies.
//! This is invoked by MSI Custom Action during installation or manually by users.
//!
//! Usage:
//!   rvInstaller.exe /i                 - Install Python and dependencies
//!   rvInstaller.exe /i /pyenv cn.toml  - Install with China mirrors
//!   rvInstaller.exe /update           - Update backend code only
//!   rvInstaller.exe /v                - Verbose logging
//!   rvInstaller.exe /h                - Show help

mod args;
mod install;

use anyhow::Context;
use lib::{resolve_paths, ensure_dirs, init_logging};
use tracing::info;

fn main() -> anyhow::Result<()> {
    // Set RV_INSTALLER for log file separation
    // SAFETY: Single-threaded at this point, no other threads reading env vars
    unsafe { std::env::set_var("RV_INSTALLER", "1") };

    let args = args::Args::parse();

    let paths = resolve_paths().context("failed to resolve paths")?;
    ensure_dirs(&paths).context("failed to create directories")?;
    let _guard = init_logging(&paths, args.verbose).context("failed to init logging")?;

    info!("redViewer Installer starting (version {})", env!("CARGO_PKG_VERSION"));

    if args.help {
        args::print_help();
        return Ok(());
    }

    if args.update {
        info!("Update mode requested");
        install::update_backend(&paths).context("failed to update backend")?;
        return Ok(());
    }

    if args.install {
        info!("Install mode requested");
        install::run_install(&paths, args.pyenv).context("failed to run install")?;
        return Ok(());
    }

    // Default: show help
    args::print_help();
    Ok(())
}
