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
  # Preserve a SHA already set by CI / the caller. Sourcing .env.example would
  # otherwise overwrite it with the placeholder `dev`.
  local preset_sha="${GIT_SHA-}"
  if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "wrote .env from .env.example (local placeholders only)"
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  if [[ -n "${preset_sha}" ]]; then
    export GIT_SHA="$preset_sha"
  elif [[ -n "${GITHUB_SHA:-}" ]]; then
    export GIT_SHA="$GITHUB_SHA"
  elif [[ "${GIT_SHA:-dev}" == "dev" ]]; then
    export GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo dev)"
  fi
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
