# Local setup

Requires Node 22+ and pnpm 10. PostgreSQL 16 is required for migrations/seed. Docker Compose is the documented path for Postgres + MinIO; Redis uses profile `jobs`.

```bash
cp .env.example .env
# If Docker is available:
docker compose up -d postgres minio
# Or use a local PostgreSQL 16 matching DATABASE_URL in .env

pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm --filter @amber/api start:dev   # 0.0.0.0:3001
pnpm --filter @amber/web dev         # 0.0.0.0:3000
pnpm --filter @amber/worker start    # idle unless REDIS_URL is set
```

Health check: `curl -s http://127.0.0.1:3001/api/v1/health`

See [testing](./testing.md) and [migrations](./migrations.md). Exact agent commands: [harness](../agentic/harness.md).
