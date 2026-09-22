import { AuditMutationDeniedError } from "./errors.js";

/** F-09: app credentials INSERT (+SELECT); no UPDATE/DELETE. */
export const AUDIT_APP_PRIVILEGES = ["INSERT", "SELECT"] as const;
export const AUDIT_DENIED_PRIVILEGES = ["UPDATE", "DELETE"] as const;

export const AUDIT_READ_PERMISSION = "organization.read_audit" as const;

export interface AuditWrite {
  organizationId?: string | null;
  projectId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  resourceType: string;
  resourceId?: string | null;
  correlationId: string;
  payload: Record<string, unknown>;
}

export function assertAuditMutationAllowed(operation: string): void {
  const upper = operation.toUpperCase();
  if (upper === "UPDATE" || upper === "DELETE") {
    throw new AuditMutationDeniedError(upper);
  }
}

export function canReadAudit(input: {
  hasReadAuditPermission: boolean;
  actorOrganizationId: string | null;
  rowOrganizationId: string;
  actorProjectIds?: readonly string[] | null;
  rowProjectId?: string | null;
}): boolean {
  if (!input.hasReadAuditPermission || !input.actorOrganizationId) {
    return false;
  }
  if (input.actorOrganizationId !== input.rowOrganizationId) {
    return false;
  }
  if (input.rowProjectId && input.actorProjectIds && !input.actorProjectIds.includes(input.rowProjectId)) {
    return false;
  }
  return true;
}
