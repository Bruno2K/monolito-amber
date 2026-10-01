# Harness

Exact commands for this repository. Run from the repo root with Node 22 and pnpm 10.

Integration tests use Testcontainers when Docker is available. In Cloud Agent / VMs without a Docker daemon, create a local database and export `TEST_DATABASE_URL` first.

```bash
# --- one-time local Postgres (agent VM without Docker) ---
sudo pg_ctlcluster 16 main start || true
sudo -u postgres psql -c "CREATE USER amber WITH PASSWORD 'amber' SUPERUSER;" || true
sudo -u postgres psql -c "CREATE DATABASE amber OWNER amber;" || true
sudo -u postgres psql -c "CREATE DATABASE amber_test OWNER amber;" || true
export DATABASE_URL=postgresql://amber:amber@127.0.0.1:5432/amber
export TEST_DATABASE_URL=postgresql://amber:amber@127.0.0.1:5432/amber_test
export SKIP_DB=1

# --- install ---
pnpm install --frozen-lockfile

# --- generate client ---
pnpm prisma:generate

# --- migrate + seed (primary DB) ---
pnpm prisma:migrate
pnpm prisma:seed

# --- migrate test DB for integration ---
DATABASE_URL="$TEST_DATABASE_URL" pnpm prisma:migrate

# --- quality gates (must pass) ---
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:security
pnpm test:integration
pnpm assert:no-gate-override
pnpm build
SKIP_DB=1 pnpm openapi:generate
pnpm openapi:validate
pnpm prisma:validate

# --- local smoke ---
# API health + ready (start, curl, stop)
SKIP_DB=1 PORT=3001 GIT_SHA="$(git rev-parse HEAD)" node api/dist/main.js &
API_PID=$!
sleep 2
curl -sf http://127.0.0.1:3001/api/v1/health
curl -sf http://127.0.0.1:3001/api/v1/ready
kill $API_PID
```

M3 Local RC (real Postgres + MinIO + seed + Playwright): [m3.8-local-rc-runbook.md](../development/m3.8-local-rc-runbook.md). Windows: [m3-windows-local-rc.md](../development/m3-windows-local-rc.md). RC1 evidence: [m3-rc1-evidence/INDEX.md](../development/m3-rc1-evidence/INDEX.md).

`pnpm --filter @amber/web build` is included in `pnpm build`.

CI jobs: **Foundation & Security Gates** (lint, typecheck, unit, security, no-gate-override, integration, build, OpenAPI, Prisma validate) and **Local RC (real API + Postgres + MinIO)** (migrate + M3 seed + reset rehearsal + Playwright local-rc including axe).

Suites in this repository cover PF-1.0 through PF-1.6 plus M3.1 contract tests: identity/tenancy/MFA, ProjectMembership / contextual RBAC, Document/Revision, Coordination/Impact, Planning Task/Milestone, Governance Gate/Exception (Tests A–I), and Operations catalog/state/route/seed consistency. The security-gate test fails closed if those files are missing or skipped.
