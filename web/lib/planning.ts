export const PLANNER_VIEWS = ["list", "kanban", "gantt", "milestones"] as const;
export type PlannerView = (typeof PLANNER_VIEWS)[number];

export type KanbanColumn = "PLANEJADAS" | "EM_ANDAMENTO" | "EM_RISCO" | "BLOQUEADAS";
export const KANBAN_COLUMNS: KanbanColumn[] = ["PLANEJADAS", "EM_ANDAMENTO", "EM_RISCO", "BLOQUEADAS"];

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
  kanbanColumn: KanbanColumn | null;
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
  history?: PlanningHistoryEvent[];
  dependencyStartBlocked?: boolean;
  startBlockers?: PlanningStartBlocker[];
  predecessors?: PlanningNeighborLink[];
  successors?: PlanningNeighborLink[];
}

export interface PlanningStartBlocker {
  predecessorTaskId: string;
  status: string;
  title?: string;
  message: string;
}

export interface PlanningNeighborLink {
  dependencyId: string;
  taskId: string;
  title?: string;
  status: string;
}

export interface PlanningHistoryEvent {
  id: string;
  eventType: string;
  actorUserId: string | null;
  createdAt: string;
  payload: Record<string, unknown> | unknown;
}

export interface MilestoneRiskReason {
  code: string;
  text: string;
}

export interface MilestoneRiskSource {
  kind: "TASK";
  id: string;
}

export interface MilestoneRisk {
  recordedStatus?: string;
  status?: string;
  reasons: MilestoneRiskReason[];
  explanation: string;
  sources: MilestoneRiskSource[];
}

export interface PlanningMilestoneRow {
  id: string;
  title: string;
  description?: string;
  recordedStatus: string;
  status: string;
  targetDate: string | null;
  phaseId: string | null;
  deliverableId: string | null;
  version?: number;
  risk?: MilestoneRisk;
}

export interface PlanningDependencyRow {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: string;
}

export type ScheduleLaneKind = "PHASE" | "DELIVERABLE" | "WORK_PACKAGE" | "TASK" | "MILESTONE";

export interface PlanningScheduleLane {
  kind: ScheduleLaneKind;
  id: string;
  domain: string;
  sourceId: string;
  title: string;
  code: string | null;
  parent: { kind: ScheduleLaneKind; id: string } | null;
  depth: number;
  start: string | null;
  end: string | null;
  status: string | null;
  recordedStatus: string | null;
  late: boolean;
  risk: { code: string; text: string } | null;
  version: number | null;
}

export interface PlanningScheduleLink {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: string;
}

export interface PlanningSchedule {
  dateRange: { start: string; end: string };
  take: number;
  truncated: boolean;
  canEditTaskDates: boolean;
  lanes: PlanningScheduleLane[];
  links: PlanningScheduleLink[];
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
  schedule?: PlanningSchedule;
  page: { page: number; pageSize: number; total: number; sort: string; order: "asc" | "desc" | string };
  counts: {
    total: number;
    late: number;
    byStatus: Record<string, number>;
    byKanbanColumn?: Record<KanbanColumn, number>;
  };
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
    milestone?: string | null;
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
  if (params.milestone) {
    search.set("milestone", String(params.milestone));
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

export function canCreateTask(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("task.create"));
}

export function canUpdateTask(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("task.update"));
}

export function canAssignTask(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("task.assign"));
}

export function canCompleteTask(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("task.complete"));
}

export function canCreateMilestone(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("milestone.create"));
}

export function canUpdateMilestone(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("milestone.update"));
}

export function canAchieveMilestone(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("milestone.achieve"));
}

export function milestoneStatusLabel(status: string): string {
  switch (status) {
    case "PLANNED":
      return "Planejado";
    case "AT_RISK":
      return "Em risco";
    case "MISSED":
      return "Perdido";
    case "ACHIEVED":
      return "Concluído";
    case "CANCELLED":
      return "Cancelado";
    default:
      return status;
  }
}

export function milestoneRiskExplanation(row: PlanningMilestoneRow): string {
  if (row.risk?.explanation) {
    return row.risk.explanation;
  }
  if (row.status === "AT_RISK") {
    return "Pelo menos uma tarefa autorizada vinculada está atrasada, bloqueada ou aguardando predecessor. O status armazenado permanece Planejado.";
  }
  if (row.status === "MISSED") {
    return "A data-alvo já passou. O status armazenado permanece Planejado — Perdido não é persistido.";
  }
  if (row.status === "ACHIEVED") {
    return "Marco alcançado por comando explícito. Risco derivado não substitui ACHIEVED.";
  }
  if (row.status === "CANCELLED") {
    return "Marco cancelado por comando explícito. Risco derivado não substitui CANCELLED.";
  }
  return "Marco permanece planejado. Nenhum contribuinte autorizado atrasado, bloqueado ou com predecessor incompleto.";
}

export function nextMilestone(rows: readonly PlanningMilestoneRow[], now = new Date()): PlanningMilestoneRow | null {
  const upcoming = rows
    .filter((row) => row.recordedStatus === "PLANNED" && row.targetDate && Date.parse(row.targetDate) >= now.getTime())
    .sort((left, right) => Date.parse(left.targetDate!) - Date.parse(right.targetDate!));
  return upcoming[0] ?? rows.find((row) => row.recordedStatus === "PLANNED") ?? null;
}

export function milestoneKpis(rows: readonly PlanningMilestoneRow[]) {
  const counted = rows.filter((row) => row.recordedStatus !== "CANCELLED");
  const achieved = counted.filter((row) => row.recordedStatus === "ACHIEVED").length;
  return {
    next: nextMilestone(rows),
    achieved,
    total: counted.length,
    ratio: counted.length === 0 ? 0 : achieved / counted.length,
    atRisk: rows.filter((row) => row.status === "AT_RISK").length,
    missed: rows.filter((row) => row.status === "MISSED").length,
  };
}

export function isoDateInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function dateInputToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return `${trimmed}T00:00:00.000Z`;
}

export function auditEventLabel(eventType: string): string {
  switch (eventType) {
    case "TASK_CREATED":
      return "Criada";
    case "TASK_UPDATED":
      return "Campos atualizados";
    case "TASK_ASSIGNED":
      return "Atribuição";
    case "TASK_DUE_DATE_CHANGED":
      return "Datas alteradas";
    case "TASK_PROGRESS_CHANGED":
      return "Progresso alterado";
    case "TASK_STATUS_CHANGED":
      return "Status alterado";
    case "TASK_BLOCKED":
      return "Bloqueada";
    case "TASK_UNBLOCKED":
      return "Desbloqueada";
    case "TASK_COMPLETED":
      return "Concluída";
    case "TASK_CANCELLED":
      return "Cancelada";
    case "TASK_DELIVERY_REFS_UPDATED":
      return "Relações atualizadas";
    case "TASK_DEPENDENCY_CREATED":
      return "Dependência criada";
    case "TASK_DEPENDENCY_REMOVED":
      return "Dependência removida";
    default:
      return eventType;
  }
}

export function dependencyStartExplanation(blockers: PlanningStartBlocker[] | undefined): string {
  if (!blockers?.length) {
    return "Início bloqueado por predecessor incompleto (término-início). Isto não é o estado Bloqueada.";
  }
  const names = blockers.map((item) => item.title || item.predecessorTaskId).join(", ");
  return `Início bloqueado: predecessor${blockers.length === 1 ? "" : "es"} ${names} ainda não concluído${blockers.length === 1 ? "" : "s"}. Isto não é o estado Bloqueada.`;
}

export function kanbanColumnLabel(column: KanbanColumn): string {
  switch (column) {
    case "PLANEJADAS":
      return "Planejadas";
    case "EM_ANDAMENTO":
      return "Em andamento";
    case "EM_RISCO":
      return "Em risco";
    case "BLOQUEADAS":
      return "Bloqueadas";
    default:
      return column;
  }
}

export function kanbanRiskExplanation(row: PlanningTaskRow): string {
  if (row.status === "BLOCKED") {
    return row.blockedReason
      ? `Bloqueada (estado armazenado): ${row.blockedReason}. Isto não é um bloqueio por dependência.`
      : "Bloqueada (estado armazenado). Isto não é um bloqueio por dependência.";
  }
  if (row.dependencyStartBlocked && row.status !== "BLOCKED") {
    return dependencyStartExplanation(row.startBlockers);
  }
  if (row.late) {
    return lateExplanation(row.status);
  }
  return "";
}

export type KanbanMoveIntent =
  | { kind: "command"; command: "start" | "block" | "unblock" }
  | { kind: "noop"; reason: "KANBAN_NOOP"; message: string }
  | {
      kind: "reject";
      reason: "KANBAN_DERIVED_COLUMN" | "KANBAN_INVALID_TRANSITION" | "KANBAN_DATE_SHIFT_REQUIRED";
      message: string;
    };

/**
 * Command map only. Uses API `status` + `late` — does not recompute schedule risk or walk dependencies.
 * Keep aligned with `@amber/shared` `resolveKanbanColumnMove`.
 */
export function resolveKanbanColumnMove(input: {
  status: string;
  late: boolean;
  kanbanColumn: KanbanColumn | null;
  to: KanbanColumn;
}): KanbanMoveIntent {
  if (input.kanbanColumn === input.to) {
    return { kind: "noop", reason: "KANBAN_NOOP", message: "O cartão já projeta nesta coluna." };
  }
  if (input.to === "EM_RISCO") {
    return {
      kind: "reject",
      reason: "KANBAN_DERIVED_COLUMN",
      message: "EM RISCO é uma visão derivada de atraso (TODO ou Em andamento) — não é um estado armazenado.",
    };
  }
  if (input.to === "PLANEJADAS") {
    if (input.status === "TODO" && input.late) {
      return {
        kind: "reject",
        reason: "KANBAN_DATE_SHIFT_REQUIRED",
        message: "Sair de EM RISCO exige alterar o prazo no inspetor. Datas não são deslocadas automaticamente.",
      };
    }
    return {
      kind: "reject",
      reason: "KANBAN_INVALID_TRANSITION",
      message: "A tarefa não volta para A fazer. Planejadas é a projeção de TODO no prazo.",
    };
  }
  if (input.to === "EM_ANDAMENTO") {
    if (input.status === "TODO") {
      return { kind: "command", command: "start" };
    }
    if (input.status === "BLOCKED") {
      return { kind: "command", command: "unblock" };
    }
    if (input.status === "IN_PROGRESS" && input.late) {
      return {
        kind: "reject",
        reason: "KANBAN_DATE_SHIFT_REQUIRED",
        message: "A tarefa continua atrasada, por isso permanece em EM RISCO até o prazo mudar.",
      };
    }
    return {
      kind: "reject",
      reason: "KANBAN_INVALID_TRANSITION",
      message: `Transição inválida de ${taskStatusLabel(input.status)} para Em andamento.`,
    };
  }
  if (input.status === "IN_PROGRESS") {
    return { kind: "command", command: "block" };
  }
  return {
    kind: "reject",
    reason: "KANBAN_INVALID_TRANSITION",
    message: `A tarefa não pode ir de ${taskStatusLabel(input.status)} para Bloqueada.`,
  };
}

export function countVisibleKanbanColumns(tasks: PlanningTaskRow[]): Record<KanbanColumn, number> {
  const counts: Record<KanbanColumn, number> = {
    PLANEJADAS: 0,
    EM_ANDAMENTO: 0,
    EM_RISCO: 0,
    BLOQUEADAS: 0,
  };
  for (const row of tasks) {
    if (row.kanbanColumn) {
      counts[row.kanbanColumn] += 1;
    }
  }
  return counts;
}

export function compactTaskId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function scheduleLaneKindLabel(kind: ScheduleLaneKind): string {
  switch (kind) {
    case "PHASE":
      return "Fase";
    case "DELIVERABLE":
      return "Entrega";
    case "WORK_PACKAGE":
      return "Pacote";
    case "TASK":
      return "Tarefa";
    case "MILESTONE":
      return "Marco";
    default:
      return kind;
  }
}

export function scheduleRiskLabel(lane: PlanningScheduleLane): string {
  if (lane.risk?.text) {
    return lane.risk.text;
  }
  if (lane.kind === "TASK" && lane.late) {
    return lateExplanation(lane.status ?? "TODO");
  }
  return "";
}

export function resolveGanttDateEdit(input: {
  kind: ScheduleLaneKind;
  propagate?: boolean;
  shiftSuccessors?: boolean;
}): { kind: "apply" } | { kind: "reject"; reason: "DEPENDENCY_DATE_SHIFT_REJECTED"; message: string } {
  if (input.kind !== "TASK") {
    return {
      kind: "reject",
      reason: "DEPENDENCY_DATE_SHIFT_REJECTED",
      message: "O Gantt só edita datas da Tarefa. Fase, Entrega, Pacote e Marco permanecem no objeto de origem.",
    };
  }
  if (input.propagate || input.shiftSuccessors) {
    return {
      kind: "reject",
      reason: "DEPENDENCY_DATE_SHIFT_REJECTED",
      message: "Datas não se propagam para predecessores, sucessores ou pais. Cada agregado permanece a fonte da verdade.",
    };
  }
  return { kind: "apply" };
}

export function ganttBarOffset(input: {
  start: string | null;
  end: string | null;
  rangeStart: string;
  rangeEnd: string;
}): { left: number; width: number } | null {
  const rangeStart = Date.parse(input.rangeStart);
  const rangeEnd = Date.parse(input.rangeEnd);
  const start = input.start ? Date.parse(input.start) : Number.NaN;
  const end = input.end ? Date.parse(input.end) : Number.NaN;
  if (Number.isNaN(rangeStart) || Number.isNaN(rangeEnd) || rangeEnd <= rangeStart) {
    return null;
  }
  const hasStart = !Number.isNaN(start);
  const hasEnd = !Number.isNaN(end);
  if (!hasStart && !hasEnd) {
    return null;
  }
  const barStart = hasStart ? start : end;
  const barEnd = hasEnd ? end : start + 86_400_000;
  const span = rangeEnd - rangeStart;
  const left = Math.max(0, ((barStart - rangeStart) / span) * 100);
  const width = Math.max(0.8, ((Math.max(barEnd, barStart) - barStart) / span) * 100);
  return { left, width: Math.min(width, 100 - left) };
}
