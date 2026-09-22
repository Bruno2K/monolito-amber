import { DenyByDefaultError, MfaRequiredError } from "./errors.js";
import {
  MFA_REQUIRED_ROLE_KEYS,
  type RoleTemplateKey,
} from "./role-templates.js";
import {
  isOrgScopedPermission,
  isProjectScopedPermission,
  type PermissionCode,
} from "./permissions.js";
import {
  denyExternalOrgWideAccess,
  type MembershipStatus,
  type MembershipType,
  type ProjectMembershipStatus,
} from "./tenancy.js";
import { isUsableMembership, isUsableProjectMembership } from "./membership.js";

export type RoleGrantScope = "organization" | "project";

export interface RoleGrant {
  templateKey: string;
  permissions: readonly PermissionCode[];
  /**
   * organization = org-level RoleBinding (org-scoped permissions only).
   * project = ProjectRoleAssignment (project-scoped permissions only).
   */
  scope: RoleGrantScope;
  projectId?: string | null;
}

export interface AuthzContext {
  userId: string;
  organizationId: string;
  membershipStatus: MembershipStatus;
  membershipType: MembershipType;
  grants: readonly RoleGrant[];
  projectId?: string | null;
  projectMembershipStatus?: ProjectMembershipStatus | null;
  /**
   * True when MFA is not required for the current grants, or when the required
   * TOTP factor is enrolled. Privileged grants fail closed unless this is true.
   */
  mfaSatisfied?: boolean;
}

/** @deprecated Use ORG_SCOPED_PERMISSIONS / isOrgScopedPermission. Kept as the EXTERNAL isolation set. */
export const ORG_WIDE_PERMISSIONS: readonly PermissionCode[] = [
  "organization.read",
  "organization.manage_settings",
  "organization.manage_members",
  "organization.manage_roles",
  "organization.manage_catalogs",
  "organization.read_audit",
];

export function isMfaRequiredRole(templateKey: string): boolean {
  return (MFA_REQUIRED_ROLE_KEYS as readonly string[]).includes(templateKey);
}

function grantApplies(context: AuthzContext, grant: RoleGrant): boolean {
  if (grant.scope === "organization") {
    return true;
  }
  if (grant.scope === "project") {
    if (!isUsableProjectMembership(context.projectMembershipStatus)) {
      return false;
    }
    return context.projectId != null && grant.projectId === context.projectId;
  }
  return false;
}

function permissionsFromGrant(grant: RoleGrant): PermissionCode[] {
  if (grant.scope === "organization") {
    return grant.permissions.filter((code) => isOrgScopedPermission(code));
  }
  return grant.permissions.filter((code) => isProjectScopedPermission(code));
}

export function resolvePermissions(
  context: AuthzContext,
  options?: { ignoreMfaGate?: boolean },
): PermissionCode[] {
  if (!isUsableMembership(context.membershipStatus)) {
    return [];
  }
  const granted = new Set<PermissionCode>();
  for (const grant of context.grants) {
    if (!grantApplies(context, grant)) {
      continue;
    }
    if (
      !options?.ignoreMfaGate &&
      isMfaRequiredRole(grant.templateKey) &&
      context.mfaSatisfied !== true
    ) {
      continue;
    }
    for (const permission of permissionsFromGrant(grant)) {
      granted.add(permission);
    }
  }
  return [...granted];
}

export function hasPermission(context: AuthzContext, required: PermissionCode): boolean {
  return resolvePermissions(context).includes(required);
}

export function assertPermission(context: AuthzContext, required: PermissionCode): void {
  if (isOrgScopedPermission(required) || ORG_WIDE_PERMISSIONS.includes(required)) {
    denyExternalOrgWideAccess(
      context.membershipType,
      required === "organization.read_audit"
        ? "audit"
        : required === "project.create" || required === "project.archive"
          ? "org_project_list"
          : "org_directory",
    );
  }
  if (isProjectScopedPermission(required)) {
    if (!context.projectId) {
      throw new DenyByDefaultError("Project context is required for project-scoped authorization");
    }
    if (!isUsableProjectMembership(context.projectMembershipStatus)) {
      throw new DenyByDefaultError("ACTIVE ProjectMembership is required for project-scoped authorization");
    }
  }
  const unrestricted = resolvePermissions(context, { ignoreMfaGate: true });
  if (unrestricted.includes(required) && !hasPermission(context, required)) {
    throw new MfaRequiredError("Privileged authorization requires MFA");
  }
  if (!hasPermission(context, required)) {
    throw new DenyByDefaultError(`Missing permission ${required}`);
  }
}

export function requiresMfaEnrollment(templateKeys: readonly string[]): boolean {
  return templateKeys.some((key) => isMfaRequiredRole(key));
}

export function mfaRequirementSatisfied(input: {
  templateKeys: readonly string[];
  enrolled: boolean;
}): boolean {
  return !requiresMfaEnrollment(input.templateKeys) || input.enrolled;
}

export function assignedTemplateKeys(grants: readonly RoleGrant[]): RoleTemplateKey[] {
  return grants
    .map((grant) => grant.templateKey)
    .filter((key): key is RoleTemplateKey =>
      (MFA_REQUIRED_ROLE_KEYS as readonly string[]).includes(key) || Boolean(key),
    );
}

export const HIGH_RISK_PERMISSIONS: readonly PermissionCode[] = [
  "organization.manage_roles",
  "organization.manage_members",
  "exception.approve",
  "exception.reject",
  "exception.revoke",
  "gate.release",
];

export function isHighRiskPermission(code: PermissionCode): boolean {
  return HIGH_RISK_PERMISSIONS.includes(code);
}

export function grantsOutsideExistingAuthority(input: {
  existingTemplateKeys: readonly string[];
  existingPermissions: readonly PermissionCode[];
  nextTemplateKey: string;
  nextPermissions: readonly PermissionCode[];
}): boolean {
  if (!input.existingTemplateKeys.includes(input.nextTemplateKey)) {
    return true;
  }
  return input.nextPermissions.some((code) => !input.existingPermissions.includes(code));
}
