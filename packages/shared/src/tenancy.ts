import { DenyByDefaultError } from "./errors.js";

export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";
export type MembershipType = "INTERNAL" | "EXTERNAL" | "ADMINISTRATIVE";
export type ProjectMembershipStatus = "ACTIVE" | "SUSPENDED" | "REMOVED";

export interface SessionBinding {
  userId: string;
  activeOrganizationId: string | null;
  revokedAt: Date | null;
}

export interface MembershipBinding {
  userId: string;
  organizationId: string;
  status: MembershipStatus;
  type: MembershipType;
}

/**
 * Positive tenant binding (F-04 / 0.2A §11).
 * Client-supplied organizationId/projectId NEVER establishes authority.
 * Deny-by-default when session binding is missing or mismatched.
 */
export function resolveAuthorizedOrganization(input: {
  session: SessionBinding | null | undefined;
  membership: MembershipBinding | null | undefined;
  clientOrganizationId?: string | null;
  pathOrganizationId?: string | null;
}): string {
  if (!input.session || input.session.revokedAt) {
    throw new DenyByDefaultError("No authenticated session binding");
  }
  const bound = input.session.activeOrganizationId;
  if (!bound) {
    throw new DenyByDefaultError("Session has no active Organization; org-switch required");
  }
  if (!input.membership || input.membership.userId !== input.session.userId) {
    throw new DenyByDefaultError("No membership for the authenticated principal");
  }
  if (input.membership.organizationId !== bound) {
    throw new DenyByDefaultError("Membership does not match session-bound Organization");
  }
  if (input.membership.status !== "ACTIVE") {
    throw new DenyByDefaultError("Organization membership is not ACTIVE");
  }

  // Client/path ids are routing hints only. Mismatch → 403 (0.7).
  if (input.pathOrganizationId && input.pathOrganizationId !== bound) {
    throw new DenyByDefaultError("Path organizationId does not match session-bound Organization");
  }
  if (input.clientOrganizationId && input.clientOrganizationId !== bound) {
    throw new DenyByDefaultError("Client organizationId is not authoritative and does not match session");
  }
  return bound;
}

export function assertProjectInOrganization(input: {
  projectOrganizationId: string | null | undefined;
  authorizedOrganizationId: string;
}): void {
  if (!input.projectOrganizationId || input.projectOrganizationId !== input.authorizedOrganizationId) {
    throw new DenyByDefaultError("Project is not bound to the authorized Organization");
  }
}

/**
 * Path/body/query projectId is routing intent only. The server must verify
 * the Project exists in the session-bound Organization before any grant.
 */
export function resolveAuthorizedProject(input: {
  projectId: string | null | undefined;
  projectOrganizationId: string | null | undefined;
  authorizedOrganizationId: string;
  clientProjectId?: string | null;
  pathProjectId?: string | null;
}): string {
  if (!input.projectId) {
    throw new DenyByDefaultError("Project context is required");
  }
  assertProjectInOrganization({
    projectOrganizationId: input.projectOrganizationId,
    authorizedOrganizationId: input.authorizedOrganizationId,
  });
  if (input.pathProjectId && input.pathProjectId !== input.projectId) {
    throw new DenyByDefaultError("Path projectId does not match the authorized Project");
  }
  if (input.clientProjectId && input.clientProjectId !== input.projectId) {
    throw new DenyByDefaultError("Client projectId is not authoritative and does not match the authorized Project");
  }
  return input.projectId;
}

export function assertActiveProjectMembership(status: ProjectMembershipStatus | null | undefined): void {
  if (status !== "ACTIVE") {
    throw new DenyByDefaultError("Project membership is not ACTIVE");
  }
}

export function assertOperationalRoleDefinition(input: {
  roleOrganizationId: string | null | undefined;
  authorizedOrganizationId: string;
  isSystemTemplate?: boolean;
}): void {
  if (!input.roleOrganizationId || input.isSystemTemplate === true) {
    throw new DenyByDefaultError("Amber Role Templates are not operational AuthZ grants");
  }
  if (input.roleOrganizationId !== input.authorizedOrganizationId) {
    throw new DenyByDefaultError("RoleDefinition is not owned by the authorized Organization");
  }
}

/**
 * EXTERNAL isolation (0.2A §12): external membership never implies
 * organization-wide project list, user directory, or audit access.
 */
export function isExternalMembership(type: MembershipType): boolean {
  return type === "EXTERNAL";
}

export function denyExternalOrgWideAccess(type: MembershipType, action: "org_directory" | "org_project_list" | "audit"): void {
  if (isExternalMembership(type)) {
    throw new DenyByDefaultError(`EXTERNAL membership cannot access ${action}`);
  }
}

export interface OrgSwitchRequest {
  session: SessionBinding;
  targetOrganizationId: string;
  membership: MembershipBinding | null;
}

export function evaluateOrgSwitch(input: OrgSwitchRequest): { nextActiveOrganizationId: string } {
  if (input.session.revokedAt) {
    throw new DenyByDefaultError("Cannot org-switch with a revoked session");
  }
  if (!input.membership) {
    throw new DenyByDefaultError("Org-switch denied: no membership for target Organization");
  }
  if (input.membership.userId !== input.session.userId) {
    throw new DenyByDefaultError("Org-switch denied: membership belongs to a different user");
  }
  if (input.membership.organizationId !== input.targetOrganizationId) {
    throw new DenyByDefaultError("Org-switch denied: membership organization mismatch");
  }
  if (input.membership.status !== "ACTIVE") {
    throw new DenyByDefaultError("Org-switch denied: membership is not ACTIVE");
  }
  return { nextActiveOrganizationId: input.targetOrganizationId };
}
