#!/usr/bin/env bash
# Discard local RC volumes and re-bootstrap migrate + M3 seed.
# LOCAL ONLY. This destroys the disposable Postgres/MinIO volumes.
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

need_cmd docker
ensure_env

"${ROOT}/scripts/local-rc/down.sh" || true

echo "==> compose down + volumes"
"${COMPOSE[@]}" --profile apps --profile jobs down -v --remove-orphans || "${COMPOSE[@]}" down -v --remove-orphans

rm -rf .data/local-rc

echo "==> re-bootstrap"
exec "${ROOT}/scripts/local-rc/bootstrap.sh"
