//! Command line argument parsing for installer

use std::ffi::OsString;

#[derive(Debug, Clone, Default)]
pub struct Args {
    /// /i - Install mode (Python + dependencies)
    pub install: bool,
    /// /pyenv <file> - Mirror/profile selection
    pub pyenv: Option<String>,
    /// /update - Update backend code only
    pub update: bool,
    /// /v - Verbose logging
    pub verbose: bool,
    /// /h - Show help
    pub help: bool,
}

impl Args {
    pub fn parse() -> Self {
        let mut out = Args::default();
        let mut it = std::env::args_os().skip(1).peekable();

        while let Some(raw) = it.next() {
            let s = normalize(raw);

            match s.as_str() {
                "/i" | "-i" | "--install" => out.install = true,
                "/update" | "--update" => out.update = true,
                "/v" | "-v" | "--verbose" => out.verbose = true,
                "/h" | "/?" | "-h" | "--help" => out.help = true,
                "/pyenv" | "--pyenv" => {
                    if let Some(v) = it.next() {
                        out.pyenv = Some(normalize(v));
                    }
                }
                _ => {}
            }
        }

        out
    }
}

fn normalize(v: OsString) -> String {
    v.to_string_lossy().trim().to_string()
}

pub fn print_help() {
    eprintln!(
        r#"redViewer Installer

Usage:
  rvInstaller.exe [OPTIONS]

Options:
  /i                    Install Python and dependencies
  /pyenv <file>         Mirror selection (cn.toml/global.toml/custom.toml)
  /update               Update backend code only
  /v, --verbose         Enable verbose logging
  /h, /?, --help        Show this help message

Examples:
  rvInstaller.exe /i /pyenv cn.toml    # Install with China mirrors
  rvInstaller.exe /update              # Update backend code only
"#
    );
}
