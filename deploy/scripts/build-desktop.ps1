# redViewer Desktop Build Script (Windows)
# Two-Stage Build Architecture:
#   Stage 1 (Installer): Build rvInstaller.exe only (requires: cargo)
#   Stage 2 (Bundle):    Build NSIS installer with all resources (requires: cargo, bun, uv)
#
# Usage:
#   .\build-desktop.ps1                      # Build all (Stage 1 + Stage 2)
#   .\build-desktop.ps1 -Target Installer    # Stage 1 only: build rvInstaller.exe
#   .\build-desktop.ps1 -Target Bundle       # Stage 2 only: build NSIS (requires Stage 1 output)
#   .\build-desktop.ps1 -SkipFrontend        # Skip frontend build (use existing dist)

param(
    [switch]$SkipFrontend,
    [ValidateSet('All', 'Installer', 'Bundle')]
    [string]$Target = 'All'
)

$ErrorActionPreference = "Stop"

# Load unified path configuration
. "$PSScriptRoot/paths.ps1"

Write-Host "=== redViewer Desktop Build ===" -ForegroundColor Cyan
Write-Host "Target: $Target"
Write-Host "Project Root: $ProjectRoot"
Write-Host "Deploy Dir: $DeployDir"

#region ===== Icon Generation =====

function Build-Icons {
    Write-Host "`n--- Generating Icons ---" -ForegroundColor Yellow

    $iconsDir = Join-Path $AssetsDir "icons"
    $iconPng = Join-Path $iconsDir "icon.png"
    $setupPng = Join-Path $iconsDir "setup.png"

    Push-Location (Join-Path $TauriDir "src-tauri")
    $tempDir = $null
    try {
        # Generate icon.ico/icns from icon.png
        Write-Host "Generating icons from icon.png..."
        cargo tauri icon --output $iconsDir $iconPng
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to generate icons from icon.png" -ForegroundColor Red
            exit 1
        }

        # Generate setup.ico from setup.png
        if (Test-Path $setupPng) {
            Write-Host "Generating setup icon from setup.png..."
            $tempDir = Join-Path $ProjectRoot "__temp/setup_icons_$(Get-Date -Format 'yyyyMMddHHmmss')"
            New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
            cargo tauri icon --output $tempDir $setupPng
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Failed to generate setup icon" -ForegroundColor Red
                exit 1
            }
            Copy-Item (Join-Path $tempDir "icon.ico") (Join-Path $iconsDir "setup.ico") -Force
        }
    }
    finally {
        Pop-Location
        if ($tempDir -and (Test-Path $tempDir)) {
            Remove-Item -Recurse -Force $tempDir
        }
    }

    Write-Host "Icons generated" -ForegroundColor Green
}

#endregion

#region ===== Stage 1: Build Installer =====

# Check Stage 1 dependencies (cargo only)
function Test-DependenciesStage1 {
    Write-Host "`n--- Stage 1 Dependencies Check ---" -ForegroundColor Yellow
    $missing = @()

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        $missing += "Rust (cargo)"
    }

    if ($missing.Count -gt 0) {
        Write-Host "Missing Stage 1 dependencies: $($missing -join ', ')" -ForegroundColor Red
        exit 1
    }

    Write-Host "Stage 1 dependencies OK (cargo)" -ForegroundColor Green
}

# Build rvInstaller.exe (Stage 1 core)
function Build-Installer {
    Write-Host "`n=== STAGE 1: Building rvInstaller ===" -ForegroundColor Magenta
    Push-Location $TauriDir
    try {
        Write-Host "Building rvInstaller (release)..."
        cargo build -p installer --release
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Cargo build for installer (release) failed with exit code $LASTEXITCODE"
            exit 1
        }
        $script:InstallerPath = Join-Path $TauriDir "target/release/rvInstaller.exe"

        if (-not (Test-Path $script:InstallerPath)) {
            Write-Host "rvInstaller.exe not found at: $script:InstallerPath" -ForegroundColor Red
            exit 1
        }

        Write-Host "Stage 1 Complete: $script:InstallerPath" -ForegroundColor Green
        return $script:InstallerPath
    }
    finally {
        Pop-Location
    }
}

#endregion

#region ===== Stage 2: Build Application Bundle =====

# Check Stage 2 dependencies (bun, uv)
function Test-DependenciesStage2 {
    Write-Host "`n--- Stage 2 Dependencies Check ---" -ForegroundColor Yellow
    $missing = @()

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        $missing += "Rust (cargo)"
    }

    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        $missing += "Bun"
    }

    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        $missing += "uv"
    }

    if ($missing.Count -gt 0) {
        Write-Host "Missing Stage 2 dependencies: $($missing -join ', ')" -ForegroundColor Red
        exit 1
    }

    Write-Host "Stage 2 dependencies OK (cargo, bun, uv)" -ForegroundColor Green
}

# Prepare stage directory (Stage 2 entry point)
function Initialize-Stage {
    Write-Host "`n=== STAGE 2: Preparing Stage Directory ===" -ForegroundColor Magenta

    if (Test-Path $StageDir) {
        Write-Host "Cleaning stage directory..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $StageDir
    }
    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
    Write-Host "Stage directory ready: $StageDir" -ForegroundColor Green
}

# Copy rvInstaller.exe from Stage 1 output to stage
function Copy-InstallerToStage {
    param([string]$InstallerPath)

    Write-Host "`n--- Staging rvInstaller.exe ---" -ForegroundColor Yellow

    # If path not provided, use release path
    if (-not $InstallerPath) {
        $InstallerPath = Join-Path $TauriDir "target/release/rvInstaller.exe"
    }

    if (-not (Test-Path $InstallerPath)) {
        Write-Host "rvInstaller.exe not found at: $InstallerPath" -ForegroundColor Red
        Write-Host "Run with -Target Installer first, or use -Target All" -ForegroundColor Yellow
        exit 1
    }

    $destPath = Join-Path $StageDir "rvInstaller.exe"
    Copy-Item $InstallerPath $destPath -Force
    Write-Host "Staged rvInstaller.exe: $destPath" -ForegroundColor Green
}

# Build frontend
function Build-Frontend {
    if ($SkipFrontend) {
        Write-Host "`n--- Skipping frontend build ---" -ForegroundColor Yellow
        return
    }

    Write-Host "`n--- Building Frontend ---" -ForegroundColor Yellow
    Push-Location $FrontendDir
    try {
        Write-Host "Installing dependencies..."
        bun install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Bun install failed with exit code $LASTEXITCODE"
            exit 1
        }

        Write-Host "Building production bundle..."
        bun run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Bun run build failed with exit code $LASTEXITCODE"
            exit 1
        }

        Write-Host "Frontend built successfully" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Build guide frontend (Tauri webview)
function Build-TauriFrontend {
    if ($SkipFrontend) {
        Write-Host "`n--- Skipping guide frontend build ---" -ForegroundColor Yellow
        return
    }

    Write-Host "`n--- Building Guide Frontend ---" -ForegroundColor Yellow
    Push-Location $TauriDir
    try {
        Write-Host "Installing dependencies..."
        bun install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Bun install TauriMainWin failed with exit code $LASTEXITCODE"
            exit 1
        }

        Write-Host "Building production bundle..."
        bun run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Bun run build TauriMainWin failed with exit code $LASTEXITCODE"
            exit 1
        }

        Write-Host "Guide frontend built successfully" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Copy frontend dist to stage
function Copy-FrontendDist {
    Write-Host "`n--- Staging frontend dist ---" -ForegroundColor Yellow

    $frontendDist = Join-Path $FrontendDir "dist"
    $stageDist = Join-Path $StageDir "dist"

    if (-not (Test-Path $frontendDist)) {
        Write-Host "Frontend dist not found: $frontendDist" -ForegroundColor Red
        Write-Host "Build the frontend or remove -SkipFrontend" -ForegroundColor Yellow
        exit 1
    }

    Copy-Item -Path $frontendDist -Destination $stageDist -Recurse -Force
    Write-Host "Staged frontend dist: $stageDist" -ForegroundColor Green
}

# Copy uv binary to stage (Sidecar format for Tauri externalBin)
function Copy-UvBinary {
    Write-Host "`n--- Staging uv binary (Sidecar) ---" -ForegroundColor Yellow

    $uvPath = (Get-Command uv -ErrorAction Stop).Source

    # Tauri Sidecar naming: name-target-triple.extension
    $sidecarName = "uv-x86_64-pc-windows-msvc.exe"
    $destPath = Join-Path $StageDir $sidecarName

    Copy-Item $uvPath $destPath -Force
    Write-Host "Staged uv sidecar: $destPath" -ForegroundColor Green
}

# Copy backend source code to stage
function Copy-BackendSource {
    Write-Host "`n--- Staging backend source ---" -ForegroundColor Yellow

    $stageSrc = Join-Path $StageDir "src"
    $stageBackend = Join-Path $stageSrc "backend"

    New-Item -ItemType Directory -Path $stageBackend -Force | Out-Null

    Write-Host "Copying backend source files..."
    Copy-Item -Path "$BackendDir\*" -Destination $stageBackend -Recurse -Force -Exclude @("__pycache__","*.pyc","*.pyd")

    Write-Host "Copying pyproject.toml..."
    Copy-Item -Path (Join-Path $ProjectRoot "pyproject.toml") -Destination $stageSrc -Force

    Write-Host "Staged backend source: $stageBackend" -ForegroundColor Green
}

# Copy configs from assets to stage
function Copy-PyEnvConfigs {
    Write-Host "`n--- Staging PyEnv configs ---" -ForegroundColor Yellow

    $assetsConfigs = Join-Path $AssetsDir "configs"

    if (Test-Path (Join-Path $assetsConfigs "cn.toml")) {
        Copy-Item -Path (Join-Path $assetsConfigs "cn.toml") -Destination (Join-Path $StageDir "cn.toml") -Force
        Write-Host "Staged cn.toml" -ForegroundColor Green
    }

    if (Test-Path (Join-Path $assetsConfigs "global.toml")) {
        Copy-Item -Path (Join-Path $assetsConfigs "global.toml") -Destination (Join-Path $StageDir "global.toml") -Force
        Write-Host "Staged global.toml" -ForegroundColor Green
    }

    $confSample = Join-Path $ProjectRoot "conf_sample.yml"
    if (Test-Path $confSample) {
        Copy-Item -Path $confSample -Destination (Join-Path $StageDir "conf_sample.yml") -Force
        Write-Host "Staged conf_sample.yml" -ForegroundColor Green
    }
}

# Verify resources input contract (Tier 1)
function Test-ResourcesContract {
    Write-Host "`n--- Verifying Resources Contract (Tier 1) ---" -ForegroundColor Yellow

    $verifyScript = Join-Path $TestsDir "verify-resources.ps1"

    if (-not (Test-Path $verifyScript)) {
        Write-Host "Verification script not found, skipping" -ForegroundColor Yellow
        return
    }

    try {
        & $verifyScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Resources verification failed" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "Resources verification failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Build Tauri application (from src-tauri crate directory)
function Build-Tauri {
    Write-Host "`n--- Building Tauri Application ---" -ForegroundColor Yellow
    $srcTauriDir = Join-Path $TauriDir "src-tauri"
    Push-Location $srcTauriDir
    try {
        $env:CARGO_TARGET_DIR = "$ProjectRoot/__temp/tauri_dist"
        Write-Host "Building release (output to $env:CARGO_TARGET_DIR)..."
        cargo tauri build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Cargo Tauri build (release) failed with exit code $LASTEXITCODE"
            exit 1
        }

        Write-Host "Tauri build completed" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Verify bundle contract (Tier 2)
function Test-BundleContract {
    Write-Host "`n--- Verifying Bundle Contract (Tier 2) ---" -ForegroundColor Yellow

    $verifyScript = Join-Path $TestsDir "verify-bundle.ps1"

    if (-not (Test-Path $verifyScript)) {
        Write-Host "Bundle verification script not found, skipping" -ForegroundColor Yellow
        return
    }

    try {
        & $verifyScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Bundle verification failed" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "Bundle verification failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

#endregion

#region ===== Main Execution =====

$InstallerPath = $null

# Generate icons before build
Build-Icons

# Stage 1: Build Installer
if ($Target -in @('Installer', 'All')) {
    Write-Host "`n" -NoNewline
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  STAGE 1: BUILD INSTALLER             " -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    Test-DependenciesStage1
    $InstallerPath = Build-Installer

    if ($Target -eq 'Installer') {
        Write-Host "`n=== Stage 1 Complete ===" -ForegroundColor Green
        Write-Host "Output: $InstallerPath" -ForegroundColor Yellow
        exit 0
    }
}

# Stage 2: Build Application Bundle
if ($Target -in @('Bundle', 'All')) {
    Write-Host "`n" -NoNewline
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  STAGE 2: BUILD APPLICATION BUNDLE    " -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    Test-DependenciesStage2
    Initialize-Stage

    # Stage 2 resources preparation
    Copy-InstallerToStage -InstallerPath $InstallerPath
    Build-Frontend
    Build-TauriFrontend
    Copy-FrontendDist
    Copy-UvBinary
    Copy-BackendSource
    Copy-PyEnvConfigs

    # Verify and build
    Test-ResourcesContract
    Build-Tauri

    # Release verification
    Test-BundleContract
    Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
}

#endregion

Write-Host "`n=== Build Complete ===" -ForegroundColor Green

$bundleDir = "$ProjectRoot/__temp/tauri_dist/release/bundle"
Write-Host "Release bundle location: $bundleDir" -ForegroundColor Yellow
Write-Host "  - NSIS: $bundleDir\nsis\" -ForegroundColor Cyan
