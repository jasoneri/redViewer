//! Asynchronous LAN connectivity diagnostics for the desktop shell.

use anyhow::{anyhow, Context};
use parking_lot::Mutex;
#[cfg(target_os = "windows")]
use rv_lib::resolve_install_src_dir;
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

use crate::webserver;

const BACKEND_PORT: u16 = 12345;
const WEB_PORT: u16 = 8080;
const PROBE_TIMEOUT: Duration = Duration::from_millis(800);
const LAN_DIAGNOSTICS_EVENT: &str = "lan-diagnostics";

#[derive(Default)]
pub struct LanDiagnosticsState {
    latest: Mutex<Option<LanDiagnosticsPayload>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDiagnosticsPayload {
    pub status: LanDiagnosticsStatus,
    pub message: Option<String>,
    pub code: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LanDiagnosticsStatus {
    Ok,
    Warning,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanDiagnosticsReport {
    lan_ip: Option<IpAddr>,
    probes: ProbeSet,
    firewall: FirewallDiagnostics,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeSet {
    loopback_backend: ProbeResult,
    loopback_web: ProbeResult,
    lan_backend: Option<ProbeResult>,
    lan_web: Option<ProbeResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeResult {
    target: String,
    ok: bool,
    status_code: Option<u16>,
    error: Option<String>,
    duration_ms: u128,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FirewallDiagnostics {
    query_error: Option<String>,
    active_profiles: Vec<FirewallProfile>,
    block_rules: Vec<FirewallRule>,
    allow_rules: Vec<FirewallRule>,
    disabled_allow_rules: Vec<FirewallRule>,
    tcp8080_allow: bool,
    tcp12345_allow: bool,
    udp12345_allow: bool,
    tcp8080_disabled_allow: bool,
    tcp12345_disabled_allow: bool,
    udp12345_disabled_allow: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FirewallProfile {
    name: String,
    enabled: String,
    default_inbound_action: String,
    block_all_inbound_traffic: String,
    notifications_disabled: String,
    allow_local_firewall_rules: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FirewallRule {
    name: String,
    display_name: String,
    enabled: String,
    action: String,
    profile: String,
    program: String,
    protocol: String,
    local_port: String,
}

#[tauri::command]
pub fn get_lan_diagnostics(app: AppHandle) -> Option<LanDiagnosticsPayload> {
    app.try_state::<Arc<LanDiagnosticsState>>()
        .and_then(|state| state.latest.lock().clone())
}

pub fn spawn_lan_diagnostics(app: AppHandle, pyproject_dir: PathBuf, uv_path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let result =
            tokio::task::spawn_blocking(move || run_lan_diagnostics(&pyproject_dir, &uv_path))
                .await;
        let payload = match result {
            Ok(Ok((payload, report))) => {
                log_report(&payload, &report);
                payload
            }
            Ok(Err(error)) => {
                tracing::warn!("LAN diagnostics failed: {:#}", error);
                LanDiagnosticsPayload::ok()
            }
            Err(error) => {
                tracing::warn!("LAN diagnostics task failed: {}", error);
                LanDiagnosticsPayload::ok()
            }
        };

        if let Some(state) = app.try_state::<Arc<LanDiagnosticsState>>() {
            *state.latest.lock() = Some(payload.clone());
        }
        if let Err(error) = app.emit(LAN_DIAGNOSTICS_EVENT, payload) {
            tracing::warn!("Failed to emit LAN diagnostics: {}", error);
        }
    });
}

fn run_lan_diagnostics(
    pyproject_dir: &Path,
    uv_path: &Path,
) -> anyhow::Result<(LanDiagnosticsPayload, LanDiagnosticsReport)> {
    let lan_ip = webserver::get_lan_ip();
    let (probes, firewall) = thread::scope(|scope| {
        let probes = scope.spawn(|| run_connectivity_probes(lan_ip));
        let firewall = scope.spawn(|| inspect_windows_firewall(pyproject_dir, uv_path));
        let probes = probes
            .join()
            .map_err(|_| anyhow!("connectivity probes panicked"))??;
        let firewall = firewall
            .join()
            .map_err(|_| anyhow!("firewall diagnostics panicked"))?;
        Ok::<_, anyhow::Error>((probes, firewall))
    })?;
    let report = LanDiagnosticsReport {
        lan_ip,
        probes,
        firewall,
    };
    let payload = classify_report(&report);
    Ok((payload, report))
}

fn run_connectivity_probes(lan_ip: Option<IpAddr>) -> anyhow::Result<ProbeSet> {
    thread::scope(|scope| {
        let loopback_backend =
            scope.spawn(|| http_probe(IpAddr::V4(Ipv4Addr::LOCALHOST), BACKEND_PORT, "/root/"));
        let loopback_web =
            scope.spawn(|| http_probe(IpAddr::V4(Ipv4Addr::LOCALHOST), WEB_PORT, "/"));
        let lan_backend =
            lan_ip.map(|ip| scope.spawn(move || http_probe(ip, BACKEND_PORT, "/root/")));
        let lan_web = lan_ip.map(|ip| scope.spawn(move || http_probe(ip, WEB_PORT, "/")));

        Ok::<_, anyhow::Error>(ProbeSet {
            loopback_backend: loopback_backend
                .join()
                .map_err(|_| anyhow!("loopback backend probe panicked"))?,
            loopback_web: loopback_web
                .join()
                .map_err(|_| anyhow!("loopback web probe panicked"))?,
            lan_backend: match lan_backend {
                Some(handle) => Some(
                    handle
                        .join()
                        .map_err(|_| anyhow!("LAN backend probe panicked"))?,
                ),
                None => None,
            },
            lan_web: match lan_web {
                Some(handle) => Some(
                    handle
                        .join()
                        .map_err(|_| anyhow!("LAN web probe panicked"))?,
                ),
                None => None,
            },
        })
    })
}

fn classify_report(report: &LanDiagnosticsReport) -> LanDiagnosticsPayload {
    if !report.probes.loopback_backend.ok {
        return LanDiagnosticsPayload::warning("backend_loopback_unreachable", "后端连接异常");
    }

    if let Some((code, message)) = firewall_block_warning(&report.firewall.block_rules) {
        return LanDiagnosticsPayload::warning(code, message);
    }

    if let Some((code, message)) = firewall_allow_warning(&report.firewall) {
        return LanDiagnosticsPayload::warning(code, message);
    }

    if matches!(&report.probes.lan_backend, Some(probe) if !probe.ok) {
        return LanDiagnosticsPayload::warning("lan_backend_unreachable", "12345 可能受阻");
    }

    if matches!(&report.probes.lan_web, Some(probe) if !probe.ok) {
        return LanDiagnosticsPayload::warning("lan_web_unreachable", "8080 可能受阻");
    }

    LanDiagnosticsPayload::ok()
}

impl LanDiagnosticsPayload {
    fn ok() -> Self {
        Self {
            status: LanDiagnosticsStatus::Ok,
            message: None,
            code: None,
        }
    }

    fn warning(code: &str, message: &str) -> Self {
        Self {
            status: LanDiagnosticsStatus::Warning,
            message: Some(message.to_string()),
            code: Some(code.to_string()),
        }
    }
}

fn log_report(payload: &LanDiagnosticsPayload, report: &LanDiagnosticsReport) {
    match serde_json::to_string(report) {
        Ok(report_json) => tracing::info!(
            "LAN diagnostics status={:?} code={:?} report={}",
            payload.status,
            payload.code,
            report_json
        ),
        Err(error) => tracing::warn!("Failed to serialize LAN diagnostics report: {}", error),
    }
}

fn http_probe(ip: IpAddr, port: u16, path: &str) -> ProbeResult {
    let target = format!("http://{}:{}{}", ip, port, path);
    let start = Instant::now();
    let addr = SocketAddr::new(ip, port);
    let mut stream = match TcpStream::connect_timeout(&addr, PROBE_TIMEOUT) {
        Ok(stream) => stream,
        Err(error) => {
            return ProbeResult {
                target,
                ok: false,
                status_code: None,
                error: Some(error.to_string()),
                duration_ms: start.elapsed().as_millis(),
            };
        }
    };

    let _ = stream.set_read_timeout(Some(PROBE_TIMEOUT));
    let _ = stream.set_write_timeout(Some(PROBE_TIMEOUT));
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        path, ip
    );
    if let Err(error) = stream.write_all(request.as_bytes()) {
        return ProbeResult {
            target,
            ok: false,
            status_code: None,
            error: Some(error.to_string()),
            duration_ms: start.elapsed().as_millis(),
        };
    }

    let mut buf = [0_u8; 512];
    let read = match stream.read(&mut buf) {
        Ok(read) => read,
        Err(error) => {
            return ProbeResult {
                target,
                ok: false,
                status_code: None,
                error: Some(error.to_string()),
                duration_ms: start.elapsed().as_millis(),
            };
        }
    };

    let status_code = parse_http_status(&buf[..read]);
    ProbeResult {
        target,
        ok: matches!(status_code, Some(200..=399) | Some(401)),
        status_code,
        error: if status_code.is_some() {
            None
        } else {
            Some("invalid HTTP response".to_string())
        },
        duration_ms: start.elapsed().as_millis(),
    }
}

fn parse_http_status(buf: &[u8]) -> Option<u16> {
    let text = std::str::from_utf8(buf).ok()?;
    let line = text.lines().next()?;
    let mut parts = line.split_whitespace();
    let _version = parts.next()?;
    parts.next()?.parse().ok()
}

fn firewall_block_warning(rules: &[FirewallRule]) -> Option<(&'static str, &'static str)> {
    if rules.iter().any(rule_blocks_backend) {
        return Some(("firewall_backend_block_rule", "12345 可能受阻"));
    }
    if rules.iter().any(rule_blocks_web) {
        return Some(("firewall_web_block_rule", "8080 可能受阻"));
    }
    None
}

fn firewall_allow_warning(firewall: &FirewallDiagnostics) -> Option<(&'static str, &'static str)> {
    if firewall.query_error.is_some() {
        return None;
    }

    if firewall
        .active_profiles
        .iter()
        .any(profile_blocks_all_inbound)
    {
        return Some(("firewall_profile_blocks_all", "局域网可能受阻"));
    }
    if firewall
        .active_profiles
        .iter()
        .any(profile_ignores_local_firewall_rules)
    {
        return Some(("firewall_local_rules_ignored", "局域网可能受阻"));
    }

    if !firewall.active_profiles.iter().any(profile_blocks_inbound) {
        return None;
    }

    if (firewall.tcp12345_disabled_allow && !firewall.tcp12345_allow)
        || (firewall.udp12345_disabled_allow && !firewall.udp12345_allow)
    {
        return Some(("firewall_backend_allow_disabled", "12345 可能受阻"));
    }
    if firewall.tcp8080_disabled_allow && !firewall.tcp8080_allow {
        return Some(("firewall_web_allow_disabled", "8080 可能受阻"));
    }

    if !firewall.tcp12345_allow || !firewall.udp12345_allow {
        return Some(("firewall_backend_allow_missing", "12345 可能受阻"));
    }
    if !firewall.tcp8080_allow {
        return Some(("firewall_web_allow_missing", "8080 可能受阻"));
    }

    None
}

fn profile_blocks_inbound(profile: &FirewallProfile) -> bool {
    is_true(&profile.enabled)
        && profile
            .default_inbound_action
            .trim()
            .eq_ignore_ascii_case("Block")
}

fn profile_blocks_all_inbound(profile: &FirewallProfile) -> bool {
    is_true(&profile.enabled) && is_true(&profile.block_all_inbound_traffic)
}

fn profile_ignores_local_firewall_rules(profile: &FirewallProfile) -> bool {
    is_true(&profile.enabled) && is_false(&profile.allow_local_firewall_rules)
}

fn is_true(value: &str) -> bool {
    value.trim().eq_ignore_ascii_case("True")
}

fn is_false(value: &str) -> bool {
    value.trim().eq_ignore_ascii_case("False")
}

fn rule_blocks_backend(rule: &FirewallRule) -> bool {
    let program = normalized_program(&rule.program);
    if let Some(program) = program {
        return program.ends_with("\\python.exe")
            || program.ends_with("/python.exe")
            || program.ends_with("\\uv.exe")
            || program.ends_with("/uv.exe");
    }
    port_spec_matches(&rule.local_port, BACKEND_PORT)
}

fn rule_blocks_web(rule: &FirewallRule) -> bool {
    let program = normalized_program(&rule.program);
    if let Some(program) = program {
        return program.ends_with("\\rv.exe") || program.ends_with("/rv.exe");
    }
    port_spec_matches(&rule.local_port, WEB_PORT)
}

fn normalized_program(program: &str) -> Option<String> {
    let trimmed = program.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("Any") {
        None
    } else {
        Some(trimmed.to_ascii_lowercase())
    }
}

fn port_spec_matches(spec: &str, port: u16) -> bool {
    let spec = spec.trim();
    if spec.is_empty() {
        return false;
    }
    if spec.eq_ignore_ascii_case("Any") {
        return true;
    }
    spec.split(',').any(|part| {
        let part = part.trim();
        if part == port.to_string() {
            return true;
        }
        let Some((start, end)) = part.split_once('-') else {
            return false;
        };
        let Ok(start) = start.trim().parse::<u16>() else {
            return false;
        };
        let Ok(end) = end.trim().parse::<u16>() else {
            return false;
        };
        port >= start && port <= end
    })
}

#[cfg(target_os = "windows")]
fn inspect_windows_firewall(pyproject_dir: &Path, uv_path: &Path) -> FirewallDiagnostics {
    match inspect_windows_firewall_inner(pyproject_dir, uv_path) {
        Ok(report) => report,
        Err(error) => FirewallDiagnostics {
            query_error: Some(format!("{:#}", error)),
            ..Default::default()
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn inspect_windows_firewall(_pyproject_dir: &Path, _uv_path: &Path) -> FirewallDiagnostics {
    FirewallDiagnostics::default()
}

#[cfg(target_os = "windows")]
fn inspect_windows_firewall_inner(
    pyproject_dir: &Path,
    uv_path: &Path,
) -> anyhow::Result<FirewallDiagnostics> {
    let programs = firewall_program_targets(pyproject_dir, uv_path);
    let script = windows_firewall_diagnostics_script();
    let output = powershell_command()
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .env(
            "RV_DIAG_PROGRAMS",
            serde_json::to_string(&programs).context("serialize firewall targets")?,
        )
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .context("run firewall diagnostics PowerShell")?;

    if !output.status.success() {
        return Err(anyhow!(
            "firewall diagnostics PowerShell failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    serde_json::from_slice::<FirewallDiagnostics>(&output.stdout)
        .context("parse firewall diagnostics JSON")
}

#[cfg(target_os = "windows")]
fn firewall_program_targets(pyproject_dir: &Path, uv_path: &Path) -> Vec<String> {
    let mut targets = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        push_unique_path(&mut targets, exe);
    }
    if uv_path.exists() {
        push_unique_path(&mut targets, uv_path.to_path_buf());
    }

    let venv_python = pyproject_dir
        .join(".venv")
        .join("Scripts")
        .join("python.exe");
    if venv_python.exists() {
        push_unique_path(&mut targets, venv_python.clone());
        if let Some(base_python) = resolve_python_base_executable(&venv_python) {
            push_unique_path(&mut targets, base_python);
        }
    }

    if let Ok(src_dir) = resolve_install_src_dir() {
        let packaged_python = src_dir.join(".venv").join("Scripts").join("python.exe");
        if packaged_python.exists() {
            push_unique_path(&mut targets, packaged_python);
        }
    }

    targets
}

#[cfg(target_os = "windows")]
fn push_unique_path(targets: &mut Vec<String>, path: PathBuf) {
    let value = path.to_string_lossy().to_string();
    if !targets
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&value))
    {
        targets.push(value);
    }
}

#[cfg(target_os = "windows")]
fn resolve_python_base_executable(venv_python: &Path) -> Option<PathBuf> {
    let output = powershell_command_for_program(venv_python)
        .args([
            "-c",
            "import sys; print(getattr(sys, '_base_executable', sys.executable))",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

#[cfg(target_os = "windows")]
fn powershell_command() -> Command {
    powershell_command_for_program(Path::new("powershell.exe"))
}

#[cfg(target_os = "windows")]
fn powershell_command_for_program(program: &Path) -> Command {
    let mut command = Command::new(program);
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(target_os = "windows")]
fn windows_firewall_diagnostics_script() -> &'static str {
    r#"
$ErrorActionPreference = 'Stop'
function StringValue($value) {
  if ($null -eq $value) { return '' }
  return [string]$value
}
function Test-PortMatch($spec, [string]$port) {
  $text = StringValue $spec
  if ($text -eq '' -or $text -eq 'Any') { return $true }
  foreach ($part in $text -split ',') {
    $item = $part.Trim()
    if ($item -eq $port) { return $true }
    if ($item -match '^(\d+)-(\d+)$') {
      $start = [int]$matches[1]
      $end = [int]$matches[2]
      $target = [int]$port
      if ($target -ge $start -and $target -le $end) { return $true }
    }
  }
  return $false
}
function Test-ProtocolMatch($actual, [string]$expected) {
  $text = StringValue $actual
  return $text -eq 'Any' -or $text -ieq $expected -or ($expected -eq 'TCP' -and $text -eq '6') -or ($expected -eq 'UDP' -and $text -eq '17')
}
function RuleRecord($rule, $appFilter, $portFilter) {
  [ordered]@{
    name = StringValue $rule.Name
    displayName = StringValue $rule.DisplayName
    enabled = StringValue $rule.Enabled
    action = StringValue $rule.Action
    profile = StringValue $rule.Profile
    program = StringValue $appFilter.Program
    protocol = StringValue $portFilter.Protocol
    localPort = StringValue $portFilter.LocalPort
  }
}
function ProfileRecord($profile) {
  [ordered]@{
    name = StringValue $profile.Name
    enabled = StringValue $profile.Enabled
    defaultInboundAction = StringValue $profile.DefaultInboundAction
    blockAllInboundTraffic = StringValue $profile.BlockAllInboundTraffic
    notificationsDisabled = StringValue $profile.NotificationsDisabled
    allowLocalFirewallRules = StringValue $profile.AllowLocalFirewallRules
  }
}
try {
  $programTargets = @()
  if (-not [string]::IsNullOrWhiteSpace($env:RV_DIAG_PROGRAMS)) {
    $programTargets = @($env:RV_DIAG_PROGRAMS | ConvertFrom-Json)
  }
  $blockRules = @()
  $allowRules = @()
  $disabledAllowRules = @()
  $tcp8080Allow = $false
  $tcp12345Allow = $false
  $udp12345Allow = $false
  $tcp8080DisabledAllow = $false
  $tcp12345DisabledAllow = $false
  $udp12345DisabledAllow = $false
  foreach ($rule in @(Get-NetFirewallRule -Direction Inbound)) {
    $appFilter = @($rule | Get-NetFirewallApplicationFilter)[0]
    $portFilter = @($rule | Get-NetFirewallPortFilter)[0]
    $program = StringValue $appFilter.Program
    $enabled = (StringValue $rule.Enabled) -eq 'True'
    $programMatched = $false
    foreach ($target in $programTargets) {
      if ($program -ne '' -and $program -ieq (StringValue $target)) { $programMatched = $true }
    }
    $tcp8080 = (Test-ProtocolMatch $portFilter.Protocol 'TCP') -and (Test-PortMatch $portFilter.LocalPort '8080')
    $tcp12345 = (Test-ProtocolMatch $portFilter.Protocol 'TCP') -and (Test-PortMatch $portFilter.LocalPort '12345')
    $udp12345 = (Test-ProtocolMatch $portFilter.Protocol 'UDP') -and (Test-PortMatch $portFilter.LocalPort '12345')
    $portMatched = $tcp8080 -or $tcp12345 -or $udp12345
    $hasProgram = ($program -ne '' -and $program -ne 'Any')
    if ($hasProgram) { $blockTargetsUs = $programMatched } else { $blockTargetsUs = $portMatched }
    if ($enabled -and (StringValue $rule.Action) -eq 'Block' -and $blockTargetsUs) {
      $blockRules += RuleRecord $rule $appFilter $portFilter
    }
    if ((StringValue $rule.Action) -eq 'Allow' -and $portMatched) {
      if ($enabled) {
        $allowRules += RuleRecord $rule $appFilter $portFilter
        if ($tcp8080) { $tcp8080Allow = $true }
        if ($tcp12345) { $tcp12345Allow = $true }
        if ($udp12345) { $udp12345Allow = $true }
      } else {
        $disabledAllowRules += RuleRecord $rule $appFilter $portFilter
        if ($tcp8080) { $tcp8080DisabledAllow = $true }
        if ($tcp12345) { $tcp12345DisabledAllow = $true }
        if ($udp12345) { $udp12345DisabledAllow = $true }
      }
    }
  }
  [ordered]@{
    queryError = $null
    activeProfiles = @(Get-NetFirewallProfile | ForEach-Object { ProfileRecord $_ })
    blockRules = @($blockRules)
    allowRules = @($allowRules)
    disabledAllowRules = @($disabledAllowRules)
    tcp8080Allow = $tcp8080Allow
    tcp12345Allow = $tcp12345Allow
    udp12345Allow = $udp12345Allow
    tcp8080DisabledAllow = $tcp8080DisabledAllow
    tcp12345DisabledAllow = $tcp12345DisabledAllow
    udp12345DisabledAllow = $udp12345DisabledAllow
  } | ConvertTo-Json -Depth 6 -Compress
} catch {
  [ordered]@{
    queryError = $_.Exception.Message
    activeProfiles = @()
    blockRules = @()
    allowRules = @()
    disabledAllowRules = @()
    tcp8080Allow = $false
    tcp12345Allow = $false
    udp12345Allow = $false
    tcp8080DisabledAllow = $false
    tcp12345DisabledAllow = $false
    udp12345DisabledAllow = $false
  } | ConvertTo-Json -Depth 6 -Compress
}
"#
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok_probe(port: u16) -> ProbeResult {
        ProbeResult {
            target: format!("http://127.0.0.1:{}/", port),
            ok: true,
            status_code: Some(200),
            error: None,
            duration_ms: 1,
        }
    }

    fn failed_probe(port: u16) -> ProbeResult {
        ProbeResult {
            target: format!("http://127.0.0.1:{}/", port),
            ok: false,
            status_code: None,
            error: Some("connection refused".to_string()),
            duration_ms: 1,
        }
    }

    fn report_with(
        lan_backend: Option<ProbeResult>,
        firewall: FirewallDiagnostics,
    ) -> LanDiagnosticsReport {
        LanDiagnosticsReport {
            lan_ip: Some(IpAddr::V4(Ipv4Addr::new(192, 168, 31, 15))),
            probes: ProbeSet {
                loopback_backend: ok_probe(BACKEND_PORT),
                loopback_web: ok_probe(WEB_PORT),
                lan_backend,
                lan_web: Some(ok_probe(WEB_PORT)),
            },
            firewall,
        }
    }

    fn restrictive_profile() -> FirewallProfile {
        FirewallProfile {
            name: "Public".to_string(),
            enabled: "True".to_string(),
            default_inbound_action: "Block".to_string(),
            block_all_inbound_traffic: "False".to_string(),
            notifications_disabled: "False".to_string(),
            allow_local_firewall_rules: "True".to_string(),
        }
    }

    #[test]
    fn clean_report_has_no_warning() {
        let report = report_with(Some(ok_probe(BACKEND_PORT)), FirewallDiagnostics::default());
        assert_eq!(classify_report(&report), LanDiagnosticsPayload::ok());
    }

    #[test]
    fn failed_lan_backend_warns_about_backend_port() {
        let report = report_with(
            Some(failed_probe(BACKEND_PORT)),
            FirewallDiagnostics::default(),
        );
        assert_eq!(
            classify_report(&report),
            LanDiagnosticsPayload::warning("lan_backend_unreachable", "12345 可能受阻")
        );
    }

    #[test]
    fn explicit_firewall_block_warns_even_when_probe_passes() {
        let firewall = FirewallDiagnostics {
            block_rules: vec![FirewallRule {
                display_name: "Block rV backend".to_string(),
                action: "Block".to_string(),
                local_port: "12345".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(
            classify_report(&report),
            LanDiagnosticsPayload::warning("firewall_backend_block_rule", "12345 可能受阻")
        );
    }

    #[test]
    fn explicit_web_firewall_block_warns_about_web_port() {
        let firewall = FirewallDiagnostics {
            block_rules: vec![FirewallRule {
                display_name: "Block rV web".to_string(),
                action: "Block".to_string(),
                local_port: "8080".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(
            classify_report(&report),
            LanDiagnosticsPayload::warning("firewall_web_block_rule", "8080 可能受阻")
        );
    }

    #[test]
    fn missing_backend_allow_on_restrictive_profile_warns_about_backend_port() {
        let firewall = FirewallDiagnostics {
            active_profiles: vec![restrictive_profile()],
            tcp8080_allow: true,
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(
            classify_report(&report),
            LanDiagnosticsPayload::warning("firewall_backend_allow_missing", "12345 可能受阻")
        );
    }

    #[test]
    fn disabled_backend_allow_warns_about_backend_port() {
        let firewall = FirewallDiagnostics {
            active_profiles: vec![restrictive_profile()],
            tcp12345_disabled_allow: true,
            tcp8080_allow: true,
            udp12345_allow: true,
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(
            classify_report(&report),
            LanDiagnosticsPayload::warning("firewall_backend_allow_disabled", "12345 可能受阻")
        );
    }

    #[test]
    fn disabled_backend_allow_does_not_warn_when_enabled_allow_exists() {
        let firewall = FirewallDiagnostics {
            active_profiles: vec![restrictive_profile()],
            tcp8080_allow: true,
            tcp12345_allow: true,
            udp12345_allow: true,
            tcp12345_disabled_allow: true,
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(classify_report(&report), LanDiagnosticsPayload::ok());
    }

    #[test]
    fn block_all_profile_warns_even_when_allow_rules_exist() {
        let mut profile = restrictive_profile();
        profile.block_all_inbound_traffic = "True".to_string();
        let firewall = FirewallDiagnostics {
            active_profiles: vec![profile],
            tcp8080_allow: true,
            tcp12345_allow: true,
            udp12345_allow: true,
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(
            classify_report(&report),
            LanDiagnosticsPayload::warning("firewall_profile_blocks_all", "局域网可能受阻")
        );
    }

    #[test]
    fn unrelated_program_block_rule_does_not_warn() {
        // A foreign app's program-scoped block rule (LocalPort=Any) must never be
        // attributed to our web/backend ports. Regression guard for the false
        // "局域网可能受阻" triggered by e.g. a game's firewall rule.
        let firewall = FirewallDiagnostics {
            block_rules: vec![FirewallRule {
                display_name: "Kingdom Come: Deliverance II".to_string(),
                action: "Block".to_string(),
                program: r"R:\game\kcd2\bin\kingdomcome.exe".to_string(),
                local_port: "Any".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(classify_report(&report), LanDiagnosticsPayload::ok());
    }

    #[test]
    fn restrictive_profile_with_expected_allows_has_no_warning() {
        let firewall = FirewallDiagnostics {
            active_profiles: vec![restrictive_profile()],
            tcp8080_allow: true,
            tcp12345_allow: true,
            udp12345_allow: true,
            ..Default::default()
        };
        let report = report_with(Some(ok_probe(BACKEND_PORT)), firewall);
        assert_eq!(classify_report(&report), LanDiagnosticsPayload::ok());
    }
}
