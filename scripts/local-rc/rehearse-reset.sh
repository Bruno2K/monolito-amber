#!/usr/bin/env bash
# Reset → migrate → seed from the current SHA. Asserts the M3 + M4 synthetic
# dataset returns with the same deterministic IDs and that a pre-M4 Task
# survives re-seed. LOCAL ONLY.
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

need_cmd pnpm
ensure_env

SHA="${GIT_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}}"
export GIT_SHA="$SHA"
OUT_DIR="${ROOT}/docs/development/m3-rc1-evidence"
mkdir -p "$OUT_DIR"
LOG="${OUT_DIR}/reset-rehearsal.log"

{
  echo "M3 Local RC reset rehearsal"
  echo "candidate_sha=${SHA}"
  echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "database_url_host=$(node -e "try{const u=new URL(process.env.DATABASE_URL);console.log(u.host)}catch{console.log('unset')}")"
} | tee "$LOG"

echo "==> prisma migrate reset --force --skip-seed" | tee -a "$LOG"
pnpm exec prisma migrate reset --force --skip-seed | tee -a "$LOG"

echo "==> prisma migrate deploy" | tee -a "$LOG"
pnpm prisma:migrate | tee -a "$LOG"

echo "==> AMBER_SEED_M3=1 prisma:seed" | tee -a "$LOG"
AMBER_SEED_M3=1 AMBER_ALLOW_DEMO_SEED=1 pnpm prisma:seed | tee -a "$LOG"

echo "==> insert representative pre-M4 activation Task" | tee -a "$LOG"
pnpm exec tsx "${ROOT}/scripts/local-rc/insert-pre-m4-activation.ts" | tee -a "$LOG"

echo "==> re-seed current tip (must keep pre-M4 + M3 ids)" | tee -a "$LOG"
AMBER_SEED_M3=1 AMBER_ALLOW_DEMO_SEED=1 pnpm prisma:seed | tee -a "$LOG"

echo "==> assert deterministic seed IDs" | tee -a "$LOG"
AMBER_REQUIRE_PRE_M4=1 pnpm exec tsx "${ROOT}/scripts/local-rc/assert-seed-dataset.ts" | tee -a "$LOG"

{
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "status=ok"
  echo "candidate_sha=${SHA}"
} | tee -a "$LOG"

echo "reset rehearsal evidence: $LOG"
