# Unified path configuration for build scripts
# Single source of truth for all paths

# Calculate project root from scripts location
# scripts/ -> deploy/ -> project root
$ProjectRoot = (Resolve-Path "$PSScriptRoot/../..").Path
$DeployDir = "$ProjectRoot/deploy"
$TauriDir = "$DeployDir/tauri"
$AssetsDir = "$DeployDir/assets"
$StageDir = "$DeployDir/stage"
$ScriptsDir = "$DeployDir/scripts"
$TestsDir = "$DeployDir/tests"

# Build output directory (respects CARGO_TARGET_DIR)
# Note: Release builds use __temp/tauri_dist (see build-desktop.ps1)
$TargetDir = if ($env:CARGO_TARGET_DIR) {
    $env:CARGO_TARGET_DIR
} else {
    "$TauriDir/target"
}

# Release bundle output (matches build-desktop.ps1 CARGO_TARGET_DIR)
$ReleaseBundleDir = "$ProjectRoot/__temp/tauri_dist/release/bundle"

# Source directories
$FrontendDir = "$ProjectRoot/frontend"
$BackendDir = "$ProjectRoot/backend"
