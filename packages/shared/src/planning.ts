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

export const PLANNING_REJECTION_REASONS = [
  "DEPENDENCY_SELF",
  "DEPENDENCY_DUPLICATE",
  "DEPENDENCY_CYCLE",
  "DEPENDENCY_KIND_UNSUPPORTED",
  "DEPENDENCY_RETROACTIVE",
  "DEPENDENCY_PREDECESSOR_INCOMPLETE",
  "DEPENDENCY_DATE_SHIFT_REJECTED",
] as const;
export type PlanningRejectionReason = (typeof PLANNING_REJECTION_REASONS)[number];

export const PLANNING_DEPENDENCY_CANDIDATE_PAGE_MAX = 50;

export interface DependencyStartBlocker {
  predecessorTaskId: string;
  status: string;
  title?: string;
  message: string;
}

export function incompletePredecessorBlockers(
  predecessors: readonly { id: string; status: string; title?: string }[],
): DependencyStartBlocker[] {
  return predecessors
    .filter((row) => row.status !== "DONE")
    .map((row) => ({
      predecessorTaskId: row.id,
      status: row.status,
      ...(row.title ? { title: row.title } : {}),
      message: `Predecessor is ${row.status}, not DONE`,
    }));
}

export function assertAcyclicDependency(
  edges: readonly TaskDependencyEdge[],
  predecessorTaskId: string,
  successorTaskId: string,
): void {
  if (predecessorTaskId === successorTaskId) {
    throw new PlanningStateError("A Task cannot depend on itself", { reason: "DEPENDENCY_SELF" });
  }
  if (wouldCreateCycle(edges, predecessorTaskId, successorTaskId)) {
    throw new PlanningStateError("Task dependency would create a cycle", { reason: "DEPENDENCY_CYCLE" });
  }
}

export function assertFinishToStartType(value: string | undefined): asserts value is TaskDependencyType | undefined {
  if (value != null && value !== "FINISH_TO_START") {
    throw new PlanningStateError("Only finish-to-start Task dependencies are supported", {
      reason: "DEPENDENCY_KIND_UNSUPPORTED",
    });
  }
}

export function prerequisitesBlockStart(predecessors: readonly { status: string }[]): boolean {
  return predecessors.some((row) => row.status !== "DONE");
}

/** Successor already started or completed cannot receive an unfinished predecessor. */
export function successorRejectsUnfinishedPredecessor(successorStatus: string): boolean {
  return successorStatus === "IN_PROGRESS" || successorStatus === "BLOCKED" || successorStatus === "DONE";
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

export const KANBAN_MOVE_REASONS = [
  "KANBAN_DERIVED_COLUMN",
  "KANBAN_INVALID_TRANSITION",
  "KANBAN_DATE_SHIFT_REQUIRED",
  "KANBAN_NOOP",
] as const;
export type KanbanMoveReason = (typeof KANBAN_MOVE_REASONS)[number];

export type KanbanLifecycleCommand = "start" | "block" | "unblock";

export type KanbanMoveIntent =
  | { kind: "command"; command: KanbanLifecycleCommand }
  | { kind: "noop"; reason: "KANBAN_NOOP"; message: string }
  | { kind: "reject"; reason: Exclude<KanbanMoveReason, "KANBAN_NOOP">; message: string };

/**
 * Maps a Kanban column drop/menu choice to an existing M4.3 lifecycle command.
 * Does not invent a stored Portuguese status and does not shift dates.
 */
export function resolveKanbanColumnMove(input: {
  status: TaskStatus;
  late: boolean;
  to: KanbanColumn;
}): KanbanMoveIntent {
  const from = deriveKanbanColumn(input);
  if (from === input.to) {
    return { kind: "noop", reason: "KANBAN_NOOP", message: "Card already projects to this column." };
  }
  if (input.to === "EM_RISCO") {
    return {
      kind: "reject",
      reason: "KANBAN_DERIVED_COLUMN",
      message: "EM RISCO is a derived view of late TODO or IN_PROGRESS — not a stored Task state.",
    };
  }
  if (input.to === "PLANEJADAS") {
    if (input.status === "TODO" && input.late) {
      return {
        kind: "reject",
        reason: "KANBAN_DATE_SHIFT_REQUIRED",
        message: "Leaving EM RISCO requires changing the due date. Dates are not auto-shifted.",
      };
    }
    return {
      kind: "reject",
      reason: "KANBAN_INVALID_TRANSITION",
      message: "Task cannot return to TODO. PLANEJADAS is a projection of stored TODO that is not late.",
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
        message: "The Task is still late, so it remains in EM RISCO until the due date changes.",
      };
    }
    return {
      kind: "reject",
      reason: "KANBAN_INVALID_TRANSITION",
      message: `Task cannot transition from ${input.status} to IN_PROGRESS via this column.`,
    };
  }
  if (input.status === "IN_PROGRESS") {
    return { kind: "command", command: "block" };
  }
  return {
    kind: "reject",
    reason: "KANBAN_INVALID_TRANSITION",
    message: `Task cannot transition from ${input.status} to BLOCKED.`,
  };
}

export function countTasksByKanbanColumn(
  rows: readonly { status: TaskStatus; late: boolean }[],
): Record<KanbanColumn, number> {
  const counts: Record<KanbanColumn, number> = {
    PLANEJADAS: 0,
    EM_ANDAMENTO: 0,
    EM_RISCO: 0,
    BLOQUEADAS: 0,
  };
  for (const row of rows) {
    const column = deriveKanbanColumn(row);
    if (column) {
      counts[column] += 1;
    }
  }
  return counts;
}

export const PLANNING_SCHEDULE_TAKE = 500;

export const SCHEDULE_LANE_KINDS = ["PHASE", "DELIVERABLE", "WORK_PACKAGE", "TASK", "MILESTONE"] as const;
export type ScheduleLaneKind = (typeof SCHEDULE_LANE_KINDS)[number];

export function scheduleDomainFor(kind: ScheduleLaneKind): string {
  switch (kind) {
    case "PHASE":
      return "operations.phases";
    case "DELIVERABLE":
      return "operations.deliverables";
    case "WORK_PACKAGE":
      return "operations.work_packages";
    case "TASK":
      return "planning.tasks";
    case "MILESTONE":
      return "planning.milestones";
    default:
      return "planning.tasks";
  }
}

function parseScheduleTime(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") {
    return null;
  }
  const ms = typeof value === "string" ? Date.parse(value) : value.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Bar geometry from stored dates only. Does not invent status, critical path, or lag.
 * Missing start → point at end. Missing end → one-day bar from start. Both missing → no bar.
 */
export function ganttBarRange(input: {
  start: Date | string | null;
  end: Date | string | null;
}): { start: Date; end: Date } | null {
  const startMs = parseScheduleTime(input.start);
  const endMs = parseScheduleTime(input.end);
  if (startMs == null && endMs == null) {
    return null;
  }
  if (startMs != null && endMs != null) {
    return { start: new Date(startMs), end: new Date(endMs) };
  }
  if (startMs != null) {
    return { start: new Date(startMs), end: new Date(startMs + 86_400_000) };
  }
  return { start: new Date(endMs!), end: new Date(endMs!) };
}

export function planningScheduleDateRange(
  items: readonly { start: Date | string | null; end: Date | string | null }[],
  now = new Date(),
): { start: Date; end: Date } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const bar = ganttBarRange(item);
    if (!bar) {
      continue;
    }
    min = Math.min(min, bar.start.getTime(), bar.end.getTime());
    max = Math.max(max, bar.start.getTime(), bar.end.getTime());
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 21));
    return { start, end };
  }
  return { start: new Date(min - 86_400_000), end: new Date(max + 86_400_000) };
}

export function authorizedScheduleLinks(
  edges: readonly { id: string; predecessorTaskId: string; successorTaskId: string; type?: string }[],
  authorizedTaskIds: ReadonlySet<string>,
): Array<{ id: string; predecessorTaskId: string; successorTaskId: string; type: string }> {
  return edges
    .filter((edge) => authorizedTaskIds.has(edge.predecessorTaskId) && authorizedTaskIds.has(edge.successorTaskId))
    .map((edge) => ({
      id: edge.id,
      predecessorTaskId: edge.predecessorTaskId,
      successorTaskId: edge.successorTaskId,
      type: edge.type ?? "FINISH_TO_START",
    }));
}

export function assertNoScheduleDatePropagation(input: {
  propagateDates?: boolean;
  shiftSuccessors?: boolean;
  successorDueDate?: unknown;
  predecessorDueDate?: unknown;
}): void {
  if (input.propagateDates || input.shiftSuccessors || input.successorDueDate != null || input.predecessorDueDate != null) {
    throw new PlanningStateError("Date edits do not propagate to predecessors, successors, or parents", {
      reason: "DEPENDENCY_DATE_SHIFT_REJECTED",
    });
  }
}

export function resolveGanttDateEdit(input: {
  kind: ScheduleLaneKind;
  propagate?: boolean;
  shiftSuccessors?: boolean;
}): { kind: "apply" } | { kind: "reject"; reason: PlanningRejectionReason; message: string } {
  if (input.kind !== "TASK") {
    return {
      kind: "reject",
      reason: "DEPENDENCY_DATE_SHIFT_REJECTED",
      message: "Gantt date edits apply only to the Task aggregate.",
    };
  }
  if (input.propagate || input.shiftSuccessors) {
    return {
      kind: "reject",
      reason: "DEPENDENCY_DATE_SHIFT_REJECTED",
      message: "Date edits do not propagate to predecessors, successors, or parents.",
    };
  }
  return { kind: "apply" };
}

export interface ScheduleSourceRow {
  id: string;
  title: string;
  code?: string | null;
  start: Date | string | null;
  end: Date | string | null;
  status?: string | null;
  recordedStatus?: string | null;
  late?: boolean;
  risk?: { code: string; text: string } | null;
  version?: number | null;
  sequence?: number;
  phaseId?: string | null;
  deliverableId?: string | null;
  workPackageId?: string | null;
}

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

function isoOrNull(value: Date | string | null | undefined): string | null {
  const ms = parseScheduleTime(value ?? null);
  return ms == null ? null : new Date(ms).toISOString();
}

function sortSources(rows: readonly ScheduleSourceRow[]): ScheduleSourceRow[] {
  return [...rows].sort((left, right) => {
    const seq = (left.sequence ?? 0) - (right.sequence ?? 0);
    if (seq !== 0) {
      return seq;
    }
    return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  });
}

function toScheduleLane(
  kind: ScheduleLaneKind,
  row: ScheduleSourceRow,
  parent: { kind: ScheduleLaneKind; id: string } | null,
  depth: number,
): PlanningScheduleLane {
  return {
    kind,
    id: row.id,
    domain: scheduleDomainFor(kind),
    sourceId: row.id,
    title: row.title,
    code: row.code ?? null,
    parent,
    depth,
    start: isoOrNull(row.start),
    end: isoOrNull(row.end),
    status: row.status ?? null,
    recordedStatus: row.recordedStatus ?? null,
    late: Boolean(row.late),
    risk: row.risk ?? null,
    version: row.version ?? null,
  };
}

/**
 * Stable hierarchy: Phase → Deliverable → WorkPackage → Task, plus Milestone markers.
 * Missing parents are omitted (omit-not-leak) and the child is attached to the nearest authorized ancestor.
 */
export function buildScheduleLanes(input: {
  phases: readonly ScheduleSourceRow[];
  deliverables: readonly ScheduleSourceRow[];
  workPackages: readonly ScheduleSourceRow[];
  tasks: readonly ScheduleSourceRow[];
  milestones: readonly ScheduleSourceRow[];
}): PlanningScheduleLane[] {
  const phases = sortSources(input.phases);
  const deliverables = sortSources(input.deliverables);
  const workPackages = sortSources(input.workPackages);
  const tasks = sortSources(input.tasks);
  const milestones = sortSources(input.milestones);
  const phaseIds = new Set(phases.map((row) => row.id));
  const deliverableIds = new Set(deliverables.map((row) => row.id));
  const workPackageIds = new Set(workPackages.map((row) => row.id));
  const used = {
    deliverables: new Set<string>(),
    workPackages: new Set<string>(),
    tasks: new Set<string>(),
    milestones: new Set<string>(),
  };
  const lanes: PlanningScheduleLane[] = [];

  const emitTasks = (
    predicate: (row: ScheduleSourceRow) => boolean,
    parent: { kind: ScheduleLaneKind; id: string } | null,
    depth: number,
  ) => {
    for (const row of tasks) {
      if (used.tasks.has(row.id) || !predicate(row)) {
        continue;
      }
      used.tasks.add(row.id);
      lanes.push(toScheduleLane("TASK", row, parent, depth));
    }
  };
  const emitMilestones = (
    predicate: (row: ScheduleSourceRow) => boolean,
    parent: { kind: ScheduleLaneKind; id: string } | null,
    depth: number,
  ) => {
    for (const row of milestones) {
      if (used.milestones.has(row.id) || !predicate(row)) {
        continue;
      }
      used.milestones.add(row.id);
      lanes.push(toScheduleLane("MILESTONE", row, parent, depth));
    }
  };
  const emitWorkPackages = (
    predicate: (row: ScheduleSourceRow) => boolean,
    parent: { kind: ScheduleLaneKind; id: string } | null,
    depth: number,
  ) => {
    for (const row of workPackages) {
      if (used.workPackages.has(row.id) || !predicate(row)) {
        continue;
      }
      used.workPackages.add(row.id);
      const self = { kind: "WORK_PACKAGE" as const, id: row.id };
      lanes.push(toScheduleLane("WORK_PACKAGE", row, parent, depth));
      emitTasks((task) => task.workPackageId === row.id, self, depth + 1);
    }
  };
  const emitDeliverables = (
    predicate: (row: ScheduleSourceRow) => boolean,
    parent: { kind: ScheduleLaneKind; id: string } | null,
    depth: number,
  ) => {
    for (const row of deliverables) {
      if (used.deliverables.has(row.id) || !predicate(row)) {
        continue;
      }
      used.deliverables.add(row.id);
      const self = { kind: "DELIVERABLE" as const, id: row.id };
      lanes.push(toScheduleLane("DELIVERABLE", row, parent, depth));
      emitWorkPackages((wp) => wp.deliverableId === row.id, self, depth + 1);
      emitTasks((task) => task.deliverableId === row.id && !task.workPackageId, self, depth + 1);
      emitMilestones((ms) => ms.deliverableId === row.id, self, depth + 1);
    }
  };

  for (const phase of phases) {
    const self = { kind: "PHASE" as const, id: phase.id };
    lanes.push(toScheduleLane("PHASE", phase, null, 0));
    emitDeliverables((row) => row.phaseId === phase.id, self, 1);
    emitWorkPackages((row) => row.phaseId === phase.id && !row.deliverableId, self, 1);
    emitTasks((row) => row.phaseId === phase.id && !row.deliverableId && !row.workPackageId, self, 1);
    emitMilestones((row) => row.phaseId === phase.id && !row.deliverableId, self, 1);
  }

  emitDeliverables((row) => !row.phaseId || !phaseIds.has(row.phaseId), null, 0);
  emitWorkPackages(
    (row) =>
      (!row.deliverableId || !deliverableIds.has(row.deliverableId)) && (!row.phaseId || !phaseIds.has(row.phaseId)),
    null,
    0,
  );
  emitTasks(
    (row) =>
      (!row.workPackageId || !workPackageIds.has(row.workPackageId)) &&
      (!row.deliverableId || !deliverableIds.has(row.deliverableId)) &&
      (!row.phaseId || !phaseIds.has(row.phaseId)),
    null,
    0,
  );
  emitMilestones(
    (row) => (!row.deliverableId || !deliverableIds.has(row.deliverableId)) && (!row.phaseId || !phaseIds.has(row.phaseId)),
    null,
    0,
  );

  return lanes;
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
