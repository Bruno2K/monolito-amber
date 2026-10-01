/**
 * M3 canonical UI and planned API routes.
 * M3.2 implements the authenticated shell + `/projects` context.
 * Planner remains reserved for M4.
 */

export type RouteLifecycle = "keep" | "extend" | "add" | "reserved-later" | "prototype-only";

export interface UiRoutePlan {
  path: string;
  lifecycle: RouteLifecycle;
  purpose: string;
  implementedIn: "m3.1-plan" | "foundation" | "m3.2+" | "m3.2" | "m3.3" | "m4" | "m5+" | "figma-prototype";
}

export interface ApiRoutePlan {
  method: "GET" | "POST" | "PATCH";
  path: string;
  lifecycle: RouteLifecycle;
  permission: string;
  idempotency: boolean;
  purpose: string;
  implementedIn?: "m3.3" | "m3.4" | "m3.5";
}

export const M3_CANONICAL_UI_ROUTES: readonly UiRoutePlan[] = [
  {
    path: "/projects",
    lifecycle: "add",
    purpose: "Visible Projects for the session-bound Organization",
    implementedIn: "m3.2",
  },
  {
    path: "/projects/:projectId/overview",
    lifecycle: "add",
    purpose: "Visão Geral / Project Hub (M3.6 consumes; M3.2 mounts shell)",
    implementedIn: "m3.2",
  },
  {
    path: "/projects/:projectId/structure",
    lifecycle: "add",
    purpose: "Phase and Discipline context",
    implementedIn: "m3.3",
  },
  {
    path: "/projects/:projectId/deliverables",
    lifecycle: "add",
    purpose: "Entregas list; detail via inspector/deep-link",
    implementedIn: "m3.2",
  },
];

export const M3_2_NEXT_APP_ROUTES = [
  "/projects",
  "/projects/[projectId]",
  "/projects/[projectId]/overview",
  "/projects/[projectId]/structure",
  "/projects/[projectId]/deliverables",
] as const;

export const M3_DETAIL_UI_PATTERN = "/projects/:projectId/deliverables?inspect=:deliverableId";

export const M4_RESERVED_UI_ROUTES: readonly UiRoutePlan[] = [
  {
    path: "/projects/:projectId/planner",
    lifecycle: "reserved-later",
    purpose: "Planning Gantt / timeline — M4. Do not implement in M3.",
    implementedIn: "m4",
  },
  {
    path: "/planejamento",
    lifecycle: "prototype-only",
    purpose: "M2 Figma prototype route; not a product Next.js route in M3",
    implementedIn: "figma-prototype",
  },
];

export const FIGMA_PROTOTYPE_ROUTE_MAP: readonly {
  figmaPath: string;
  productPath: string | null;
  disposition: RouteLifecycle;
}[] = [
  { figmaPath: "/visao-geral", productPath: "/projects/:projectId/overview", disposition: "extend" },
  { figmaPath: "/portfolio", productPath: "/projects", disposition: "extend" },
  { figmaPath: "/entregas", productPath: "/projects/:projectId/deliverables", disposition: "extend" },
  { figmaPath: "/planejamento", productPath: null, disposition: "reserved-later" },
  { figmaPath: "/calendarios", productPath: null, disposition: "reserved-later" },
  { figmaPath: "/mensagens", productPath: null, disposition: "reserved-later" },
  { figmaPath: "/equipe", productPath: null, disposition: "reserved-later" },
  { figmaPath: "/workload", productPath: null, disposition: "reserved-later" },
  { figmaPath: "/gates", productPath: null, disposition: "reserved-later" },
  { figmaPath: "/excecoes", productPath: null, disposition: "reserved-later" },
  { figmaPath: "/atividade", productPath: null, disposition: "reserved-later" },
];

export const EXISTING_FOUNDATION_UI_ROUTES = [
  "/",
  "/sign-in",
  "/password/setup",
  "/password/reset",
  "/mfa/challenge",
  "/mfa/enroll",
  "/org-switch",
  "/invite/accept",
] as const;

/** Planned Operations APIs — not generated into OpenAPI in M3.1. */
export const M3_PLANNED_API_ROUTES: readonly ApiRoutePlan[] = [
  {
    method: "GET",
    path: "/api/v1/organizations/{organizationId}/disciplines",
    lifecycle: "add",
    permission: "organization.manage_catalogs|project.read",
    idempotency: false,
    purpose: "List Organization-owned Discipline catalog (manage vs read by caller grants)",
    implementedIn: "m3.3",
  },
  {
    method: "POST",
    path: "/api/v1/organizations/{organizationId}/disciplines",
    lifecycle: "add",
    permission: "organization.manage_catalogs",
    idempotency: true,
    purpose: "Create Discipline; code unique case-insensitive per Organization",
    implementedIn: "m3.3",
  },
  {
    method: "PATCH",
    path: "/api/v1/organizations/{organizationId}/disciplines/{disciplineId}",
    lifecycle: "add",
    permission: "organization.manage_catalogs",
    idempotency: false,
    purpose: "Update name/active/sortOrder; do not destroy historical identifiers",
    implementedIn: "m3.3",
  },
  {
    method: "GET",
    path: "/api/v1/projects/{projectId}/phases",
    lifecycle: "add",
    permission: "project.read",
    idempotency: false,
    purpose: "List Phases of an authorized Project",
    implementedIn: "m3.3",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/phases",
    lifecycle: "add",
    permission: "phase.create",
    idempotency: true,
    purpose: "Create Phase",
    implementedIn: "m3.3",
  },
  {
    method: "GET",
    path: "/api/v1/projects/{projectId}/phases/{phaseId}",
    lifecycle: "add",
    permission: "project.read",
    idempotency: false,
    purpose: "Read Phase",
    implementedIn: "m3.3",
  },
  {
    method: "PATCH",
    path: "/api/v1/projects/{projectId}/phases/{phaseId}",
    lifecycle: "add",
    permission: "phase.update",
    idempotency: false,
    purpose: "Update Phase fields / activate / cancel (CAS version)",
    implementedIn: "m3.3",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/phases/reorder",
    lifecycle: "add",
    permission: "phase.update",
    idempotency: true,
    purpose: "Reorder Phases with version/CAS; sequence unique in the active set",
    implementedIn: "m3.3",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/phases/{phaseId}/activate",
    lifecycle: "add",
    permission: "phase.update",
    idempotency: true,
    purpose: "Explicit PLANNED → ACTIVE",
    implementedIn: "m3.3",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/phases/{phaseId}/complete",
    lifecycle: "add",
    permission: "phase.complete",
    idempotency: true,
    purpose: "Explicit COMPLETED",
    implementedIn: "m3.3",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/phases/{phaseId}/cancel",
    lifecycle: "add",
    permission: "phase.update",
    idempotency: true,
    purpose: "Explicit CANCELLED from PLANNED or ACTIVE",
    implementedIn: "m3.3",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/phases/{phaseId}/archive",
    lifecycle: "add",
    permission: "phase.update",
    idempotency: true,
    purpose: "Soft-archive a Phase (removal path when referenced; never hard-delete)",
    implementedIn: "m3.3",
  },
  {
    method: "GET",
    path: "/api/v1/projects/{projectId}/deliverables",
    lifecycle: "add",
    permission: "project.read",
    idempotency: false,
    purpose: "List Deliverables",
    implementedIn: "m3.4",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/deliverables",
    lifecycle: "add",
    permission: "deliverable.create",
    idempotency: true,
    purpose: "Create Deliverable with required phaseId + disciplineId",
    implementedIn: "m3.4",
  },
  {
    method: "GET",
    path: "/api/v1/projects/{projectId}/deliverables/{deliverableId}",
    lifecycle: "add",
    permission: "project.read",
    idempotency: false,
    purpose: "Read Deliverable",
    implementedIn: "m3.4",
  },
  {
    method: "PATCH",
    path: "/api/v1/projects/{projectId}/deliverables/{deliverableId}",
    lifecycle: "add",
    permission: "deliverable.update",
    idempotency: false,
    purpose: "Update Deliverable fields / non-approve/deliver transitions",
    implementedIn: "m3.4",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/deliverables/{deliverableId}/assign",
    lifecycle: "add",
    permission: "deliverable.assign",
    idempotency: true,
    purpose: "Set ownership XOR (user | Team | none)",
    implementedIn: "m3.4",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/deliverables/{deliverableId}/approve",
    lifecycle: "add",
    permission: "deliverable.approve",
    idempotency: true,
    purpose: "Explicit APPROVED",
    implementedIn: "m3.4",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/deliverables/{deliverableId}/deliver",
    lifecycle: "add",
    permission: "deliverable.deliver",
    idempotency: true,
    purpose: "DELIVERED only when all still-linked WorkPackages are DONE",
    implementedIn: "m3.4",
  },
  {
    method: "GET",
    path: "/api/v1/projects/{projectId}/work-packages",
    lifecycle: "add",
    permission: "project.read",
    idempotency: false,
    purpose: "List WorkPackages",
    implementedIn: "m3.5",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/work-packages",
    lifecycle: "add",
    permission: "work_package.create",
    idempotency: true,
    purpose: "Create WorkPackage with required phaseId",
    implementedIn: "m3.5",
  },
  {
    method: "GET",
    path: "/api/v1/projects/{projectId}/work-packages/{workPackageId}",
    lifecycle: "add",
    permission: "project.read",
    idempotency: false,
    purpose: "Read WorkPackage",
    implementedIn: "m3.5",
  },
  {
    method: "PATCH",
    path: "/api/v1/projects/{projectId}/work-packages/{workPackageId}",
    lifecycle: "add",
    permission: "work_package.update",
    idempotency: false,
    purpose: "Update fields / activate / block / cancel",
    implementedIn: "m3.5",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/work-packages/{workPackageId}/complete",
    lifecycle: "add",
    permission: "work_package.complete",
    idempotency: true,
    purpose: "Mark DONE; incidental Task links do not block",
    implementedIn: "m3.5",
  },
  {
    method: "POST",
    path: "/api/v1/projects/{projectId}/work-packages/{workPackageId}/disassociate",
    lifecycle: "add",
    permission: "deliverable.update",
    idempotency: true,
    purpose: "Explicit disassociation from a Deliverable (required before delivering with CANCELLED WPs)",
    implementedIn: "m3.5",
  },
];

export const M3_3_API_ROUTES = M3_PLANNED_API_ROUTES.filter((row) => row.implementedIn === "m3.3");
export const M3_LATER_API_ROUTES = M3_PLANNED_API_ROUTES.filter((row) => row.implementedIn !== "m3.3");

export const EXISTING_API_PATHS_TO_KEEP = [
  "/api/v1/projects",
  "/api/v1/projects/{projectId}",
  "/api/v1/catalog/permissions",
  "/api/v1/catalog/role-templates",
] as const;
