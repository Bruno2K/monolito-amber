import { DenyByDefaultError, OperationsStateError, PlanningStateError } from "./errors.js";
import { assertProgressPercent } from "./operations.js";

/**
 * M3.7 Cross-Domain Traceability — additive context links.
 * Links never duplicate authority, grant access, or silently cascade.
 * Issue ≠ Task. Deliverable ≠ Document. WorkPackage ≠ Task.
 */

export const TASK_PLANNING_REF_FIELDS = [
  "phaseId",
  "deliverableId",
  "workPackageId",
  "plannedStartAt",
  "estimatedMinutes",
  "progressPercent",
] as const;

export const MILESTONE_PLANNING_REF_FIELDS = ["phaseId", "deliverableId"] as const;

export const DELIVERABLE_DOCUMENT_LINK_FIELDS = [
  "organizationId",
  "projectId",
  "deliverableId",
  "documentId",
  "createdByUserId",
  "createdAt",
] as const;

export const TRACEABILITY_AUDIT_EVENTS = [
  "DOCUMENT_DELIVERABLE_LINKED",
  "DOCUMENT_DELIVERABLE_UNLINKED",
  "TASK_DELIVERY_REFS_UPDATED",
  "MILESTONE_DELIVERY_REFS_UPDATED",
] as const;

export const TRACEABILITY_CONTEXT_SECTIONS = [
  "documents",
  "tasks",
  "milestones",
  "issues",
  "gates",
] as const;

export type TraceabilityContextSection = (typeof TRACEABILITY_CONTEXT_SECTIONS)[number];

export const TRACEABILITY_HIDDEN_PLACEHOLDERS = ["1 item oculto", "item oculto", "hidden item"] as const;

export interface DeliveryChainRow {
  organizationId: string;
  projectId: string;
  phaseId: string;
  deliverableId?: string | null;
}

export interface TaskDeliveryRefsInput {
  organizationId: string;
  projectId: string;
  phaseId?: string | null;
  deliverableId?: string | null;
  workPackageId?: string | null;
}

export interface ResolvedDeliveryRefs {
  phaseId: string | null;
  deliverableId: string | null;
  workPackageId: string | null;
}

export interface LinkedDeliveryObjects {
  phase?: DeliveryChainRow | null;
  deliverable?: DeliveryChainRow | null;
  workPackage?: DeliveryChainRow | null;
}

/** Links are context only — completing a Task never completes parents. */
export function taskCompleteCascadesToWorkPackage(): boolean {
  return false;
}

export function taskCompleteCascadesToDeliverable(): boolean {
  return false;
}

export function taskCompleteCascadesToMilestone(): boolean {
  return false;
}

export function taskCompleteCascadesToIssue(): boolean {
  return false;
}

export function progressPercentTransitsTaskStatus(): boolean {
  return false;
}

export function progressPercent100MarksTaskDone(): boolean {
  return false;
}

export function taskDoneMarksParentComplete(): boolean {
  return false;
}

export function documentDeliverableLinkMutatesDocumentStatus(): boolean {
  return false;
}

export function documentDeliverableLinkMutatesRevisionBytes(): boolean {
  return false;
}

export function documentDeliverableLinkMutatesRevisionStatus(): boolean {
  return false;
}

export function opsInspectorMutatesDocumentStatus(): boolean {
  return false;
}

export function gateReadAdapterMayMutate(): boolean {
  return false;
}

export function gateReadAdapterMayApprove(): boolean {
  return false;
}

export function gateReadAdapterMayRelease(): boolean {
  return false;
}

export function issueEqualsTask(): boolean {
  return false;
}

export function deliverableEqualsDocument(): boolean {
  return false;
}

export function workPackageEqualsTask(): boolean {
  return false;
}

export function teamMembershipImpliesProjectAccess(): boolean {
  return false;
}

export function readyEqualsReleased(): boolean {
  return false;
}

export function exceptionEqualsSatisfied(): boolean {
  return false;
}

export function hiddenCountPlaceholderAllowed(): boolean {
  return false;
}

export function unauthorizedTargetMayLeakCount(): boolean {
  return false;
}

export function auditLinkPayloadMayIncludePrivateContent(): boolean {
  return false;
}

export function assertEstimatedMinutes(value: number | null | undefined): void {
  if (value == null) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new PlanningStateError("estimatedMinutes must be a non-negative integer");
  }
}

export function assertTaskProgressPercent(value: number | null | undefined): void {
  assertProgressPercent(value);
}

/**
 * Resolve optional Task delivery refs against loaded same-tenant objects.
 * Missing parents are inferred from the most specific link. Inconsistent
 * chains are rejected — never rewritten silently.
 */
export function resolveTaskDeliveryRefs(
  input: TaskDeliveryRefsInput,
  linked: LinkedDeliveryObjects,
): ResolvedDeliveryRefs {
  const workPackageId = emptyToNull(input.workPackageId);
  const deliverableId = emptyToNull(input.deliverableId);
  const phaseId = emptyToNull(input.phaseId);

  if (workPackageId) {
    const wp = linked.workPackage;
    if (!wp || wp.organizationId !== input.organizationId || wp.projectId !== input.projectId) {
      throw denySameTenant("Task WorkPackage is not bound to the same Project");
    }
    if (phaseId && phaseId !== wp.phaseId) {
      throw new PlanningStateError("Task phaseId must match the linked WorkPackage phase");
    }
    if (deliverableId) {
      if (wp.deliverableId && deliverableId !== wp.deliverableId) {
        throw new PlanningStateError("Task deliverableId must match the linked WorkPackage deliverable");
      }
      const deliverable = linked.deliverable;
      if (
        !deliverable ||
        deliverable.organizationId !== input.organizationId ||
        deliverable.projectId !== input.projectId
      ) {
        throw denySameTenant("Task Deliverable is not bound to the same Project");
      }
      if (deliverable.phaseId !== wp.phaseId) {
        throw new PlanningStateError("Task WorkPackage and Deliverable must share the same Phase");
      }
    }
    return {
      workPackageId,
      deliverableId: deliverableId ?? wp.deliverableId ?? null,
      phaseId: phaseId ?? wp.phaseId,
    };
  }

  if (deliverableId) {
    const deliverable = linked.deliverable;
    if (
      !deliverable ||
      deliverable.organizationId !== input.organizationId ||
      deliverable.projectId !== input.projectId
    ) {
      throw denySameTenant("Task Deliverable is not bound to the same Project");
    }
    if (phaseId && phaseId !== deliverable.phaseId) {
      throw new PlanningStateError("Task phaseId must match the linked Deliverable phase");
    }
    return {
      workPackageId: null,
      deliverableId,
      phaseId: phaseId ?? deliverable.phaseId,
    };
  }

  if (phaseId) {
    const phase = linked.phase;
    if (!phase || phase.organizationId !== input.organizationId || phase.projectId !== input.projectId) {
      throw denySameTenant("Task Phase is not bound to the same Project");
    }
    return { workPackageId: null, deliverableId: null, phaseId };
  }

  return { workPackageId: null, deliverableId: null, phaseId: null };
}

export function resolveMilestoneDeliveryRefs(
  input: { organizationId: string; projectId: string; phaseId?: string | null; deliverableId?: string | null },
  linked: LinkedDeliveryObjects,
): { phaseId: string | null; deliverableId: string | null } {
  const deliverableId = emptyToNull(input.deliverableId);
  const phaseId = emptyToNull(input.phaseId);
  if (deliverableId) {
    const deliverable = linked.deliverable;
    if (
      !deliverable ||
      deliverable.organizationId !== input.organizationId ||
      deliverable.projectId !== input.projectId
    ) {
      throw denySameTenant("Milestone Deliverable is not bound to the same Project");
    }
    if (phaseId && phaseId !== deliverable.phaseId) {
      throw new PlanningStateError("Milestone phaseId must match the linked Deliverable phase");
    }
    return { deliverableId, phaseId: phaseId ?? deliverable.phaseId };
  }
  if (phaseId) {
    const phase = linked.phase;
    if (!phase || phase.organizationId !== input.organizationId || phase.projectId !== input.projectId) {
      throw denySameTenant("Milestone Phase is not bound to the same Project");
    }
    return { deliverableId: null, phaseId };
  }
  return { deliverableId: null, phaseId: null };
}

export function assertSameTenantProject(
  left: { organizationId: string; projectId: string },
  right: { organizationId: string; projectId: string },
  label: string,
): void {
  if (left.organizationId !== right.organizationId || left.projectId !== right.projectId) {
    throw denySameTenant(`${label} is not bound to the same Project`);
  }
}

/** Both-side AuthZ: link/unlink requires grants on source AND target. */
export function bothSidesAuthorized(sourceGranted: boolean, targetGranted: boolean): boolean {
  return sourceGranted && targetGranted;
}

export function assertBothSidesAuthorized(sourceGranted: boolean, targetGranted: boolean): void {
  if (!bothSidesAuthorized(sourceGranted, targetGranted)) {
    throw denySameTenant("Link requires authorization on both sides");
  }
}

/**
 * Unauthorized linked objects are omitted. Never emit a hidden-count
 * placeholder such as "1 item oculto".
 */
export function omitUnauthorizedSection<T>(authorized: boolean, items: readonly T[]): T[] | undefined {
  if (!authorized) {
    return undefined;
  }
  return [...items];
}

export function contextSectionKeyPresent(
  payload: Record<string, unknown>,
  section: TraceabilityContextSection,
): boolean {
  return Object.prototype.hasOwnProperty.call(payload, section);
}

export function payloadLeaksHiddenCount(payload: unknown): boolean {
  const raw = JSON.stringify(payload ?? "");
  return TRACEABILITY_HIDDEN_PLACEHOLDERS.some((token) => raw.toLowerCase().includes(token.toLowerCase()));
}

/** Audit payloads for link/unlink carry IDs only — never titles, bodies, or bytes. */
export function assertAuditLinkPayloadIdsOnly(payload: Record<string, unknown>): void {
  const allowed = new Set([
    "deliverableId",
    "documentId",
    "taskId",
    "milestoneId",
    "phaseId",
    "workPackageId",
    "issueId",
    "gateId",
    "linkId",
    "from",
    "to",
  ]);
  const forbidden = ["title", "description", "body", "bytes", "content", "checksum", "fileName", "revisionCode"];
  for (const key of Object.keys(payload)) {
    if (forbidden.includes(key) || !allowed.has(key)) {
      throw new OperationsStateError("Audit link payload may include identifiers only");
    }
  }
}

export function linkAuditPayload(ids: {
  deliverableId?: string | null;
  documentId?: string | null;
  taskId?: string | null;
  milestoneId?: string | null;
  phaseId?: string | null;
  workPackageId?: string | null;
  issueId?: string | null;
  gateId?: string | null;
  linkId?: string | null;
}): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(ids)) {
    if (typeof value === "string" && value) {
      payload[key] = value;
    }
  }
  assertAuditLinkPayloadIdsOnly(payload);
  return payload;
}

export function deepLinkWithReturn(href: string, returnTo: string | null | undefined): string {
  if (!returnTo) {
    return href;
  }
  const url = new URL(href, "https://amber.invalid");
  url.searchParams.set("returnTo", returnTo);
  return `${url.pathname}${url.search}`;
}

export function preserveReturnPath(search: string | URLSearchParams): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  const from = params.get("from");
  const returnInspect = params.get("returnInspect");
  const returnTo = params.get("returnTo");
  if (returnTo) {
    return returnTo;
  }
  if (from && returnInspect) {
    return `/projects/:projectId/${from}?inspect=${encodeURIComponent(returnInspect)}`;
  }
  if (from) {
    return `/projects/:projectId/${from}`;
  }
  return null;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null || value === "") {
    return null;
  }
  return value;
}

function denySameTenant(detail: string): DenyByDefaultError {
  return new DenyByDefaultError(detail);
}
