# M3.1 route map

Product IA for M3. M3.2 mounts the authenticated shell and `/projects` context. M3.3 fills `/projects/:projectId/structure`. Figma `fkE9SwcNlQG7m0HvcGQBw9` is reference evidence (M2 Portuguese prototype paths). Collision audit: `packages/shared/src/m3-routes.test.ts`.

## Canonical product routes (M3)

| Path | Surface | AuthZ | Implements |
| --- | --- | --- | --- |
| `/projects` | Visible Projects | session + ACTIVE ProjectMembership | M3.2 |
| `/projects/:projectId/overview` | Visão Geral / Project Hub | `project.read` on that Project | M3.2 shell; **M3.6 hub data** |
| `/projects/:projectId/structure` | Phase + Discipline context | `project.read`; mutations `phase.*` / catalogs | M3.3 |
| `/projects/:projectId/deliverables` | Entregas list | `project.read`; mutations `deliverable.*` | M3.4 |
| `/projects/:projectId/work-packages` | WorkPackage list | `project.read`; mutations `work_package.*` | M3.5 |
| inspector / deep-link query on deliverables and work-packages | Detail without colliding sibling routes | re-authorize at destination | M3.4–M3.5 |

Deep links re-authorize. Inaccessible resources are omitted without hidden counts.

## Reserved (do not implement in M3)

| Path | Milestone |
| --- | --- |
| `/projects/:projectId/planner` | M4 |
| Figma `/planejamento` as a product route | M4 |
| `/calendarios`, `/mensagens`, `/equipe`, `/workload`, `/gates`, `/excecoes` as production Next routes | M5–M7 |

## Figma prototype → product

| Figma path | Product path | Disposition |
| --- | --- | --- |
| `/visao-geral` | `/projects/:projectId/overview` | EXTEND (English product IA) |
| `/portfolio` | `/projects` | EXTEND |
| `/entregas` | `/projects/:projectId/deliverables` | EXTEND |
| `/planejamento` | none in M3 | reserved M4 |
| other M2.3–M2.8 PT paths | none in M3 | later milestones |

Do **not** ship both `/visao-geral` and `/projects/:projectId/overview` as parallel product routes (no second IA).

## Foundation UI (KEEP)

`/`, `/sign-in`, `/password/setup`, `/password/reset`, `/mfa/challenge`, `/mfa/enroll`, `/org-switch`, `/invite/accept`.

Collision audit: `packages/shared/src/m3-routes.test.ts` asserts canonical paths are unique, M3.2 Next routes exist, Figma Portuguese prototype paths are absent, M3.3 Phase/Discipline API paths are present, M3.4 Deliverable API paths are present, and M3.5 WorkPackage API and UI paths are present.

## API pairing

UI `/projects` → KEEP `GET /api/v1/projects`. Nested product pages pair with `/api/v1/projects/{projectId}/phases|deliverables|work-packages` and the M3.6 derived hub `GET /api/v1/projects/{projectId}/hub` (see [OpenAPI plan](../api/m3-openapi-plan.md)).
