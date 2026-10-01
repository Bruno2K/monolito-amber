export const PHASE_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export interface PhaseRow {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  description: string;
  sequence: number;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  status: PhaseStatus | string;
  createdBy: string;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisciplineRow {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  active: boolean;
  sortOrder: number | null;
}

export interface PhaseListResponse {
  items: PhaseRow[];
  nextCursor: string | null;
}

export interface DisciplineListResponse {
  items: DisciplineRow[];
}

export function phaseStatusLabel(status: string): string {
  switch (status) {
    case "PLANNED":
      return "Planejada";
    case "ACTIVE":
      return "Ativa";
    case "COMPLETED":
      return "Concluída";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

export function formatPhaseDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toISOString().slice(0, 10);
}

export function structureDeepLink(projectId: string, phaseId?: string | null): string {
  const base = `/projects/${projectId}/structure`;
  return phaseId ? `${base}?phase=${encodeURIComponent(phaseId)}` : base;
}

export function canCreatePhase(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("phase.create"));
}

export function canUpdatePhase(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("phase.update"));
}

export function canCompletePhase(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("phase.complete"));
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const DELIVERABLE_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "APPROVED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export interface DeliverableRow {
  id: string;
  organizationId: string;
  projectId: string;
  phaseId: string;
  disciplineId: string;
  code: string;
  title: string;
  description: string;
  ownerProjectMembershipId: string | null;
  ownerTeamId: string | null;
  plannedStartAt: string | null;
  dueAt: string | null;
  status: DeliverableStatus | string;
  progressPercent: number | null;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverableListResponse {
  items: DeliverableRow[];
  nextCursor: string | null;
}

export interface TeamRow {
  id: string;
  organizationId: string;
  name: string;
}

export interface TeamListResponse {
  items: TeamRow[];
}

export interface ProjectMemberRow {
  id: string;
  status: string;
  email?: string;
  displayName?: string;
}

export function deliverableStatusLabel(status: string): string {
  switch (status) {
    case "PLANNED":
      return "Planejada";
    case "IN_PROGRESS":
      return "Em curso";
    case "IN_REVIEW":
      return "Em revisão";
    case "APPROVED":
      return "Aprovada";
    case "DELIVERED":
      return "Entregue";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

export function deliverablesDeepLink(projectId: string, deliverableId?: string | null): string {
  const base = `/projects/${projectId}/deliverables`;
  return deliverableId ? `${base}?inspect=${encodeURIComponent(deliverableId)}` : base;
}

export function canCreateDeliverable(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("deliverable.create"));
}

export function canUpdateDeliverable(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("deliverable.update"));
}

export function canAssignDeliverable(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("deliverable.assign"));
}

export function canApproveDeliverable(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("deliverable.approve"));
}

export function canDeliverDeliverable(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("deliverable.deliver"));
}

export function formatProgress(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return `${value}%`;
}

export const WORK_PACKAGE_STATUSES = ["PLANNED", "ACTIVE", "BLOCKED", "DONE", "CANCELLED"] as const;
export type WorkPackageStatus = (typeof WORK_PACKAGE_STATUSES)[number];

export interface WorkPackageRow {
  id: string;
  organizationId: string;
  projectId: string;
  phaseId: string;
  deliverableId: string | null;
  disciplineId: string | null;
  code: string | null;
  title: string;
  description: string;
  blockedReason: string | null;
  ownerProjectMembershipId: string | null;
  ownerTeamId: string | null;
  plannedStartAt: string | null;
  dueAt: string | null;
  status: WorkPackageStatus | string;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkPackageListResponse {
  items: WorkPackageRow[];
  nextCursor: string | null;
}

export function workPackageStatusLabel(status: string): string {
  switch (status) {
    case "PLANNED":
      return "Planejado";
    case "ACTIVE":
      return "Ativo";
    case "BLOCKED":
      return "Bloqueado";
    case "DONE":
      return "Concluído";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status;
  }
}

export function workPackagesDeepLink(projectId: string, workPackageId?: string | null): string {
  const base = `/projects/${projectId}/work-packages`;
  return workPackageId ? `${base}?inspect=${encodeURIComponent(workPackageId)}` : base;
}

export function withReturnPath(href: string, returnTo?: string | null): string {
  if (!returnTo) {
    return href;
  }
  const url = new URL(href, "https://amber.invalid");
  url.searchParams.set("returnTo", returnTo);
  return `${url.pathname}${url.search}`;
}

export function safeReturnTo(value: string | null | undefined, projectId: string): string | null {
  if (!value) {
    return null;
  }
  const prefix = `/projects/${projectId}/`;
  if (!value.startsWith(prefix) || value.includes("://") || value.startsWith("//")) {
    return null;
  }
  return value;
}

export interface TraceabilityDocumentRow {
  id: string;
  code: string;
  title: string;
  status: string;
  currentRevision: {
    id: string;
    revisionCode: string;
    status: string;
    publishedAt: string | null;
  } | null;
}

export interface TraceabilityTaskRow {
  id: string;
  title: string;
  status: string;
  progressPercent: number | null;
  dueDate: string | null;
  issueId: string | null;
  milestoneId: string | null;
  workPackageId: string | null;
  deliverableId: string | null;
  phaseId: string | null;
}

export interface TraceabilityMilestoneRow {
  id: string;
  title: string;
  status: string;
  recordedStatus?: string;
  targetDate: string | null;
  phaseId: string | null;
  deliverableId: string | null;
}

export interface TraceabilityIssueRow {
  id: string;
  title: string;
  status: string;
  origin: string;
  severity: string | null;
  priority: string | null;
}

export interface TraceabilityGateRow {
  id: string;
  name: string;
  status: string;
  lastEvaluatedAt: string | null;
  releasedAt: string | null;
  releaseKind: string | null;
  readOnly: boolean;
}

export interface TraceabilityContext {
  organizationId: string;
  projectId: string;
  deliverableId: string | null;
  workPackageId: string | null;
  phaseId: string;
  canLinkDocuments?: boolean;
  documents?: TraceabilityDocumentRow[];
  tasks?: TraceabilityTaskRow[];
  milestones?: TraceabilityMilestoneRow[];
  issues?: TraceabilityIssueRow[];
  gates?: TraceabilityGateRow[];
}

export function canLinkDeliverableDocument(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("deliverable.update") && permissions?.includes("document.read"));
}

export function canCreateWorkPackage(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("work_package.create"));
}

export function canUpdateWorkPackage(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("work_package.update"));
}

export function canCompleteWorkPackage(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("work_package.complete"));
}

export function canDisassociateWorkPackage(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("deliverable.update"));
}
