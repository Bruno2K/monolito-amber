#!/usr/bin/env bash
# Stop host-run API + web started by up.sh. Compose data plane is left running.
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

stop_pidfile() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

stop_pidfile .data/local-rc/api.pid
stop_pidfile .data/local-rc/web.pid
# Nest/Next spawn children; best-effort cleanup of listeners on the RC ports.
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3001/tcp 2>/dev/null || true
  fuser -k 3000/tcp 2>/dev/null || true
fi
echo "host API/web stopped (postgres + minio still up)"
