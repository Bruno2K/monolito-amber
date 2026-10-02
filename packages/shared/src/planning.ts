import { PlanningStateError } from "./errors.js";

/**
 * Task lifecycle — APPROVED 0.5 §3.
 * TODO → IN_PROGRESS → BLOCKED | DONE. CANCELLED is a side state.
 * Lateness is derived (due date + completion). There is no OVERDUE status.
 */
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_DEPENDENCY_TYPES = ["FINISH_TO_START"] as const;
export type TaskDependencyType = (typeof TASK_DEPENDENCY_TYPES)[number];

/**
 * Stored Milestone lifecycle. AT_RISK and MISSED are derived on read
 * (0.5 §6; 0.7 leaves exact AT_RISK thresholds as an open question).
 */
export const MILESTONE_RECORDED_STATUSES = ["PLANNED", "ACHIEVED", "CANCELLED"] as const;
export type MilestoneRecordedStatus = (typeof MILESTONE_RECORDED_STATUSES)[number];

export const MILESTONE_STATUSES = ["PLANNED", "AT_RISK", "ACHIEVED", "MISSED", "CANCELLED"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "DONE", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
};

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function isTaskDependencyType(value: string): value is TaskDependencyType {
  return (TASK_DEPENDENCY_TYPES as readonly string[]).includes(value);
}

export function isMilestoneRecordedStatus(value: string): value is MilestoneRecordedStatus {
  return (MILESTONE_RECORDED_STATUSES as readonly string[]).includes(value);
}

export function isMilestoneStatus(value: string): value is MilestoneStatus {
  return (MILESTONE_STATUSES as readonly string[]).includes(value);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!TASK_TRANSITIONS[from].includes(to)) {
    throw new PlanningStateError(`Task cannot transition from ${from} to ${to}`);
  }
}

export function taskStatusRequiresCompletePermission(to: TaskStatus): boolean {
  return to === "DONE";
}

export function taskStatusRequiresBlockedReason(to: TaskStatus): boolean {
  return to === "BLOCKED";
}

/**
 * Derived lateness (0.5 §5). Not a status. DONE / CANCELLED are never late.
 */
export function isTaskLate(input: { dueDate: Date | null; status: TaskStatus; now?: Date }): boolean {
  if (!input.dueDate) {
    return false;
  }
  if (input.status === "DONE" || input.status === "CANCELLED") {
    return false;
  }
  return input.dueDate.getTime() < (input.now ?? new Date()).getTime();
}

/**
 * Documented AT_RISK / MISSED baseline (ADR-016).
 * Does not invent day-windows, % complete, or "critical" thresholds.
 *
 * - Explicit ACHIEVED / CANCELLED always win.
 * - MISSED = still PLANNED and targetDate is in the past.
 * - AT_RISK = still PLANNED and at least one linked Task is late (0.5: overdue Tasks endanger a future Milestone).
 * - Otherwise PLANNED.
 */
export function deriveMilestoneStatus(input: {
  recordedStatus: MilestoneRecordedStatus;
  targetDate: Date | null;
  linkedTasksLate: boolean;
  now?: Date;
}): MilestoneStatus {
  if (input.recordedStatus === "ACHIEVED") {
    return "ACHIEVED";
  }
  if (input.recordedStatus === "CANCELLED") {
    return "CANCELLED";
  }
  const now = input.now ?? new Date();
  if (input.targetDate && input.targetDate.getTime() < now.getTime()) {
    return "MISSED";
  }
  if (input.linkedTasksLate) {
    return "AT_RISK";
  }
  return "PLANNED";
}

export interface TaskDependencyEdge {
  predecessorTaskId: string;
  successorTaskId: string;
}

/**
 * Finish-to-start cycle check over a same-Project edge set only.
 * Callers must never pass edges from another Organization/Project.
 */
export function wouldCreateCycle(
  edges: readonly TaskDependencyEdge[],
  predecessorTaskId: string,
  successorTaskId: string,
): boolean {
  if (predecessorTaskId === successorTaskId) {
    return true;
  }
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adj.get(edge.predecessorTaskId) ?? [];
    list.push(edge.successorTaskId);
    adj.set(edge.predecessorTaskId, list);
  }
  const next = adj.get(predecessorTaskId) ?? [];
  next.push(successorTaskId);
  adj.set(predecessorTaskId, next);

  const seen = new Set<string>();
  const stack = [successorTaskId];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === predecessorTaskId) {
      return true;
    }
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    for (const child of adj.get(node) ?? []) {
      stack.push(child);
    }
  }
  return false;
}

export function assertAcyclicDependency(
  edges: readonly TaskDependencyEdge[],
  predecessorTaskId: string,
  successorTaskId: string,
): void {
  if (predecessorTaskId === successorTaskId) {
    throw new PlanningStateError("A Task cannot depend on itself");
  }
  if (wouldCreateCycle(edges, predecessorTaskId, successorTaskId)) {
    throw new PlanningStateError("Task dependency would create a cycle");
  }
}

export function assertFinishToStartType(value: string | undefined): asserts value is TaskDependencyType | undefined {
  if (value != null && value !== "FINISH_TO_START") {
    throw new PlanningStateError("Only finish-to-start Task dependencies are supported");
  }
}

export function prerequisitesBlockStart(predecessors: readonly { status: string }[]): boolean {
  return predecessors.some((row) => row.status !== "DONE");
}

/** M3.7 additive Task schedule fields. Status remains an explicit transition. */
export const TASK_PROGRESS_FIELDS = ["plannedStartAt", "estimatedMinutes", "progressPercent"] as const;

/**
 * Figma Kanban columns are a derived projection (M4.1 gap analysis).
 * Never persisted on `planning.tasks.status`. DONE / CANCELLED have no column.
 */
export const KANBAN_COLUMNS = ["PLANEJADAS", "EM_ANDAMENTO", "EM_RISCO", "BLOQUEADAS"] as const;
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const PLANNING_VIEWS = ["list", "kanban", "gantt", "milestones"] as const;
export type PlanningView = (typeof PLANNING_VIEWS)[number];

export const PLANNING_LIST_SORTS = [
  "title",
  "dueDate",
  "plannedStartAt",
  "status",
  "progressPercent",
  "createdAt",
] as const;
export type PlanningListSort = (typeof PLANNING_LIST_SORTS)[number];

export const PLANNING_PAGE_SIZE_DEFAULT = 20;
export const PLANNING_PAGE_SIZE_MAX = 50;

export function isPlanningView(value: string | null | undefined): value is PlanningView {
  return value != null && (PLANNING_VIEWS as readonly string[]).includes(value);
}

export function isPlanningListSort(value: string | null | undefined): value is PlanningListSort {
  return value != null && (PLANNING_LIST_SORTS as readonly string[]).includes(value);
}

export function deriveKanbanColumn(input: { status: TaskStatus; late: boolean }): KanbanColumn | null {
  if (input.status === "DONE" || input.status === "CANCELLED") {
    return null;
  }
  if (input.status === "BLOCKED") {
    return "BLOQUEADAS";
  }
  if (input.late && (input.status === "TODO" || input.status === "IN_PROGRESS")) {
    return "EM_RISCO";
  }
  if (input.status === "TODO") {
    return "PLANEJADAS";
  }
  if (input.status === "IN_PROGRESS") {
    return "EM_ANDAMENTO";
  }
  return null;
}

export function clampPlanningPageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || value == null || value < 1) {
    return PLANNING_PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.floor(value), PLANNING_PAGE_SIZE_MAX);
}

export function planningListSortCompare(
  left: { title: string; dueDate: Date | string | null; plannedStartAt: Date | string | null; status: string; progressPercent: number | null; createdAt: Date | string },
  right: typeof left,
  sort: PlanningListSort,
): number {
  const time = (value: Date | string | null) => {
    if (!value) {
      return Number.POSITIVE_INFINITY;
    }
    const ms = typeof value === "string" ? Date.parse(value) : value.getTime();
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
  };
  switch (sort) {
    case "title":
      return left.title.localeCompare(right.title);
    case "dueDate":
      return time(left.dueDate) - time(right.dueDate);
    case "plannedStartAt":
      return time(left.plannedStartAt) - time(right.plannedStartAt);
    case "status":
      return left.status.localeCompare(right.status);
    case "progressPercent":
      return (left.progressPercent ?? -1) - (right.progressPercent ?? -1);
    case "createdAt":
    default:
      return time(left.createdAt) - time(right.createdAt);
  }
}
