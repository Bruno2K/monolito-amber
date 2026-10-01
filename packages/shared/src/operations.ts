import { OperationsStateError } from "./errors.js";
import { OPERATIONS_PERMISSIONS, type PermissionCode } from "./permissions.js";
import type { RoleTemplateKey } from "./role-templates.js";
import type { ProjectMembershipStatus } from "./tenancy.js";

/**
 * M3 Project Operations contract — executable tables for Phase, Discipline,
 * Deliverable, and WorkPackage. Schema/API/UI implementation is M3.3–M3.5.
 * Reads use project.read on an authorized Project. No gate.override.
 */

export const PHASE_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const DELIVERABLE_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "APPROVED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export const WORK_PACKAGE_STATUSES = ["PLANNED", "ACTIVE", "BLOCKED", "DONE", "CANCELLED"] as const;
export type WorkPackageStatus = (typeof WORK_PACKAGE_STATUSES)[number];

export const PHASE_TERMINAL_STATUSES: readonly PhaseStatus[] = ["COMPLETED", "CANCELLED"];
export const DELIVERABLE_TERMINAL_STATUSES: readonly DeliverableStatus[] = ["DELIVERED", "CANCELLED"];
export const WORK_PACKAGE_TERMINAL_STATUSES: readonly WorkPackageStatus[] = ["DONE", "CANCELLED"];

const PHASE_TRANSITIONS: Record<PhaseStatus, readonly PhaseStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const DELIVERABLE_TRANSITIONS: Record<DeliverableStatus, readonly DeliverableStatus[]> = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["IN_REVIEW", "CANCELLED"],
  IN_REVIEW: ["APPROVED", "CANCELLED"],
  APPROVED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const WORK_PACKAGE_TRANSITIONS: Record<WorkPackageStatus, readonly WorkPackageStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["BLOCKED", "DONE", "CANCELLED"],
  BLOCKED: ["ACTIVE", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
};

export const PHASE_FIELDS = [
  "organizationId",
  "projectId",
  "name",
  "description",
  "sequence",
  "plannedStartAt",
  "plannedEndAt",
  "actualStartAt",
  "actualEndAt",
  "status",
  "createdBy",
  "version",
  "archivedAt",
  "createdAt",
  "updatedAt",
] as const;

export const DISCIPLINE_FIELDS = [
  "organizationId",
  "code",
  "name",
  "active",
  "sortOrder",
  "createdAt",
  "updatedAt",
] as const;

export const DELIVERABLE_FIELDS = [
  "organizationId",
  "projectId",
  "phaseId",
  "disciplineId",
  "code",
  "title",
  "description",
  "ownerProjectMembershipId",
  "ownerTeamId",
  "plannedStartAt",
  "dueAt",
  "status",
  "progressPercent",
  "version",
  "archivedAt",
  "createdAt",
  "updatedAt",
] as const;

export const WORK_PACKAGE_FIELDS = [
  "organizationId",
  "projectId",
  "phaseId",
  "deliverableId",
  "disciplineId",
  "code",
  "title",
  "description",
  "blockedReason",
  "ownerProjectMembershipId",
  "ownerTeamId",
  "plannedStartAt",
  "dueAt",
  "status",
  "version",
  "archivedAt",
  "createdAt",
  "updatedAt",
] as const;

export const REQUIRED_DELIVERABLE_RELATIONS = ["phaseId", "disciplineId"] as const;
export const REQUIRED_WORK_PACKAGE_RELATIONS = ["phaseId"] as const;

export const PROJECT_COORDINATOR_OPERATIONS_PERMISSIONS: readonly PermissionCode[] = OPERATIONS_PERMISSIONS;

export const DISCIPLINE_COORDINATOR_OPERATIONS_PERMISSIONS: readonly PermissionCode[] = [
  "deliverable.create",
  "deliverable.update",
  "deliverable.assign",
  "work_package.create",
  "work_package.update",
  "work_package.complete",
];

export const OPERATIONS_NO_MUTATION_ROLE_KEYS: readonly RoleTemplateKey[] = [
  "CONTRIBUTOR_DESIGNER",
  "REVIEWER_REVISION_APPROVER",
  "GOVERNANCE_APPROVER",
  "EXTERNAL_CONTRIBUTOR",
  "VIEWER",
  "AUDITOR",
];

export const OPERATIONS_AUDIT_EVENTS = [
  "PHASE_CREATED",
  "PHASE_UPDATED",
  "PHASE_STATUS_CHANGED",
  "PHASE_ACTIVATED",
  "PHASE_COMPLETED",
  "PHASE_CANCELLED",
  "PHASE_ARCHIVED",
  "DISCIPLINE_CREATED",
  "DISCIPLINE_UPDATED",
  "DELIVERABLE_CREATED",
  "DELIVERABLE_UPDATED",
  "DELIVERABLE_ASSIGNED",
  "DELIVERABLE_APPROVED",
  "DELIVERABLE_DELIVERED",
  "DELIVERABLE_CANCELLED",
  "WORK_PACKAGE_CREATED",
  "WORK_PACKAGE_UPDATED",
  "WORK_PACKAGE_ASSIGNED",
  "WORK_PACKAGE_BLOCKED",
  "WORK_PACKAGE_UNBLOCKED",
  "WORK_PACKAGE_COMPLETED",
  "WORK_PACKAGE_CANCELLED",
  "WORK_PACKAGE_DISASSOCIATED",
] as const;

export function isPhaseStatus(value: string): value is PhaseStatus {
  return (PHASE_STATUSES as readonly string[]).includes(value);
}

export function isDeliverableStatus(value: string): value is DeliverableStatus {
  return (DELIVERABLE_STATUSES as readonly string[]).includes(value);
}

export function isWorkPackageStatus(value: string): value is WorkPackageStatus {
  return (WORK_PACKAGE_STATUSES as readonly string[]).includes(value);
}

export function assertPhaseTransition(from: PhaseStatus, to: PhaseStatus): void {
  if (!PHASE_TRANSITIONS[from].includes(to)) {
    throw new OperationsStateError(`Phase cannot transition from ${from} to ${to}`);
  }
}

export function assertDeliverableTransition(from: DeliverableStatus, to: DeliverableStatus): void {
  if (!DELIVERABLE_TRANSITIONS[from].includes(to)) {
    throw new OperationsStateError(`Deliverable cannot transition from ${from} to ${to}`);
  }
}

export function assertWorkPackageTransition(from: WorkPackageStatus, to: WorkPackageStatus): void {
  if (!WORK_PACKAGE_TRANSITIONS[from].includes(to)) {
    throw new OperationsStateError(`WorkPackage cannot transition from ${from} to ${to}`);
  }
}

export function phaseStatusRequiresCompletePermission(to: PhaseStatus): boolean {
  return to === "COMPLETED";
}

export function deliverableStatusRequiresApprovePermission(to: DeliverableStatus): boolean {
  return to === "APPROVED";
}

export function deliverableStatusRequiresDeliverPermission(to: DeliverableStatus): boolean {
  return to === "DELIVERED";
}

export function workPackageStatusRequiresCompletePermission(to: WorkPackageStatus): boolean {
  return to === "DONE";
}

export function workPackageStatusRequiresBlockedReason(to: WorkPackageStatus): boolean {
  return to === "BLOCKED";
}

/** Dates never transit Phase status. Completing/activating is an explicit action. */
export function phaseDatesTransitStatus(): boolean {
  return false;
}

export function phasesMayOverlap(): boolean {
  return true;
}

export function normalizeCatalogCode(code: string): string {
  return code.trim().toLowerCase();
}

export function assertUniqueAmongNonArchived(
  existing: readonly { code: string; archived: boolean }[],
  candidate: string,
  excludeIndex?: number,
): void {
  const normalized = normalizeCatalogCode(candidate);
  if (!normalized) {
    throw new OperationsStateError("Code is required");
  }
  const collision = existing.some(
    (row, index) =>
      !row.archived && index !== excludeIndex && normalizeCatalogCode(row.code) === normalized,
  );
  if (collision) {
    throw new OperationsStateError("Code must be unique among non-archived records in this scope");
  }
}

export function assertUniquePhaseSequence(
  existing: readonly { sequence: number; archived: boolean }[],
  sequence: number,
  excludeIndex?: number,
): void {
  const collision = existing.some(
    (row, index) => !row.archived && index !== excludeIndex && row.sequence === sequence,
  );
  if (collision) {
    throw new OperationsStateError("Phase sequence must be unique among non-archived Phases of the Project");
  }
}

export interface OwnershipInput {
  ownerProjectMembershipId?: string | null;
  ownerTeamId?: string | null;
}

/** Zero or exactly one owner. User and Team are mutually exclusive. */
export function assertOwnershipXor(input: OwnershipInput): void {
  const user = Boolean(input.ownerProjectMembershipId);
  const team = Boolean(input.ownerTeamId);
  if (user && team) {
    throw new OperationsStateError("Ownership XOR: user owner and Team owner are mutually exclusive");
  }
}

export function assertUserOwnerRequiresActiveProjectMembership(
  ownerProjectMembershipId: string | null | undefined,
  membershipStatus: ProjectMembershipStatus | null | undefined,
): void {
  if (!ownerProjectMembershipId) {
    return;
  }
  if (membershipStatus !== "ACTIVE") {
    throw new OperationsStateError("User owner requires an ACTIVE ProjectMembership");
  }
}

export function teamOwnerGrantsProjectAccess(): boolean {
  return false;
}

export function ownerOrDisciplineGrantsProjectAccess(): boolean {
  return false;
}

export function teamMembershipImpliesProjectMembership(): boolean {
  return false;
}

export interface LinkedWorkPackage {
  status: WorkPackageStatus;
  associated: boolean;
}

/**
 * M3 delivery rule: every still-linked WorkPackage is mandatory.
 * DELIVERED requires all linked WPs DONE. A linked CANCELLED WP blocks
 * delivery until explicit disassociation. No silent bypass.
 */
export function assertDeliverableCanBeDelivered(linked: readonly LinkedWorkPackage[]): void {
  const blocking = linked.filter((row) => row.associated && row.status !== "DONE");
  if (blocking.length > 0) {
    throw new OperationsStateError(
      "Deliverable cannot be DELIVERED while a linked WorkPackage is not DONE; disassociate CANCELLED packages explicitly",
    );
  }
}

export function cancelledLinkedWorkPackageBlocksDelivery(linked: readonly LinkedWorkPackage[]): boolean {
  return linked.some((row) => row.associated && row.status === "CANCELLED");
}

/** M3 does not treat incidental Task links as required. They never block WP DONE. */
export function incidentalTasksBlockWorkPackageDone(): boolean {
  return false;
}

export function leavingBlockedClearsReason(from: WorkPackageStatus, to: WorkPackageStatus): boolean {
  return from === "BLOCKED" && to !== "BLOCKED";
}

export function assertBlockedReason(to: WorkPackageStatus, blockedReason: string | null | undefined): void {
  if (to === "BLOCKED" && !blockedReason?.trim()) {
    throw new OperationsStateError("BLOCKED requires blockedReason");
  }
}

export function nextBlockedReason(
  from: WorkPackageStatus,
  to: WorkPackageStatus,
  currentReason: string | null | undefined,
): string | null {
  if (to === "BLOCKED") {
    return currentReason?.trim() || null;
  }
  if (leavingBlockedClearsReason(from, to)) {
    return null;
  }
  return currentReason ?? null;
}

export function assertValidDateRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
  label: string,
): void {
  if (start && end && start.getTime() > end.getTime()) {
    throw new OperationsStateError(`${label} start must be on or before end`);
  }
}

/** Soft archive is the removal path. Hard-delete is never allowed. */
export function hardDeletePhaseAllowed(): boolean {
  return false;
}

export function archiveIsPhaseRemovalPath(): boolean {
  return true;
}

export const PHASE_LIST_DEFAULT_LIMIT = 100;
export const PHASE_LIST_MAX_LIMIT = 100;

export function clampPhaseListLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) {
    return PHASE_LIST_DEFAULT_LIMIT;
  }
  const parsed = Math.trunc(limit);
  if (parsed < 1) {
    return 1;
  }
  return Math.min(parsed, PHASE_LIST_MAX_LIMIT);
}

export function encodePhaseCursor(sequence: number, id: string): string {
  return Buffer.from(`${sequence}:${id}`, "utf8").toString("base64url");
}

export function decodePhaseCursor(cursor: string): { sequence: number; id: string } {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf(":");
    if (sep <= 0) {
      throw new Error("invalid");
    }
    const sequence = Number(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!Number.isInteger(sequence) || !id) {
      throw new Error("invalid");
    }
    return { sequence, id };
  } catch {
    throw new OperationsStateError("Invalid list cursor");
  }
}

export function historicalDisciplineIdentifierPreserved(): boolean {
  return true;
}
