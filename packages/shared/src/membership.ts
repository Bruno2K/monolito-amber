import { MembershipStateError } from "./errors.js";
import type { MembershipStatus, MembershipType } from "./tenancy.js";

export const MEMBERSHIP_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"] as const;
export const MEMBERSHIP_TYPES = ["INTERNAL", "EXTERNAL", "ADMINISTRATIVE"] as const;

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
