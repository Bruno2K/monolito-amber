# Architecture overview

Amber is a **Modular Monolith**: one monorepo, three processes, one PostgreSQL database, S3-compatible object storage.

```
browser → web (Next.js)
            ↓
          api (NestJS Modular Monolith) → PostgreSQL (schema-per-module)
            ↓                             → MinIO / S3 (SSE, private buckets)
       jobs.outbox_messages
            ↓
          worker (BullMQ) → Redis only when jobs are enabled
```

OpenTelemetry hooks and structured JSON logs run on `api` and `worker` from day one. Correlation IDs (`X-Correlation-Id`) propagate to logs, traces, audit, and outbox.

## Processes

| Process | Role | Bind |
| --- | --- | --- |
| `web` | Next.js UI | `0.0.0.0:$PORT` |
| `api` | NestJS HTTP `/api/v1` | `0.0.0.0:$PORT` |
| `worker` | BullMQ consumers (scaffold until REDIS_URL) | health on `0.0.0.0:$PORT` |

## Persistence

One PostgreSQL instance. Module namespaces: `identity`, `org`, `project`, `document`, `coordination`, `audit`, `jobs` (later `planning`, `governance`, `notification`). Versioned Prisma migrations only.

## Async

Transactional outbox in the same PostgreSQL transaction as the domain write. PF-1.4 drains `CurrentRevisionChanged` / `NewBaseEstablished` in-process in that transaction (ADR-015). Redis + BullMQ when the first justified job ships (notifications, email, malware scan). No Kafka / SQS / Rabbit / event sourcing / CQRS.

## Hosting

Local: Docker Compose (Postgres + MinIO; Redis profile `jobs`). MVP host is a single VM or PaaS (vendor OPEN). Kubernetes is out.

See [module boundaries](./module-boundaries.md) and [decisions](./decisions/README.md).
