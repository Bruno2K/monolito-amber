# Amber (`monolito-amber`)

Canonical **Modular Monolith** for Amber — BIM coordination and governance.

This repository is the real product. **`Bruno2K/amber` is the Product Vision landing only** and must never receive implementation history.

Official commercial name remains OPEN; **Amber** is the technical name.

## PF-1.1 — Identity & Organizations

AuthN floors, session-bound Organizations, invitations, closed 0.2A catalog, MFA/TOTP, and F-04 isolation evidence. **No product Project/Documents/Coordination/Planning/Gate pages.**

PF-1.0 planted the Modular Monolith layout, Prisma, catalog seed, and security stubs.

```
web/                 Next.js
api/                 NestJS Modular Monolith (/api/v1, OpenAPI 3.1)
worker/              BullMQ scaffold (Redis only when jobs enabled)
packages/shared/     Closed catalog, tenancy, scan, CAS, session policy
prisma/              Versioned migrations + 0.2A seed
docs/                Architecture, domain, security, API, development, agentic
.github/workflows/   CI gates
```

## Binding specifications

1. [System Spec + Final Reconciliation](https://app.notion.com/p/3e2678e54c8d811ab279e72355d70204)
2. [0.1 Domain Model & Module Boundaries](https://app.notion.com/p/3e2678e54c8d81d0b005cefa8156b0b6)
3. [0.2 Identity, Tenancy & Authorization](https://app.notion.com/p/3e2678e54c8d81a4b99bca837516b5b8)
4. **[0.2A Identity / AuthZ baseline](https://app.notion.com/p/3e3678e54c8d819fa690f4ade50c4e10)**
5. [0.3 Revision / Document Lifecycle](https://app.notion.com/p/3e3678e54c8d81a48d34dad1b6b60fe1)
6. [0.4 Coordination Workflow](https://app.notion.com/p/3e3678e54c8d8125ab38eb359e0586c2)
7. **[0.5 Planning, Gates & Exceptions](https://app.notion.com/p/3e3678e54c8d8134afbccdb1c1183ec3)**
8. [0.6 Persistence, Files & Async](https://app.notion.com/p/3e3678e54c8d81fb9d8cf5687a762093)
9. [0.7 API, Observability & Tests](https://app.notion.com/p/3e3678e54c8d815388d4f0d50b8c70aa)
10. [0.8 Architecture Baseline & Roadmap](https://app.notion.com/p/3e3678e54c8d81ca9c77dd2ad5439b30)

Milestone 0 Exit Gate: **PASS AT SPECIFICATION LEVEL**. See `docs/` and ADR index at `docs/architecture/decisions/README.md`.

## Non-negotiables

- Closed 0.2A permission catalog only — **no `gate.override`**
- Formal Exception is the **sole** Gate bypass
- Audit: INSERT (+SELECT); **no UPDATE/DELETE** for the app role
- Session-bound active Organization; never trust client `orgId` / `projectId`
- File `scan_status` PENDING/CLEAN/BLOCKED — **fail closed** (vendor OPEN)
- No Kubernetes, microservices, CQRS, event sourcing, or Kafka for MVP

## Quick start

See [docs/development/local-setup.md](docs/development/local-setup.md) and the agent [harness](docs/agentic/harness.md).

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```
