#!/usr/bin/env bash
# Apply the full existing migration chain, plant representative pre-M4
# operational + Planning rows, then re-seed the current tip. Asserts that
# M3 IDs and the pre-M4 Task survive. LOCAL ONLY. No new DDL.
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib.sh"

need_cmd pnpm
ensure_env

SHA="${GIT_SHA:-${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}}"
export GIT_SHA="$SHA"
OUT_DIR="${ROOT}/docs/development/m4.8-evidence"
mkdir -p "$OUT_DIR"
LOG="${OUT_DIR}/upgrade-rehearsal.log"

{
  echo "M4.8 Local RC upgrade rehearsal"
  echo "candidate_sha=${SHA}"
  echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "database_url_host=$(node -e "try{const u=new URL(process.env.DATABASE_URL);console.log(u.host)}catch{console.log('unset')}")"
  echo "migrations=existing forward-only chain (no M4.8 DDL)"
} | tee "$LOG"

echo "==> prisma migrate reset --force --skip-seed" | tee -a "$LOG"
pnpm exec prisma migrate reset --force --skip-seed | tee -a "$LOG"

echo "==> prisma migrate deploy (full chain from init)" | tee -a "$LOG"
pnpm prisma:migrate | tee -a "$LOG"

echo "==> AMBER_SEED_M3=1 prisma:seed (M3 operational + M4 planning fixtures)" | tee -a "$LOG"
AMBER_SEED_M3=1 pnpm prisma:seed | tee -a "$LOG"

echo "==> insert representative pre-M4 activation Task" | tee -a "$LOG"
pnpm exec tsx "${ROOT}/scripts/local-rc/insert-pre-m4-activation.ts" | tee -a "$LOG"

echo "==> re-seed current tip (must not wipe pre-M4 or M3 ids)" | tee -a "$LOG"
AMBER_SEED_M3=1 pnpm prisma:seed | tee -a "$LOG"

echo "==> assert deterministic seed IDs + M4 fixtures" | tee -a "$LOG"
AMBER_REQUIRE_PRE_M4=1 pnpm exec tsx "${ROOT}/scripts/local-rc/assert-seed-dataset.ts" | tee -a "$LOG"

if ! grep -q "pre_m4_activation_present=yes" "$LOG"; then
  echo "pre-M4 activation Task was not preserved" >&2
  exit 1
fi

{
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "status=ok"
  echo "candidate_sha=${SHA}"
} | tee -a "$LOG"

echo "upgrade rehearsal evidence: $LOG"
