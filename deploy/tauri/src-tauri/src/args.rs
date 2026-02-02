//! Command line argument parsing for src-tauri

use std::ffi::OsString;

#[derive(Debug, Clone, Default)]
pub struct Args {
    /// /backend - Run backend only (no tray, no embedded web server)
    pub backend_only: bool,
    /// /no-tray - Disable tray (debug mode)
    pub no_tray: bool,
    /// /v - Verbose logging
    pub verbose: bool,
}

impl Args {
    pub fn parse() -> Self {
        let mut out = Args::default();
        let mut it = std::env::args_os().skip(1).peekable();

        while let Some(raw) = it.next() {
            let s = normalize(raw);

            match s.as_str() {
                "/backend" | "--backend" => out.backend_only = true,
                "/no-tray" | "--no-tray" => out.no_tray = true,
                "/v" | "-v" | "--verbose" => out.verbose = true,
                "/h" | "/?" | "-h" | "--help" => {
                    print_help_and_exit(0);
                }
                _ => {
                    // Ignore unknown args for forward-compat
                }
            }
        }

        out
    }
}

fn normalize(v: OsString) -> String {
    v.to_string_lossy().trim().to_string()
}

fn print_help_and_exit(code: i32) -> ! {
    eprintln!(
        r#"redViewer Tray Application

Usage:
  rV.exe [OPTIONS]

Options:
  /backend              Backend-only mode (no tray, no web server, just API)
  /no-tray              Disable tray icon (debug mode)
  /v, --verbose         Enable verbose logging
  /h, /?, --help        Show this help message

Note:
  Installation is handled by rvInstaller.exe.
  Configuration is managed by the backend using platform-standard paths.
"#
    );
    std::process::exit(code);
}
