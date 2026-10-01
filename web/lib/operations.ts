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
