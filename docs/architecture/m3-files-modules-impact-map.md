# M3.1 files and modules impact map

M3.1 **lands** contract artifacts, additive catalog/template deltas, and CI tests. It **does not** apply Prisma models, Nest Operations module, or Next product pages.

## KEEP (no rewrite)

| Path | Module | Note |
| --- | --- | --- |
| `prisma/schema.prisma` Foundation models | identity, org, project, document, coordination, planning, governance, audit, jobs | Historical discipline **strings** stay |
| `api/src/**` Nest controllers | Identity → Governance | No Ops CRUD |
| `web/app/**` | Foundation shell | Still no `app/projects` |
| `packages/shared/src/{authz,tenancy,governance,planning,revision,issue}* ` | PF | Unchanged semantics |
| ADR-001 … ADR-017 | Architecture | ADR-018 amends catalog additively only |
| M2 UX evidence under `docs/ux/` | Product UX | COMPLETE |

## EXTEND (this WI)

| Path | Change |
| --- | --- |
| `packages/shared/src/permissions.ts` | `operations` module + eleven codes |
| `packages/shared/src/role-templates.ts` | PROJECT_COORDINATOR + DISCIPLINE_COORDINATOR grants |
| `packages/shared/src/errors.ts` | `OperationsStateError` |
| `packages/shared/src/index.ts` | exports |
| `packages/shared/src/permissions.test.ts` | new codes present |
| `packages/shared/src/security-gate.security.test.ts` | require `operations.security.test.ts` |
| `docs/architecture/decisions/README.md` | ADR-018 |
| `docs/architecture/module-boundaries.md` | Operations row |
| `docs/domain/{domain-model,state-machines,glossary}.md` | Phase/Deliverable/WP |
| `docs/security/identity-authorization.md` | additive catalog note |
| `docs/api/conventions.md` | pointer to OpenAPI plan |
| `docs/development/{migrations,testing}.md` | plan + tests |
| `docs/README.md`, `docs/agentic/{context,state,graph,loop}.md` | M3.1 ACTIVE LOCAL ONLY; M2 COMPLETE |
| `docs/architecture/decisions/ADR-005-closed-catalog-rbac.md` | amended-by note |
| `prisma/schema.prisma` header comment | catalog is 0.2A + authorized M3.1 codes |
| `README.md` | current WI pointer |

## ADD (this WI)

| Path | Purpose |
| --- | --- |
| `docs/domain/m3-project-operations-contract.md` | Binding contract |
| `docs/architecture/decisions/ADR-018-operations-module-state-transitions.md` | Operations module ADR |
| `docs/development/m3-migration-plan.md` | Forward-only plan |
| `docs/api/m3-openapi-plan.md` | API plan |
| `docs/architecture/m3-route-map.md` | UI/API route map |
| `docs/security/m3-permission-role-template-delta.md` | AuthZ delta |
| `docs/development/m3-seed-design.md` | Seed/negatives |
| `docs/domain/m3.1-requirements-traceability.md` | REQ matrix |
| `packages/shared/src/operations.ts` | State tables / XOR / delivery |
| `packages/shared/src/operations.test.ts` | Transition tables |
| `packages/shared/src/operations.security.test.ts` | Uniqueness / no override / templates |
| `packages/shared/src/m3-routes.ts` | Route constants |
| `packages/shared/src/m3-routes.test.ts` | Collision audit |
| `packages/shared/src/m3-seed-design.ts` | Fixture spec |
| `packages/shared/src/m3-seed-design.test.ts` | Completeness |
| `packages/shared/src/m3-requirements.ts` | REQ ids |
| `packages/shared/src/m3-contract.consistency.test.ts` | Artifacts + matrix + migration hygiene |

## ADD later (not this WI)

| Path | WI |
| --- | --- |
| `prisma/migrations/<ts>_m3_operations_*` | M3.3–M3.5 |
| `api/src/operations/**` | M3.3 Phase/Discipline; M3.4–M3.5 Deliverable/WP |
| `web/app/projects/[projectId]/structure` | M3.3 |
| OpenAPI generated paths for phases/disciplines | M3.3 |
| OpenAPI generated paths for deliverables | M3.4 |
| OpenAPI generated paths for work-packages | M3.5 |
| `GET /api/v1/projects/{projectId}/hub` + Visão Geral hub UI | M3.6 |
| Task/Milestone delivery refs + `operations.deliverable_documents` + inspector context | M3.7 |
| `web/app/projects/[projectId]/work-packages` | M3.5 |
| M3.8 seed writer / E2E | M3.8 LOCAL RC |

## Runtime processes

`web`, `api`, `worker` unchanged. Bind remains `0.0.0.0:$PORT`. No new Render/Vercel service.
