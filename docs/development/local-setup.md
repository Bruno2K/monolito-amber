# Local setup

Requires Node 22+ and pnpm 10. PostgreSQL 16 is required for migrations/seed. Docker Compose is the documented path for Postgres + MinIO; Redis uses profile `jobs` (off by default). For the M3 Local RC pack (real API + seed + Playwright), follow [m3.8-local-rc-runbook.md](./m3.8-local-rc-runbook.md). On Windows, follow [m3-windows-local-rc.md](./m3-windows-local-rc.md) (WSL2; native Next.js is not supported).

```bash
cp .env.example .env
# If Docker is available:
docker compose up -d postgres minio
# Or use a local PostgreSQL 16 matching DATABASE_URL in .env

pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
# M3 synthetic dataset (Local RC / homologation):
AMBER_SEED_M3=1 pnpm prisma:seed
pnpm --filter @amber/api start:dev   # 0.0.0.0:3001
pnpm --filter @amber/web dev         # 0.0.0.0:3000
# Worker is idle unless REDIS_URL is set. Local RC does not start Redis.
```

Health: `curl -s http://127.0.0.1:3001/api/v1/health`  
Readiness: `curl -s http://127.0.0.1:3001/api/v1/ready`

See [testing](./testing.md) and [migrations](./migrations.md). Exact agent commands: [harness](../agentic/harness.md). Compose service names/ports are listed in the runbook.
