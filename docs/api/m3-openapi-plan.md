# M3.1 OpenAPI plan

**Status:** Phase/Discipline paths are generated from Nest in M3.3. Deliverable paths are generated in M3.4. WorkPackage paths are generated in M3.5. The Project Hub read model is generated in M3.6. Cross-domain context and Document↔Deliverable link/unlink are generated in M3.7.

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

## ADD (M3.3–M3.5 implemented)

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
| POST | `…/deliverables/{deliverableId}/unassign` | `deliverable.assign` | yes |
| POST | `…/deliverables/{deliverableId}/start` | `deliverable.update` | yes |
| POST | `…/deliverables/{deliverableId}/submit-for-review` | `deliverable.update` | yes |
| POST | `…/deliverables/{deliverableId}/approve` | `deliverable.approve` | yes |
| POST | `…/deliverables/{deliverableId}/deliver` | `deliverable.deliver` | yes |
| POST | `…/deliverables/{deliverableId}/cancel` | `deliverable.update` | yes |
| POST | `…/deliverables/{deliverableId}/archive` | `deliverable.update` | yes |
| GET | `/api/v1/organizations/{organizationId}/teams` | `organization.manage_catalogs` or `project.read` | no |
| GET/POST | `/api/v1/projects/{projectId}/work-packages` | `project.read` / `work_package.create` | POST yes |
| GET/PATCH | `/api/v1/projects/{projectId}/work-packages/{workPackageId}` | `project.read` / `work_package.update` | no |
| GET | `/api/v1/projects/{projectId}/hub` | `project.read` | no — derived read model; origin+derivation on each signal |
| GET | `/api/v1/projects/{projectId}/deliverables/{deliverableId}/context` | `project.read` | no — unauthorized sections omitted |
| POST | `…/deliverables/{deliverableId}/documents` | `deliverable.update` (+ `document.read` both-side) | yes |
| POST | `…/deliverables/{deliverableId}/documents/{documentId}/unlink` | `deliverable.update` (+ `document.read` both-side) | yes |
| GET | `/api/v1/projects/{projectId}/work-packages/{workPackageId}/context` | `project.read` | no |
| POST | `…/work-packages/{workPackageId}/assign` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/unassign` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/activate` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/block` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/unblock` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/complete` | `work_package.complete` | yes |
| POST | `…/work-packages/{workPackageId}/cancel` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/archive` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/associate` | `work_package.update` | yes |
| POST | `…/work-packages/{workPackageId}/disassociate` | `work_package.update` | yes |

CAS: mutating commands accept `expectedVersion` as elsewhere. Unauthorized rows are **omitted**, never returned as `count: 0` placeholders that reveal existence across tenants.

## FORBIDDEN

- `gate.override`, `forceRelease`, `force_release`, `override=true` in any operation or schema
- Trusting client `organizationId` / `projectId` / `deliverableId` as authority
- Auto-complete, auto-deliver, auto-release
- Planner/Gantt resources (M4)

## Validation when implemented

`SKIP_DB=1 pnpm openapi:generate && pnpm openapi:validate` plus `pnpm assert:no-gate-override`.

Source of planned paths: `packages/shared/src/m3-routes.ts` (`M3_PLANNED_API_ROUTES`).
