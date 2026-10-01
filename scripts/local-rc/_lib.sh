#!/usr/bin/env bash
# Shared helpers for Local RC scripts. Source from sibling scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  fi
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

ensure_env() {
  if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "wrote .env from .env.example (local placeholders only)"
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  export GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
  export BUILD_ID="${BUILD_ID:-local}"
}

wait_http() {
  local url="$1"
  local attempts="${2:-60}"
  local i=0
  until curl -sf "$url" >/dev/null; do
    i=$((i + 1))
    if [[ "$i" -ge "$attempts" ]]; then
      echo "timeout waiting for $url" >&2
      return 1
    fi
    sleep 1
  done
}

wait_postgres() {
  local i=0
  until "${COMPOSE[@]}" exec -T postgres pg_isready -U amber -d amber >/dev/null 2>&1; do
    i=$((i + 1))
    if [[ "$i" -ge 60 ]]; then
      echo "timeout waiting for postgres" >&2
      return 1
    fi
    sleep 1
  done
}
