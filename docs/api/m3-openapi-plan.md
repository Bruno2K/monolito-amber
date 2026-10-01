# M3.1 OpenAPI plan

**Status:** Plan only. Nest decorators and `api/openapi/openapi.json` are **not** expanded in this WI (ADR-004 still requires generate-from-code when APIs land).

Prefix remains `/api/v1`. Errors remain RFC 7807 Problem Details with `correlationId`. Path `organizationId` / `projectId` are routing hints; session + membership is authoritative (F-04).

## KEEP

All current Identity, Organizations, Projects, Documents, Coordination, Planning, Governance, catalog, and file-trust paths.

Especially KEEP:

| Method | Path | Note |
| --- | --- | --- |
| GET | `/api/v1/projects` | Caller’s ACTIVE ProjectMemberships — UI `/projects` reads this |
| GET | `/api/v1/projects/{projectId}` | Project read |
| GET | `/api/v1/catalog/permissions` | Closed catalog including M3.1 additive codes after seed |
| GET | `/api/v1/catalog/role-templates` | Templates including additive grants |

## ADD (M3.3–M3.5)

Planned operations (collision-tested against today’s OpenAPI; none of these paths exist yet):

| Method | Path | Permission | Idempotency-Key |
| --- | --- | --- | --- |
| GET | `/api/v1/organizations/{organizationId}/disciplines` | `organization.manage_catalogs` or `project.read` in that org | no |
| POST | `/api/v1/organizations/{organizationId}/disciplines` | `organization.manage_catalogs` | yes |
| PATCH | `/api/v1/organizations/{organizationId}/disciplines/{disciplineId}` | `organization.manage_catalogs` | no |
| GET/POST | `/api/v1/projects/{projectId}/phases` | `project.read` / `phase.create` | POST yes |
| GET/PATCH | `/api/v1/projects/{projectId}/phases/{phaseId}` | `project.read` / `phase.update` | no |
| POST | `/api/v1/projects/{projectId}/phases/{phaseId}/complete` | `phase.complete` | yes |
| GET/POST | `/api/v1/projects/{projectId}/deliverables` | `project.read` / `deliverable.create` | POST yes |
| GET/PATCH | `/api/v1/projects/{projectId}/deliverables/{deliverableId}` | `project.read` / `deliverable.update` | no |
| POST | `…/deliverables/{deliverableId}/assign` | `deliverable.assign` | yes |
| POST | `…/deliverables/{deliverableId}/approve` | `deliverable.approve` | yes |
| POST | `…/deliverables/{deliverableId}/deliver` | `deliverable.deliver` | yes |
| GET/POST | `/api/v1/projects/{projectId}/work-packages` | `project.read` / `work_package.create` | POST yes |
| GET/PATCH | `/api/v1/projects/{projectId}/work-packages/{workPackageId}` | `project.read` / `work_package.update` | no |
| POST | `…/work-packages/{workPackageId}/complete` | `work_package.complete` | yes |
| POST | `…/work-packages/{workPackageId}/disassociate` | `deliverable.update` | yes |

CAS: mutating commands accept `expectedVersion` as elsewhere. Unauthorized rows are **omitted**, never returned as `count: 0` placeholders that reveal existence across tenants.

## FORBIDDEN

- `gate.override`, `forceRelease`, `force_release`, `override=true` in any operation or schema
- Trusting client `organizationId` / `projectId` / `deliverableId` as authority
- Auto-complete, auto-deliver, auto-release
- Planner/Gantt resources (M4)

## Validation when implemented

`SKIP_DB=1 pnpm openapi:generate && pnpm openapi:validate` plus `pnpm assert:no-gate-override`.

Source of planned paths: `packages/shared/src/m3-routes.ts` (`M3_PLANNED_API_ROUTES`).
