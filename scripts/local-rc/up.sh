#!/usr/bin/env bash
# Start host-run API + web against the compose data plane.
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

need_cmd pnpm
need_cmd curl
ensure_env
wait_postgres

mkdir -p .data/objects

export GIT_SHA="${GIT_SHA:-$(git rev-parse HEAD)}"
export BUILD_ID="${BUILD_ID:-local}"
export REDIS_URL="${REDIS_URL:-}"
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:3001}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3001}"

mkdir -p .data/local-rc
if [[ -f .data/local-rc/api.pid ]] || [[ -f .data/local-rc/web.pid ]]; then
  echo "existing pid files in .data/local-rc — run scripts/local-rc/down.sh first" >&2
  exit 1
fi

echo "==> API on 0.0.0.0:${API_PORT:-3001}"
pnpm --filter @amber/api start:dev >.data/local-rc/api.log 2>&1 &
echo $! >.data/local-rc/api.pid

echo "==> web on 0.0.0.0:${WEB_PORT:-3000}"
pnpm --filter @amber/web dev >.data/local-rc/web.log 2>&1 &
echo $! >.data/local-rc/web.pid

wait_http "http://127.0.0.1:${API_PORT:-3001}/api/v1/health" 90
wait_http "http://127.0.0.1:${API_PORT:-3001}/api/v1/ready" 30
wait_http "http://127.0.0.1:${WEB_PORT:-3000}" 90

echo "host stack ready"
echo "  web  http://127.0.0.1:${WEB_PORT:-3000}  (service: web)"
echo "  api  http://127.0.0.1:${API_PORT:-3001}  (service: api)"
echo "  health  $(curl -s http://127.0.0.1:${API_PORT:-3001}/api/v1/health)"
echo "  ready   $(curl -s http://127.0.0.1:${API_PORT:-3001}/api/v1/ready)"
echo "logs: .data/local-rc/api.log  .data/local-rc/web.log"
