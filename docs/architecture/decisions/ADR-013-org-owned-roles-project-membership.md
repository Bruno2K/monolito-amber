# ADR-013 — Organization-owned RoleDefinitions and ProjectMembership

## Status
Accepted (PF-1.2)

## Context
PF-1.1 persisted Amber Role Templates as `RoleDefinition` rows with `organizationId = null` and bound them directly as operational grants. Optional `RoleBinding.projectId` treated org-level assignment as implicit project access. APPROVED 0.2 / 0.2A require Organization-owned roles, first-class Project Membership, and deny-by-default project context.

## Decision
- Amber Role Templates (`organizationId = null`, `isSystemTemplate = true`) are product-owned baselines. They are never operational AuthZ grants.
- Creating an Organization instantiates Organization-owned `RoleDefinition` copies with permission mappings and lineage (`sourceTemplateKey` / `templateKey`).
- Project role assignment references Organization-owned RoleDefinitions of the same Organization only.
- `ProjectMembership` is first-class (`ACTIVE | SUSPENDED | REMOVED`) and requires ACTIVE Organization Membership. Org suspension/removal overrides all project access.
- `ProjectRoleAssignment` is the only source of project-scoped permissions. Org-level `RoleBinding` contributes org-scoped permissions only.
- Client/path/query `projectId` is routing intent. The server verifies Project tenancy, ACTIVE ProjectMembership, same-org roles, and the required permission.

## Alternatives
- Keep assigning global templates — rejected: shared mutable grants across tenants.
- Reuse `RoleBinding.projectId` as implicit project access — rejected: 0.2 requires first-class Project Membership.
- Grant Org Admin `project.read` on every Project — rejected: organization membership ≠ project membership.

## Consequences
Two Organizations may share a name/template origin and still diverge permission sets. Coordinators manage existing org members only and cannot self-escalate via `project.assign_roles`.

## Implementation Implications
Migration `20260922190000_pf_1_2_project_membership` instantiates missing org-owned roles, remaps bindings, drops `role_bindings.project_id`, and adds same-org database triggers.

## Supersedes
PF-1.1 operational use of global `RoleDefinition` rows and `RoleBinding.projectId`.
