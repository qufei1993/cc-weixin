#!/usr/bin/env bash
# Start Codex App Server + Weixin bridge in one command.
# Usage: ./start-codex.sh [ws://127.0.0.1:4500]

set -e

WS_URL="${1:-ws://127.0.0.1:4500}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[weixin] Starting Codex App Server at $WS_URL..."
codex app-server --listen "$WS_URL" &
APP_SERVER_PID=$!

# Wait for app-server to be ready
for i in $(seq 1 20); do
  sleep 0.5
  HTTP_URL="${WS_URL/ws:\/\//http://}"
  if curl -sf "${HTTP_URL}/healthz" > /dev/null 2>&1; then
    echo "[weixin] App Server ready."
    break
  fi
  if [ $i -eq 20 ]; then
    echo "[weixin] App Server did not start in time." >&2
    kill $APP_SERVER_PID 2>/dev/null
    exit 1
  fi
done

echo "[weixin] Starting Weixin bridge..."
CODEX_WS_URL="$WS_URL" bun "$SCRIPT_DIR/server-codex.ts"

# If bridge exits, stop app-server too
kill $APP_SERVER_PID 2>/dev/null
