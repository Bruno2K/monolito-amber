import { describe, expect, it } from "vitest";
import { PlanningStateError } from "./errors.js";
import {
  TASK_PRIORITIES,
  PLANNING_SCHEDULE_TAKE,
  assertAcyclicDependency,
  assertNoScheduleDatePropagation,
  assertTaskTransition,
  authorizedScheduleLinks,
  buildScheduleLanes,
  countTasksByKanbanColumn,
  deriveKanbanColumn,
  deriveMilestoneStatus,
  ganttBarRange,
  planningScheduleDateRange,
  resolveGanttDateEdit,
  resolveKanbanColumnMove,
  incompletePredecessorBlockers,
  isTaskLate,
  isTaskPriority,
  planningListSortCompare,
  prerequisitesBlockStart,
  scheduleDomainFor,
  successorRejectsUnfinishedPredecessor,
  taskStatusRequiresBlockedReason,
  taskStatusRequiresCompletePermission,
  wouldCreateCycle,
} from "./planning.js";

describe("Task state machine", () => {
  it("M4.3-UNIT-01 encodes TODO → IN_PROGRESS → BLOCKED | DONE with CANCELLED side and no skip", () => {
    assertTaskTransition("TODO", "IN_PROGRESS");
    assertTaskTransition("TODO", "CANCELLED");
    assertTaskTransition("IN_PROGRESS", "BLOCKED");
    assertTaskTransition("IN_PROGRESS", "DONE");
    assertTaskTransition("IN_PROGRESS", "CANCELLED");
    assertTaskTransition("BLOCKED", "IN_PROGRESS");
    assertTaskTransition("BLOCKED", "CANCELLED");
    expect(() => assertTaskTransition("TODO", "DONE")).toThrow(PlanningStateError);
    expect(() => assertTaskTransition("TODO", "BLOCKED")).toThrow(PlanningStateError);
    expect(() => assertTaskTransition("BLOCKED", "DONE")).toThrow(PlanningStateError);
    expect(() => assertTaskTransition("DONE", "IN_PROGRESS")).toThrow(PlanningStateError);
    expect(() => assertTaskTransition("CANCELLED", "TODO")).toThrow(PlanningStateError);
  });

  it("requires complete permission only for DONE and a reason only for BLOCKED", () => {
    expect(taskStatusRequiresCompletePermission("DONE")).toBe(true);
    expect(taskStatusRequiresCompletePermission("BLOCKED")).toBe(false);
    expect(taskStatusRequiresBlockedReason("BLOCKED")).toBe(true);
    expect(taskStatusRequiresBlockedReason("DONE")).toBe(false);
  });

  it("reuses the Issue priority catalog without inventing OVERDUE", () => {
    expect(TASK_PRIORITIES).toEqual(["LOW", "NORMAL", "HIGH", "URGENT"]);
    expect(isTaskPriority("OVERDUE")).toBe(false);
    expect(isTaskPriority("URGENT")).toBe(true);
  });
});

describe("Derived lateness", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");

  it("is late only when due date is past and the Task is not DONE or CANCELLED", () => {
    const due = new Date("2026-09-21T12:00:00.000Z");
    expect(isTaskLate({ dueDate: due, status: "TODO", now })).toBe(true);
    expect(isTaskLate({ dueDate: due, status: "IN_PROGRESS", now })).toBe(true);
    expect(isTaskLate({ dueDate: due, status: "BLOCKED", now })).toBe(true);
    expect(isTaskLate({ dueDate: due, status: "DONE", now })).toBe(false);
    expect(isTaskLate({ dueDate: due, status: "CANCELLED", now })).toBe(false);
    expect(isTaskLate({ dueDate: null, status: "TODO", now })).toBe(false);
    expect(isTaskLate({ dueDate: new Date("2026-09-23T12:00:00.000Z"), status: "TODO", now })).toBe(false);
  });
});

describe("Milestone derivation baseline", () => {
  const now = new Date("2026-09-22T12:00:00.000Z");

  it("lets explicit ACHIEVED and CANCELLED win over dates and late Tasks", () => {
    expect(
      deriveMilestoneStatus({
        recordedStatus: "ACHIEVED",
        targetDate: new Date("2026-09-01T00:00:00.000Z"),
        linkedTasksLate: true,
        now,
      }),
    ).toBe("ACHIEVED");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "CANCELLED",
        targetDate: new Date("2026-09-01T00:00:00.000Z"),
        linkedTasksLate: true,
        now,
      }),
    ).toBe("CANCELLED");
  });

  it("derives MISSED from a past target and AT_RISK from late linked Tasks only", () => {
    expect(
      deriveMilestoneStatus({
        recordedStatus: "PLANNED",
        targetDate: new Date("2026-09-01T00:00:00.000Z"),
        linkedTasksLate: false,
        now,
      }),
    ).toBe("MISSED");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "PLANNED",
        targetDate: new Date("2026-10-01T00:00:00.000Z"),
        linkedTasksLate: true,
        now,
      }),
    ).toBe("AT_RISK");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "PLANNED",
        targetDate: null,
        linkedTasksLate: true,
        now,
      }),
    ).toBe("AT_RISK");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "PLANNED",
        targetDate: new Date("2026-10-01T00:00:00.000Z"),
        linkedTasksLate: false,
        now,
      }),
    ).toBe("PLANNED");
  });
});

describe("M4.2-UNIT-01 Kanban column + List sort helpers", () => {
  it("maps stored status + derived late to Figma columns without inventing OVERDUE", () => {
    expect(deriveKanbanColumn({ status: "TODO", late: false })).toBe("PLANEJADAS");
    expect(deriveKanbanColumn({ status: "IN_PROGRESS", late: false })).toBe("EM_ANDAMENTO");
    expect(deriveKanbanColumn({ status: "TODO", late: true })).toBe("EM_RISCO");
    expect(deriveKanbanColumn({ status: "IN_PROGRESS", late: true })).toBe("EM_RISCO");
    expect(deriveKanbanColumn({ status: "BLOCKED", late: false })).toBe("BLOQUEADAS");
    expect(deriveKanbanColumn({ status: "BLOCKED", late: true })).toBe("BLOQUEADAS");
    expect(deriveKanbanColumn({ status: "DONE", late: false })).toBeNull();
    expect(deriveKanbanColumn({ status: "CANCELLED", late: false })).toBeNull();
  });

  it("M4.5-UNIT-01 maps column moves to existing commands and never writes EM_RISCO", () => {
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, to: "EM_ANDAMENTO" })).toEqual({
      kind: "command",
      command: "start",
    });
    expect(resolveKanbanColumnMove({ status: "IN_PROGRESS", late: false, to: "BLOQUEADAS" })).toEqual({
      kind: "command",
      command: "block",
    });
    expect(resolveKanbanColumnMove({ status: "BLOCKED", late: false, to: "EM_ANDAMENTO" })).toEqual({
      kind: "command",
      command: "unblock",
    });
    expect(resolveKanbanColumnMove({ status: "TODO", late: true, to: "EM_ANDAMENTO" }).kind).toBe("command");
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, to: "BLOQUEADAS" })).toMatchObject({
      kind: "reject",
      reason: "KANBAN_INVALID_TRANSITION",
    });
    expect(resolveKanbanColumnMove({ status: "IN_PROGRESS", late: false, to: "PLANEJADAS" })).toMatchObject({
      kind: "reject",
      reason: "KANBAN_INVALID_TRANSITION",
    });
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, to: "EM_RISCO" })).toMatchObject({
      kind: "reject",
      reason: "KANBAN_DERIVED_COLUMN",
    });
    expect(resolveKanbanColumnMove({ status: "TODO", late: true, to: "PLANEJADAS" })).toMatchObject({
      kind: "reject",
      reason: "KANBAN_DATE_SHIFT_REQUIRED",
    });
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, to: "PLANEJADAS" }).kind).toBe("noop");
    const counts = countTasksByKanbanColumn([
      { status: "TODO", late: false },
      { status: "TODO", late: true },
      { status: "IN_PROGRESS", late: false },
      { status: "BLOCKED", late: true },
      { status: "DONE", late: false },
    ]);
    expect(counts).toEqual({ PLANEJADAS: 1, EM_ANDAMENTO: 1, EM_RISCO: 1, BLOQUEADAS: 1 });
    expect(counts.PLANEJADAS + counts.EM_ANDAMENTO + counts.EM_RISCO + counts.BLOQUEADAS).toBe(4);
  });

  it("sorts List rows by stored fields (late is not a stored column)", () => {
    const a = {
      title: "B",
      dueDate: "2026-01-02T00:00:00.000Z",
      plannedStartAt: null,
      status: "TODO",
      progressPercent: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const b = {
      title: "A",
      dueDate: "2026-01-01T00:00:00.000Z",
      plannedStartAt: null,
      status: "BLOCKED",
      progressPercent: 40,
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    expect(planningListSortCompare(a, b, "title")).toBeGreaterThan(0);
    expect(planningListSortCompare(a, b, "dueDate")).toBeGreaterThan(0);
    expect(planningListSortCompare(a, b, "createdAt")).toBeLessThan(0);
    expect(planningListSortCompare(a, b, "progressPercent")).toBeLessThan(0);
  });
});

describe("Finish-to-start dependencies", () => {
  it("rejects self-edges and cycles without inventing other dependency types", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
    expect(() => assertAcyclicDependency([], "a", "a")).toThrow(/itself/);
    const edges = [
      { predecessorTaskId: "a", successorTaskId: "b" },
      { predecessorTaskId: "b", successorTaskId: "c" },
    ];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "d")).toBe(false);
    expect(() => assertAcyclicDependency(edges, "c", "a")).toThrow(/cycle/);
  });

  it("M4.4-UNIT-01 rejects a long transitive cycle in one walk", () => {
    const edges = Array.from({ length: 40 }, (_, index) => ({
      predecessorTaskId: `n${index}`,
      successorTaskId: `n${index + 1}`,
    }));
    expect(wouldCreateCycle(edges, "n40", "n0")).toBe(true);
    expect(wouldCreateCycle(edges, "n40", "n41")).toBe(false);
    expect(() => assertAcyclicDependency(edges, "n40", "n0")).toThrow(/cycle/);
  });

  it("blocks IN_PROGRESS while any prerequisite is not DONE", () => {
    expect(prerequisitesBlockStart([{ status: "DONE" }])).toBe(false);
    expect(prerequisitesBlockStart([{ status: "TODO" }])).toBe(true);
    expect(prerequisitesBlockStart([{ status: "CANCELLED" }])).toBe(true);
    expect(prerequisitesBlockStart([{ status: "DONE" }, { status: "IN_PROGRESS" }])).toBe(true);
  });

  it("explains incomplete predecessors without treating them as Task BLOCKED", () => {
    const blockers = incompletePredecessorBlockers([
      { id: "p1", status: "TODO", title: "Survey" },
      { id: "p2", status: "DONE", title: "Done pred" },
      { id: "p3", status: "CANCELLED" },
    ]);
    expect(blockers).toHaveLength(2);
    expect(blockers[0]).toMatchObject({
      predecessorTaskId: "p1",
      status: "TODO",
      title: "Survey",
      message: "Predecessor is TODO, not DONE",
    });
    expect(blockers[1]?.title).toBeUndefined();
    expect(successorRejectsUnfinishedPredecessor("DONE")).toBe(true);
    expect(successorRejectsUnfinishedPredecessor("TODO")).toBe(false);
  });
});

describe("M4.6 schedule projection", () => {
  it("M4.6-UNIT-01 derives bar geometry from plannedStartAt / dueDate only", () => {
    const both = ganttBarRange({ start: "2026-10-01T00:00:00.000Z", end: "2026-10-08T00:00:00.000Z" });
    expect(both?.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(both?.end.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(ganttBarRange({ start: null, end: null })).toBeNull();
    const point = ganttBarRange({ start: null, end: "2026-10-10T00:00:00.000Z" });
    expect(point?.start.toISOString()).toBe(point?.end.toISOString());
    const open = ganttBarRange({ start: "2026-10-01T00:00:00.000Z", end: null });
    expect(open?.end.getTime()).toBe(open!.start.getTime() + 86_400_000);
    const range = planningScheduleDateRange([
      { start: "2026-10-01T00:00:00.000Z", end: "2026-10-08T00:00:00.000Z" },
    ]);
    expect(range.start.getTime()).toBeLessThan(Date.parse("2026-10-01T00:00:00.000Z"));
    expect(range.end.getTime()).toBeGreaterThan(Date.parse("2026-10-08T00:00:00.000Z"));
  });

  it("keeps Phase / Deliverable / WorkPackage / Task / Milestone as distinct lanes", () => {
    const lanes = buildScheduleLanes({
      phases: [{ id: "ph", title: "Concept", start: "2026-01-01T00:00:00.000Z", end: "2026-06-01T00:00:00.000Z", sequence: 1 }],
      deliverables: [
        { id: "d1", title: "Pack", code: "D-01", start: "2026-02-01T00:00:00.000Z", end: "2026-05-01T00:00:00.000Z", phaseId: "ph" },
      ],
      workPackages: [
        { id: "wp", title: "Outline", code: "WP-01", start: null, end: null, phaseId: "ph", deliverableId: "d1" },
      ],
      tasks: [
        {
          id: "t1",
          title: "Grid",
          start: "2026-03-01T00:00:00.000Z",
          end: "2026-03-10T00:00:00.000Z",
          phaseId: "ph",
          deliverableId: "d1",
          workPackageId: "wp",
        },
      ],
      milestones: [
        { id: "ms", title: "Freeze", start: "2026-04-01T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z", phaseId: "ph", deliverableId: "d1" },
      ],
    });
    expect(lanes.map((row) => row.kind)).toEqual(["PHASE", "DELIVERABLE", "WORK_PACKAGE", "TASK", "MILESTONE"]);
    expect(lanes[0]?.domain).toBe("operations.phases");
    expect(lanes[3]?.domain).toBe("planning.tasks");
    expect(lanes[3]?.sourceId).toBe("t1");
    expect(lanes[4]?.domain).toBe("planning.milestones");
    expect(scheduleDomainFor("WORK_PACKAGE")).toBe("operations.work_packages");
    expect(new Set(lanes.map((row) => row.kind)).size).toBe(5);
  });

  it("omits dependency links unless both endpoints are authorized", () => {
    const links = authorizedScheduleLinks(
      [
        { id: "ok", predecessorTaskId: "a", successorTaskId: "b" },
        { id: "hidden", predecessorTaskId: "a", successorTaskId: "secret" },
      ],
      new Set(["a", "b"]),
    );
    expect(links).toEqual([{ id: "ok", predecessorTaskId: "a", successorTaskId: "b", type: "FINISH_TO_START" }]);
    expect(JSON.stringify(links)).not.toContain("secret");
  });

  it("M4.6-ADV-01 rejects date edits that would shift successors automatically", () => {
    expect(resolveGanttDateEdit({ kind: "TASK" }).kind).toBe("apply");
    expect(resolveGanttDateEdit({ kind: "TASK", shiftSuccessors: true })).toMatchObject({
      kind: "reject",
      reason: "DEPENDENCY_DATE_SHIFT_REJECTED",
    });
    expect(resolveGanttDateEdit({ kind: "PHASE" }).kind).toBe("reject");
    expect(() => assertNoScheduleDatePropagation({ propagateDates: true })).toThrow(PlanningStateError);
    expect(() => assertNoScheduleDatePropagation({})).not.toThrow();
  });

  it("M4.6-PERF-01 keeps a bounded take and builds a representative volume without collapsing kinds", () => {
    expect(PLANNING_SCHEDULE_TAKE).toBe(500);
    const tasks = Array.from({ length: 80 }, (_, index) => ({
      id: `t${index}`,
      title: `Task ${index}`,
      start: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      end: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      phaseId: "ph",
    }));
    const started = Date.now();
    const lanes = buildScheduleLanes({
      phases: [{ id: "ph", title: "Volume", start: "2026-01-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" }],
      deliverables: [],
      workPackages: [],
      tasks,
      milestones: [],
    });
    expect(Date.now() - started).toBeLessThan(100);
    expect(lanes.filter((row) => row.kind === "TASK")).toHaveLength(80);
    expect(lanes.some((row) => row.kind === "PHASE")).toBe(true);
    expect(lanes.filter((row) => row.kind === "TASK").every((row) => row.domain === "planning.tasks")).toBe(true);
  });
});
