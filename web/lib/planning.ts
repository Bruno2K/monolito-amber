export const PLANNER_VIEWS = ["list", "kanban", "gantt", "milestones"] as const;
export type PlannerView = (typeof PLANNER_VIEWS)[number];

export interface PlanningPreview {
  issue?: { id: string; title: string; status: string; relation: "issue" };
  phase?: { id: string; name: string };
  deliverable?: { id: string; code: string; title: string };
  workPackage?: { id: string; title: string; code?: string | null };
  milestone?: { id: string; title: string; recordedStatus: string; status: string };
  assignee?: { userId: string; displayName: string };
}

export interface PlanningTaskRow {
  id: string;
  organizationId: string;
  projectId: string;
  issueId: string | null;
  milestoneId: string | null;
  phaseId: string | null;
  deliverableId: string | null;
  workPackageId: string | null;
  title: string;
  description: string;
  status: string;
  late: boolean;
  kanbanColumn: "PLANEJADAS" | "EM_ANDAMENTO" | "EM_RISCO" | "BLOQUEADAS" | null;
  priority: string | null;
  responsibleDisciplineId: string | null;
  assigneeUserId: string | null;
  dueDate: string | null;
  plannedStartAt: string | null;
  estimatedMinutes: number | null;
  progressPercent: number | null;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  previews: PlanningPreview;
}

export interface PlanningMilestoneRow {
  id: string;
  title: string;
  recordedStatus: string;
  status: string;
  targetDate: string | null;
  phaseId: string | null;
  deliverableId: string | null;
}

export interface PlanningDependencyRow {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: string;
}

export interface PlanningReadModel {
  projectId: string;
  organizationId: string;
  generatedAt: string;
  view: PlannerView | string;
  project: { archivedAt: string | null; readOnly: boolean };
  tasks: PlanningTaskRow[];
  milestones: PlanningMilestoneRow[];
  dependencies: PlanningDependencyRow[];
  page: { page: number; pageSize: number; total: number; sort: string; order: "asc" | "desc" | string };
  counts: { total: number; late: number; byStatus: Record<string, number> };
  inspected: PlanningTaskRow | null;
}

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "TODO":
      return "A fazer";
    case "IN_PROGRESS":
      return "Em andamento";
    case "BLOCKED":
      return "Bloqueada";
    case "DONE":
      return "Concluída";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

export function lateExplanation(status: string): string {
  return `Prazo anterior a agora. O status armazenado permanece ${taskStatusLabel(status)} — atrasada não é um status.`;
}

export function plannerPath(
  projectId: string,
  params: {
    view?: string | null;
    q?: string | null;
    status?: string | null;
    late?: string | null;
    phaseId?: string | null;
    page?: string | number | null;
    sort?: string | null;
    order?: string | null;
    inspect?: string | null;
  } = {},
): string {
  const search = new URLSearchParams();
  const view = params.view && params.view !== "list" ? params.view : null;
  if (view) {
    search.set("view", view);
  }
  if (params.q) {
    search.set("q", String(params.q));
  }
  if (params.status) {
    search.set("status", String(params.status));
  }
  if (params.late) {
    search.set("late", String(params.late));
  }
  if (params.phaseId) {
    search.set("phaseId", String(params.phaseId));
  }
  if (params.page && Number(params.page) > 1) {
    search.set("page", String(params.page));
  }
  if (params.sort && params.sort !== "createdAt") {
    search.set("sort", String(params.sort));
  }
  if (params.order && params.order !== "asc") {
    search.set("order", String(params.order));
  }
  if (params.inspect) {
    search.set("inspect", String(params.inspect));
  }
  const qs = search.toString();
  return qs ? `/projects/${projectId}/planner?${qs}` : `/projects/${projectId}/planner`;
}

export function contextLabel(row: PlanningTaskRow): string {
  const parts: string[] = [];
  if (row.previews.phase?.name) {
    parts.push(row.previews.phase.name);
  }
  if (row.previews.deliverable) {
    parts.push(row.previews.deliverable.code || row.previews.deliverable.title);
  }
  if (row.previews.workPackage) {
    parts.push(row.previews.workPackage.code || row.previews.workPackage.title);
  }
  return parts.join(" · ") || "—";
}

export function formatPlanningDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toISOString().slice(0, 10);
}

export function formatProgress(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return `${value}%`;
}
