#!/bin/bash
# macOS DMG Post-Install Script
# Copies backend source to Application Support and initializes Python environment
set -e

APP_SUPPORT="$HOME/Library/Application Support/redViewer"
BACKEND_DIR="$APP_SUPPORT/backend"
APP_RESOURCES="/Applications/redViewer.app/Contents/Resources"

echo "redViewer Post-Install Setup"
echo "============================"

# Check if app is installed
if [ ! -d "$APP_RESOURCES" ]; then
    echo "Error: redViewer.app not found in /Applications"
    echo "Please install the application first by dragging it to Applications folder."
    exit 1
fi

# Check if backend source exists in app bundle
if [ ! -d "$APP_RESOURCES/res/src" ]; then
    echo "Error: Backend source not found in app bundle"
    exit 1
fi

# Create Application Support directory
mkdir -p "$BACKEND_DIR"

# Copy backend source (use rsync to preserve dotfiles)
echo "Copying backend source to $BACKEND_DIR..."
if command -v rsync &> /dev/null; then
    rsync -a "$APP_RESOURCES/res/src/" "$BACKEND_DIR/"
else
    # Fallback: use cp with dot notation to include hidden files
    cp -R "$APP_RESOURCES/res/src/." "$BACKEND_DIR/"
fi

# Check for uv binary
UV_PATH="$APP_RESOURCES/uv"
if [ ! -f "$UV_PATH" ]; then
    echo "Error: uv binary not found in app bundle"
    exit 1
fi

# Run uv sync to create virtual environment
echo "Installing Python dependencies..."
"$UV_PATH" sync --project "$BACKEND_DIR"

echo ""
echo "Installation complete!"
echo "You can now launch redViewer from Applications."
