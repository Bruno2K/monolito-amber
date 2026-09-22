import { ForbiddenPermissionError } from "./errors.js";

/**
 * Closed MVP permission catalog — APPROVED 0.2A §1.
 * Organizations compose roles from these permissions; they cannot invent semantics.
 * Intentionally absent: gate.override (Formal Exception is the sole Gate bypass).
 */
export const PERMISSION_MODULES = [
  "organization",
  "project",
  "document",
  "coordination",
  "planning",
  "governance",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSIONS = [
  "organization.read",
  "organization.manage_settings",
  "organization.manage_members",
  "organization.manage_roles",
  "organization.manage_catalogs",
  "organization.read_audit",
  "project.create",
  "project.read",
  "project.update",
  "project.archive",
  "project.manage_members",
  "project.assign_roles",
  "document.read",
  "document.create",
  "document.archive",
  "revision.create",
  "revision.publish",
  "revision.review",
  "revision.approve",
  "revision.reject",
  "revision.make_current",
  "issue.create",
  "issue.assign",
  "issue.update",
  "issue.resolve",
  "issue.close",
  "issue.reopen",
  "issue.comment",
  "issue.add_evidence",
  "task.create",
  "task.assign",
  "task.update",
  "task.complete",
  "milestone.create",
  "milestone.update",
  "milestone.achieve",
  "gate.read",
  "gate.evaluate",
  "gate.release",
  "exception.request",
  "exception.approve",
  "exception.reject",
  "exception.revoke",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

/** Strings that must never appear in seed, OpenAPI, routes, or AuthZ. */
export const FORBIDDEN_PERMISSIONS = ["gate.override"] as const;

export const FORBIDDEN_API_TOKENS = [
  "gate.override",
  "forceRelease",
  "force_release",
  "override=true",
] as const;

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, { module: PermissionModule; description: string }> = {
  "organization.read": { module: "organization", description: "Read organization profile and settings" },
  "organization.manage_settings": { module: "organization", description: "Update organization settings" },
  "organization.manage_members": { module: "organization", description: "Invite, suspend, or remove organization members" },
  "organization.manage_roles": { module: "organization", description: "Create and assign organization-level role templates" },
  "organization.manage_catalogs": { module: "organization", description: "Manage organization catalogs and templates" },
  "organization.read_audit": { module: "organization", description: "Read audit events within authorized org/project scope (F-09)" },
  "project.create": { module: "project", description: "Create a project (empreendimento)" },
  "project.read": { module: "project", description: "Read an authorized project" },
  "project.update": { module: "project", description: "Update project metadata" },
  "project.archive": { module: "project", description: "Archive a project" },
  "project.manage_members": { module: "project", description: "Manage project membership" },
  "project.assign_roles": { module: "project", description: "Assign project roles from the closed catalog" },
  "document.read": { module: "document", description: "Read documents and authorized file metadata" },
  "document.create": { module: "document", description: "Create documents" },
  "document.archive": { module: "document", description: "Archive documents" },
  "revision.create": { module: "document", description: "Create a draft revision" },
  "revision.publish": { module: "document", description: "Publish a revision (≠ approve ≠ make-current)" },
  "revision.review": { module: "document", description: "Review a published revision" },
  "revision.approve": { module: "document", description: "Approve a revision (SoD: not the publisher)" },
  "revision.reject": { module: "document", description: "Reject a revision (SoD: not the publisher)" },
  "revision.make_current": { module: "document", description: "Make an APPROVED revision current (SoD: not the publisher)" },
  "issue.create": { module: "coordination", description: "Create an Issue (pendência)" },
  "issue.assign": { module: "coordination", description: "Assign an Issue" },
  "issue.update": { module: "coordination", description: "Update Issue fields" },
  "issue.resolve": { module: "coordination", description: "Mark an Issue resolved" },
  "issue.close": { module: "coordination", description: "Close an Issue" },
  "issue.reopen": { module: "coordination", description: "Reopen an Issue" },
  "issue.comment": { module: "coordination", description: "Comment on an Issue" },
  "issue.add_evidence": { module: "coordination", description: "Attach evidence to an Issue" },
  "task.create": { module: "planning", description: "Create a Task (Task ≠ Issue)" },
  "task.assign": { module: "planning", description: "Assign a Task" },
  "task.update": { module: "planning", description: "Update a Task" },
  "task.complete": { module: "planning", description: "Complete a Task" },
  "milestone.create": { module: "planning", description: "Create a Milestone" },
  "milestone.update": { module: "planning", description: "Update a Milestone" },
  "milestone.achieve": { module: "planning", description: "Mark a Milestone achieved" },
  "gate.read": { module: "governance", description: "Read Gates and requirements" },
  "gate.evaluate": { module: "governance", description: "Evaluate Gate requirements" },
  "gate.release": { module: "governance", description: "Explicitly release a Gate (READY ≠ RELEASED)" },
  "exception.request": { module: "governance", description: "Request a Formal Exception (sole bypass)" },
  "exception.approve": { module: "governance", description: "Approve a Formal Exception (does not satisfy the requirement)" },
  "exception.reject": { module: "governance", description: "Reject a Formal Exception" },
  "exception.revoke": { module: "governance", description: "Revoke an approved Formal Exception" },
};

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isForbiddenPermission(value: string): boolean {
  return (FORBIDDEN_PERMISSIONS as readonly string[]).includes(value);
}

export function assertClosedCatalog(code: string): asserts code is PermissionCode {
  if (isForbiddenPermission(code) || !isPermissionCode(code)) {
    throw new ForbiddenPermissionError(code);
  }
}

export function moduleOf(code: PermissionCode): PermissionModule {
  return PERMISSION_DESCRIPTIONS[code].module;
}

/**
 * Org-scoped permissions (0.2 / PF-1.2). Granted only by organization-level
 * RoleBindings to Organization-owned RoleDefinitions. They never imply access
 * to a specific Project.
 */
export const ORG_SCOPED_PERMISSIONS: readonly PermissionCode[] = [
  "organization.read",
  "organization.manage_settings",
  "organization.manage_members",
  "organization.manage_roles",
  "organization.manage_catalogs",
  "organization.read_audit",
  "project.create",
  "project.archive",
];

export function isOrgScopedPermission(code: PermissionCode): boolean {
  return (ORG_SCOPED_PERMISSIONS as readonly string[]).includes(code);
}

export function isProjectScopedPermission(code: PermissionCode): boolean {
  return isPermissionCode(code) && !isOrgScopedPermission(code);
}

export const CLOSED_CATALOG_SOURCE =
  "https://app.notion.com/p/3e3678e54c8d819fa690f4ade50c4e10";
