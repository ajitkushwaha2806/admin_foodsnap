#!/bin/bash
set -e

# Default ComfyUI directory
COMFY_DIR="${COMFYUI_PATH:-$HOME/ComfyUI-Installs/Comfy ui/ComfyUI}"

if [ ! -d "$COMFY_DIR" ]; then
  # Fallback checks
  if [ -d "$HOME/ComfyUI" ]; then
    COMFY_DIR="$HOME/ComfyUI"
  elif [ -d "$HOME/Library/Application Support/Comfy Desktop" ]; then
    COMFY_DIR="$HOME/Library/Application Support/Comfy Desktop"
  else
    echo "❌ ComfyUI directory not found at: $COMFY_DIR"
    echo "Please set COMFYUI_PATH environment variable to your ComfyUI directory."
    exit 1
  fi
fi

# Clean up any lingering old process holding port 8188
if lsof -Pi :8188 -sTCP:LISTEN -t >/dev/null ; then
  echo "⚠️ Port 8188 already in use. Stopping previous instance..."
  lsof -ti:8188 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "🚀 Starting ComfyUI from: $COMFY_DIR"

# Locate Python
if [ -f "$COMFY_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$COMFY_DIR/.venv/bin/python"
elif [ -f "$COMFY_DIR/venv/bin/python" ]; then
  PYTHON_BIN="$COMFY_DIR/venv/bin/python"
else
  PYTHON_BIN="$(which python3)"
fi

# Script directory & Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="${COMFYUI_SHARED:-$HOME/ComfyUI-Shared}"

EXTRA_ARGS=()

if [ -f "$SCRIPT_DIR/extra_model_paths.yaml" ]; then
  EXTRA_ARGS+=(--extra-model-paths-config "$SCRIPT_DIR/extra_model_paths.yaml")
fi

if [ -d "$SHARED_DIR/input" ]; then
  EXTRA_ARGS+=(--input-directory "$SHARED_DIR/input")
fi

if [ -d "$SHARED_DIR/output" ]; then
  EXTRA_ARGS+=(--output-directory "$SHARED_DIR/output")
fi

echo "🐍 Python executable: $PYTHON_BIN"
echo "📂 Shared Models & Storage: $SHARED_DIR"

# Optimizations for macOS / Apple Silicon
export PYTORCH_ENABLE_MPS_FALLBACK=1

cd "$COMFY_DIR"

echo "⚡ Launching ComfyUI with Apple Silicon unified memory optimizations..."
exec "$PYTHON_BIN" main.py \
  --highvram \
  --fp8_e4m3fn-text-enc \
  --preview-method none \
  --enable-cors-header \
  --listen 127.0.0.1 \
  --port 8188 \
  "${EXTRA_ARGS[@]}"


