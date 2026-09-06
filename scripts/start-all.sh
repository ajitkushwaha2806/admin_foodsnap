#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================================="
echo "🚀 FoodSnap AI Studio - Standalone Terminal Launcher"
echo "=========================================================="

# Cleanup handler on exit (Ctrl + C)
cleanup() {
  echo ""
  echo "🛑 Stopping all FoodSnap services..."
  if [ -n "$COMFY_PID" ]; then
    kill "$COMFY_PID" 2>/dev/null || true
  fi
  if [ -n "$NEXT_PID" ]; then
    kill "$NEXT_PID" 2>/dev/null || true
  fi
  lsof -ti:8188 | xargs kill -9 2>/dev/null || true
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  echo "✓ All services stopped. RAM released."
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Clean up lingering ports
if lsof -Pi :8188 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo "⚠️ Port 8188 is in use. Stopping previous instance..."
  lsof -ti:8188 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo "⚠️ Port 3000 is in use. Stopping previous instance..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# 2. Launch ComfyUI
echo "⚡ [1/2] Starting ComfyUI backend..."
bash "$SCRIPT_DIR/start-comfy.sh" &
COMFY_PID=$!

echo "⏳ Waiting for ComfyUI to initialize..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8188/system_stats >/dev/null 2>&1; then
    echo "✓ ComfyUI ready on http://127.0.0.1:8188"
    break
  fi
  sleep 1
done

# 3. Launch Next.js in ultra-low RAM production mode
echo "🌐 [2/2] Starting FoodSnap Next.js Frontend (Production Mode)..."
cd "$ROOT_DIR"

if [ ! -d ".next" ]; then
  echo "📦 Building Next.js bundle for fast startup..."
  npm run build
fi

npm run start &
NEXT_PID=$!

sleep 2
echo "=========================================================="
echo "✨ FoodSnap Studio is RUNNING:"
echo "   👉 Frontend: http://localhost:3000/processor"
echo "   👉 Backend:  http://127.0.0.1:8188"
echo "   (Press Ctrl + C at any time to stop both and free RAM)"
echo "=========================================================="

# Automatically open browser
open "http://localhost:3000/processor" 2>/dev/null || true

# Wait for processes
wait
