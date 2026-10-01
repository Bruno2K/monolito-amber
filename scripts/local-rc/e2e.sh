#!/usr/bin/env bash
# Playwright against the REAL local stack (not mock-api).
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

need_cmd pnpm
ensure_env

API="${API_INTERNAL_URL:-http://127.0.0.1:3001}"
wait_http "$API/api/v1/ready" 30
wait_http "http://127.0.0.1:${WEB_PORT:-3000}" 30

export AMBER_E2E_EXTERNAL_STACK=1
export GIT_SHA="${GIT_SHA:-$(git rev-parse HEAD)}"
pnpm --filter @amber/web exec playwright install chromium
pnpm --filter @amber/web test:e2e:local-rc
