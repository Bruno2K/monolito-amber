#!/usr/bin/env bash
# Bring up disposable local data plane (Postgres + MinIO) and apply migrate + M3 seed.
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

need_cmd docker
need_cmd pnpm
need_cmd curl
ensure_env

echo "==> compose up postgres + minio"
"${COMPOSE[@]}" up -d postgres minio
wait_postgres

echo "==> pnpm install / prisma generate"
pnpm install --frozen-lockfile
pnpm prisma:generate

echo "==> migrate"
pnpm prisma:migrate

echo "==> catalog seed + M3 synthetic dataset"
AMBER_SEED_M3=1 pnpm prisma:seed

echo "bootstrap data plane ready"
echo "  postgres  localhost:5432  (service: postgres)"
echo "  minio     localhost:9000 / console 9001  (service: minio, bucket amber-files)"
echo "Next: scripts/local-rc/up.sh   (host API + web)  OR  docker compose --profile apps up -d --build"
