import { DenyByDefaultError, MfaRequiredError } from "./errors.js";
import {
  MFA_REQUIRED_ROLE_KEYS,
  type RoleTemplateKey,
} from "./role-templates.js";
import type { PermissionCode } from "./permissions.js";
import { denyExternalOrgWideAccess, type MembershipStatus, type MembershipType } from "./tenancy.js";
import { isUsableMembership } from "./membership.js";

export interface RoleGrant {
  templateKey: string;
  permissions: readonly PermissionCode[];
  projectId?: string | null;
}

export interface AuthzContext {
  userId: string;
  organizationId: string;
  membershipStatus: MembershipStatus;
  membershipType: MembershipType;
  grants: readonly RoleGrant[];
  projectId?: string | null;
  /**
   * True when MFA is not required for the current grants, or when the required
   * TOTP factor is enrolled. Privileged grants fail closed unless this is true.
   */
  mfaSatisfied?: boolean;
}

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

export function resolvePermissions(
  context: AuthzContext,
  options?: { ignoreMfaGate?: boolean },
): PermissionCode[] {
  if (!isUsableMembership(context.membershipStatus)) {
    return [];
  }
  const granted = new Set<PermissionCode>();
  for (const grant of context.grants) {
    const orgWide = grant.projectId == null;
    const projectMatch = context.projectId != null && grant.projectId === context.projectId;
    if (!(orgWide || projectMatch)) {
      continue;
    }
    if (
      !options?.ignoreMfaGate &&
      isMfaRequiredRole(grant.templateKey) &&
      context.mfaSatisfied !== true
    ) {
      continue;
    }
    for (const permission of grant.permissions) {
      granted.add(permission);
    }
  }
  return [...granted];
}

export function hasPermission(context: AuthzContext, required: PermissionCode): boolean {
  return resolvePermissions(context).includes(required);
}

export function assertPermission(context: AuthzContext, required: PermissionCode): void {
  if (ORG_WIDE_PERMISSIONS.includes(required)) {
    denyExternalOrgWideAccess(
      context.membershipType,
      required === "organization.read_audit" ? "audit" : "org_directory",
    );
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
];

export function isHighRiskPermission(code: PermissionCode): boolean {
  return HIGH_RISK_PERMISSIONS.includes(code);
}
