import { MembershipStateError } from "./errors.js";
import type { MembershipStatus, MembershipType, ProjectMembershipStatus } from "./tenancy.js";

export const MEMBERSHIP_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"] as const;
export const MEMBERSHIP_TYPES = ["INTERNAL", "EXTERNAL", "ADMINISTRATIVE"] as const;
export const PROJECT_MEMBERSHIP_STATUSES = ["ACTIVE", "SUSPENDED", "REMOVED"] as const;

const ALLOWED_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  INVITED: ["ACTIVE", "REMOVED"],
  ACTIVE: ["SUSPENDED", "REMOVED"],
  SUSPENDED: ["ACTIVE", "REMOVED"],
  // Re-invitation preserves the same membership row (soft history).
  REMOVED: ["INVITED"],
};

export function assertMembershipTransition(from: MembershipStatus, to: MembershipStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new MembershipStateError(`Cannot transition organization membership from ${from} to ${to}`);
  }
}

export function isUsableMembership(status: MembershipStatus): boolean {
  return status === "ACTIVE";
}

export function shouldRevokeOrgAccess(status: MembershipStatus): boolean {
  return status === "SUSPENDED" || status === "REMOVED";
}

export function assertMembershipType(type: string): asserts type is MembershipType {
  if (!(MEMBERSHIP_TYPES as readonly string[]).includes(type)) {
    throw new MembershipStateError(`Unknown membership type ${type}`);
  }
}

export function assertMembershipStatus(status: string): asserts status is MembershipStatus {
  if (!(MEMBERSHIP_STATUSES as readonly string[]).includes(status)) {
    throw new MembershipStateError(`Unknown membership status ${status}`);
  }
}

const PROJECT_ALLOWED_TRANSITIONS: Record<ProjectMembershipStatus, readonly ProjectMembershipStatus[]> = {
  ACTIVE: ["SUSPENDED", "REMOVED"],
  SUSPENDED: ["ACTIVE", "REMOVED"],
  // Re-adding a historical member reactivates the same row.
  REMOVED: ["ACTIVE"],
};

export function assertProjectMembershipTransition(
  from: ProjectMembershipStatus,
  to: ProjectMembershipStatus,
): void {
  if (!PROJECT_ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new MembershipStateError(`Cannot transition project membership from ${from} to ${to}`);
  }
}

export function isUsableProjectMembership(status: ProjectMembershipStatus | null | undefined): boolean {
  return status === "ACTIVE";
}

export function shouldRevokeProjectAccess(status: ProjectMembershipStatus): boolean {
  return status === "SUSPENDED" || status === "REMOVED";
}

export function assertProjectMembershipStatus(status: string): asserts status is ProjectMembershipStatus {
  if (!(PROJECT_MEMBERSHIP_STATUSES as readonly string[]).includes(status)) {
    throw new MembershipStateError(`Unknown project membership status ${status}`);
  }
}
