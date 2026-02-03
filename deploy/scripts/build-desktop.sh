#!/bin/bash
# redViewer Desktop Build Script (Linux/macOS)
# Two-Stage Build Architecture:
#   Stage 1 (Installer): Build rvInstaller only (requires: cargo)
#   Stage 2 (Bundle):    Build app bundle with all resources (requires: cargo, bun, uv)
#
# Usage:
#   ./build-desktop.sh                       # Build all (Stage 1 + Stage 2)
#   ./build-desktop.sh -t installer          # Stage 1 only: build rvInstaller
#   ./build-desktop.sh -t bundle             # Stage 2 only: build app (requires Stage 1 output)
#   ./build-desktop.sh -s                    # Skip frontend build

set -euo pipefail

SKIP_FRONTEND=false
TARGET="all"  # all, installer, bundle
CROSS_TARGET=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        -t|--target)
            TARGET="$2"
            shift 2
            ;;
        --cross-target)
            CROSS_TARGET="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./build-desktop.sh [-s|--skip-frontend] [-t|--target all|installer|bundle]"
            exit 1
            ;;
    esac
done

# Validate target
if [[ ! "$TARGET" =~ ^(all|installer|bundle)$ ]]; then
    echo "Invalid target: $TARGET (must be: all, installer, bundle)"
    exit 1
fi

# Calculate paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"
TAURI_DIR="$DEPLOY_DIR/tauri"
ASSETS_DIR="$DEPLOY_DIR/assets"
TESTS_DIR="$DEPLOY_DIR/tests"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
STAGE_DIR="$DEPLOY_DIR/stage"

echo "=== redViewer Desktop Build ==="
echo "Target: $TARGET"
echo "Project Root: $PROJECT_ROOT"
echo "Deploy Dir: $DEPLOY_DIR"

#region ===== Icon Generation =====

build_icons() {
    echo ""
    echo "--- Generating Icons ---"

    local icons_dir="$ASSETS_DIR/icons"
    local icon_png="$icons_dir/icon.png"
    local setup_png="$icons_dir/setup.png"
    local temp_dir=""

    # Use subshell to preserve working directory
    (
        cd "$TAURI_DIR/src-tauri" || exit 1

        # Generate icon.ico/icns from icon.png
        echo "Generating icons from icon.png..."
        if ! cargo tauri icon --output "$icons_dir" "$icon_png"; then
            echo "Failed to generate icons from icon.png"
            exit 1
        fi
    ) || exit 1

    # Generate setup.ico from setup.png (in subshell with cleanup trap)
    if [ -f "$setup_png" ]; then
        echo "Generating setup icon from setup.png..."
        temp_dir="$PROJECT_ROOT/__temp/setup_icons_$$_$(date +%s)"
        mkdir -p "$temp_dir"

        # Ensure cleanup on exit
        cleanup_temp() {
            [ -d "$temp_dir" ] && rm -rf "$temp_dir"
        }
        trap cleanup_temp EXIT

        (
            cd "$TAURI_DIR/src-tauri" || exit 1
            if ! cargo tauri icon --output "$temp_dir" "$setup_png"; then
                echo "Failed to generate setup icon"
                exit 1
            fi
        ) || exit 1

        cp "$temp_dir/icon.ico" "$icons_dir/setup.ico"
        rm -rf "$temp_dir"
        trap - EXIT
    fi

    echo "Icons generated"
}

#endregion

#region ===== Stage 1: Build Installer =====

check_dependencies_stage1() {
    echo ""
    echo "--- Stage 1 Dependencies Check ---"
    local missing=()

    if ! command -v cargo &> /dev/null; then
        missing+=("Rust (cargo)")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo "Missing Stage 1 dependencies: ${missing[*]}"
        exit 1
    fi

    echo "Stage 1 dependencies OK (cargo)"
}

build_installer() {
    echo ""
    echo "=== STAGE 1: Building rvInstaller ==="
    cd "$TAURI_DIR"

    echo "Building rvInstaller (release)..."
    if [ "$CROSS_TARGET" = "universal-apple-darwin" ]; then
        # Universal Binary: build both architectures and lipo merge
        echo "Building universal binary (x86_64 + arm64)..."
        cargo build -p installer --release --target x86_64-apple-darwin
        cargo build -p installer --release --target aarch64-apple-darwin

        local x86_path="$TAURI_DIR/target/x86_64-apple-darwin/release/rvInstaller"
        local arm_path="$TAURI_DIR/target/aarch64-apple-darwin/release/rvInstaller"
        local universal_dir="$TAURI_DIR/target/universal-apple-darwin/release"
        mkdir -p "$universal_dir"
        INSTALLER_PATH="$universal_dir/rvInstaller"

        lipo -create "$x86_path" "$arm_path" -output "$INSTALLER_PATH"
        echo "Created universal binary: $INSTALLER_PATH"
    elif [ -n "$CROSS_TARGET" ]; then
        cargo build -p installer --release --target "$CROSS_TARGET"
        INSTALLER_PATH="$TAURI_DIR/target/$CROSS_TARGET/release/rvInstaller"
    else
        cargo build -p installer --release
        INSTALLER_PATH="$TAURI_DIR/target/release/rvInstaller"
    fi

    if [ ! -f "$INSTALLER_PATH" ]; then
        echo "rvInstaller not found at: $INSTALLER_PATH"
        exit 1
    fi

    echo "Stage 1 Complete: $INSTALLER_PATH"
}

#endregion

#region ===== Stage 2: Build Application Bundle =====

check_dependencies_stage2() {
    echo ""
    echo "--- Stage 2 Dependencies Check ---"
    local missing=()

    if ! command -v cargo &> /dev/null; then
        missing+=("Rust (cargo)")
    fi

    if ! command -v bun &> /dev/null; then
        missing+=("Bun")
    fi

    if ! command -v uv &> /dev/null; then
        missing+=("uv")
    fi

    if ! command -v rsync &> /dev/null; then
        missing+=("rsync")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo "Missing Stage 2 dependencies: ${missing[*]}"
        exit 1
    fi

    echo "Stage 2 dependencies OK (cargo, bun, uv, rsync)"
}

initialize_stage() {
    echo ""
    echo "=== STAGE 2: Preparing Stage Directory ==="
    rm -rf "$STAGE_DIR"
    mkdir -p "$STAGE_DIR"
    echo "Stage directory ready: $STAGE_DIR"
}

copy_installer_to_stage() {
    echo ""
    echo "--- Staging rvInstaller ---"

    local installer_path="$INSTALLER_PATH"

    # If path not set, use release path
    if [ -z "$installer_path" ]; then
        installer_path="$TAURI_DIR/target/release/rvInstaller"
    fi

    if [ ! -f "$installer_path" ]; then
        echo "rvInstaller not found at: $installer_path"
        echo "Run with -t installer first, or use -t all"
        exit 1
    fi

    cp "$installer_path" "$STAGE_DIR/rvInstaller"
    chmod +x "$STAGE_DIR/rvInstaller"
    echo "Staged rvInstaller: $STAGE_DIR/rvInstaller"
}

build_frontend() {
    if [ "$SKIP_FRONTEND" = true ]; then
        echo ""
        echo "--- Skipping frontend build ---"
        return
    fi

    echo ""
    echo "--- Building Frontend ---"
    cd "$FRONTEND_DIR"

    echo "Installing dependencies..."
    bun install

    echo "Building production bundle..."
    bun run build

    echo "Frontend built successfully"
}

build_tauri_frontend() {
    if [ "$SKIP_FRONTEND" = true ]; then
        echo ""
        echo "--- Skipping Tauri frontend build ---"
        return
    fi

    echo ""
    echo "--- Building Tauri Frontend ---"
    cd "$TAURI_DIR"

    echo "Installing dependencies..."
    bun install

    echo "Building production bundle..."
    bun run build

    echo "Tauri frontend built successfully"
}

copy_frontend_dist() {
    echo ""
    echo "--- Staging frontend dist ---"

    local frontend_dist="$FRONTEND_DIR/dist"
    local stage_dist="$STAGE_DIR/dist"

    if [ ! -d "$frontend_dist" ]; then
        echo "Frontend dist not found: $frontend_dist"
        echo "Build the frontend or remove --skip-frontend"
        exit 1
    fi

    cp -r "$frontend_dist" "$stage_dist"
    echo "Staged frontend dist: $stage_dist"
}

copy_uv_binary() {
    echo ""
    echo "--- Staging uv binary (Sidecar) ---"

    local uv_path
    uv_path=$(command -v uv)
    local os_type="$(uname -s)"
    local arch="$(uname -m)"

    if [ "$CROSS_TARGET" = "universal-apple-darwin" ] && [ "$os_type" = "Darwin" ]; then
        # Universal Binary: create fat binary with lipo
        echo "Staging uv for universal binary..."

        # Get uv version (handle prerelease versions)
        local uv_version
        uv_version=$(uv --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+([a-z0-9.-]*)?')

        local base_url="https://github.com/astral-sh/uv/releases/download/${uv_version}"
        local x86_archive="uv-x86_64-apple-darwin.tar.gz"
        local arm_archive="uv-aarch64-apple-darwin.tar.gz"

        local temp_dir="$PROJECT_ROOT/__temp/uv_download_$$"
        mkdir -p "$temp_dir"

        echo "Downloading uv binaries (version $uv_version)..."

        # Download both archives
        local download_success=true
        if ! curl -sfL "$base_url/$x86_archive" | tar -xz -C "$temp_dir" 2>/dev/null; then
            echo "Warning: Failed to download x86_64 uv binary"
            download_success=false
        fi
        if ! curl -sfL "$base_url/$arm_archive" | tar -xz -C "$temp_dir" 2>/dev/null; then
            echo "Warning: Failed to download arm64 uv binary"
            download_success=false
        fi

        if [ "$download_success" = false ]; then
            # Fallback: use host uv binary
            echo "Warning: Download failed, using host binary"
            cp "$uv_path" "$STAGE_DIR/uv-universal-apple-darwin"
            chmod +x "$STAGE_DIR/uv-universal-apple-darwin"
            rm -rf "$temp_dir"
            return
        fi

        # Create universal binary with lipo
        echo "Creating universal binary with lipo..."
        lipo -create \
            "$temp_dir/uv-x86_64-apple-darwin/uv" \
            "$temp_dir/uv-aarch64-apple-darwin/uv" \
            -output "$STAGE_DIR/uv-universal-apple-darwin"
        chmod +x "$STAGE_DIR/uv-universal-apple-darwin"

        rm -rf "$temp_dir"
        echo "Staged uv sidecar: uv-universal-apple-darwin"
        return
    fi

    # Single architecture: detect target triple
    local target_triple=""
    case "$os_type" in
        Linux)
            target_triple="x86_64-unknown-linux-gnu"
            ;;
        Darwin)
            if [ "$arch" = "arm64" ] || [ "$arch" = "aarch64" ]; then
                target_triple="aarch64-apple-darwin"
            else
                target_triple="x86_64-apple-darwin"
            fi
            ;;
        *)
            echo "Unknown OS: $os_type, using generic naming"
            target_triple="unknown"
            ;;
    esac

    local sidecar_name="uv-${target_triple}"
    local dest_path="$STAGE_DIR/$sidecar_name"

    cp "$uv_path" "$dest_path"
    chmod +x "$dest_path"
    echo "Staged uv sidecar: $dest_path"
}

copy_backend_source() {
    echo ""
    echo "--- Staging backend source ---"

    local stage_src="$STAGE_DIR/src"
    local stage_backend="$stage_src/backend"

    mkdir -p "$stage_backend"

    echo "Copying backend source files..."
    rsync -av --exclude='__pycache__' --exclude='*.pyc' --exclude='*.pyd' \
        "$BACKEND_DIR/" "$stage_backend/"

    echo "Copying pyproject.toml..."
    cp "$PROJECT_ROOT/pyproject.toml" "$stage_src/"

    echo "Staged backend source: $stage_backend"
}

copy_pyenv_configs() {
    echo ""
    echo "--- Staging PyEnv configs ---"

    local assets_configs="$ASSETS_DIR/configs"

    if [ -f "$assets_configs/cn.toml" ]; then
        cp "$assets_configs/cn.toml" "$STAGE_DIR/cn.toml"
        echo "Staged cn.toml"
    fi

    if [ -f "$assets_configs/global.toml" ]; then
        cp "$assets_configs/global.toml" "$STAGE_DIR/global.toml"
        echo "Staged global.toml"
    fi

    if [ -f "$PROJECT_ROOT/conf_sample.yml" ]; then
        cp "$PROJECT_ROOT/conf_sample.yml" "$STAGE_DIR/conf_sample.yml"
        echo "Staged conf_sample.yml"
    fi
}

verify_resources_contract() {
    echo ""
    echo "--- Verifying Resources Contract (Tier 1) ---"
    local verify_script="$TESTS_DIR/verify-resources.sh"

    if [ -f "$verify_script" ]; then
        bash "$verify_script"
    else
        echo "Verification script not found, skipping"
    fi
}

build_tauri() {
    echo ""
    echo "--- Building Tauri Application ---"
    cd "$TAURI_DIR/src-tauri"

    local target_dir="$PROJECT_ROOT/__temp/tauri_dist"
    echo "Building release (output to $target_dir)..."
    if [ -n "$CROSS_TARGET" ]; then
        CARGO_TARGET_DIR="$target_dir" cargo tauri build --target "$CROSS_TARGET"
    else
        CARGO_TARGET_DIR="$target_dir" cargo tauri build
    fi

    echo "Tauri build completed"
}

verify_bundle_contract() {
    echo ""
    echo "--- Verifying Bundle Contract (Tier 2) ---"
    local verify_script="$TESTS_DIR/verify-bundle.sh"

    if [ -f "$verify_script" ]; then
        bash "$verify_script"
    else
        echo "Bundle verification script not found, skipping"
    fi
}

#endregion

#region ===== Main Execution =====

INSTALLER_PATH=""

# Generate icons before build
build_icons

# Stage 1: Build Installer
if [[ "$TARGET" == "installer" || "$TARGET" == "all" ]]; then
    echo ""
    echo "========================================"
    echo "  STAGE 1: BUILD INSTALLER             "
    echo "========================================"

    check_dependencies_stage1
    build_installer

    if [ "$TARGET" == "installer" ]; then
        echo ""
        echo "=== Stage 1 Complete ==="
        echo "Output: $INSTALLER_PATH"
        exit 0
    fi
fi

# Stage 2: Build Application Bundle
if [[ "$TARGET" == "bundle" || "$TARGET" == "all" ]]; then
    echo ""
    echo "========================================"
    echo "  STAGE 2: BUILD APPLICATION BUNDLE    "
    echo "========================================"

    check_dependencies_stage2
    initialize_stage

    # Stage 2 resources preparation
    copy_installer_to_stage
    build_frontend
    build_tauri_frontend
    copy_frontend_dist
    copy_uv_binary
    copy_backend_source
    copy_pyenv_configs

    # Verify and build
    verify_resources_contract
    build_tauri

    # Release verification
    verify_bundle_contract
fi

#endregion

echo ""
echo "=== Build Complete ==="
echo "Release bundles location: $PROJECT_ROOT/__temp/tauri_dist/release/bundle/"
