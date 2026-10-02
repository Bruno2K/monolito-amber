import { describe, expect, it } from "vitest";
import {
  PlanningStateError,
  assertAcyclicDependency,
  assertTaskTransition,
  deriveKanbanColumn,
  resolveKanbanColumnMove,
  resolveGanttDateEdit,
  deriveMilestoneStatus,
  isTaskLate,
  prerequisitesBlockStart,
  taskStatusRequiresBlockedReason,
} from "@amber/shared";

describe("PF-1.5 Planning security floors (fail closed)", () => {
  it("keeps Task ≠ Issue and refuses invented OVERDUE / skip-to-DONE transitions", () => {
    expect(() => assertTaskTransition("TODO", "DONE")).toThrow(PlanningStateError);
    expect(() => assertTaskTransition("BLOCKED", "DONE")).toThrow(PlanningStateError);
    expect(taskStatusRequiresBlockedReason("BLOCKED")).toBe(true);
    expect(
      isTaskLate({
        dueDate: new Date("2000-01-01T00:00:00.000Z"),
        status: "DONE",
        now: new Date("2026-09-22T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("rejects cycles and unfinished start-gates without leaking foreign graphs", () => {
    expect(() => assertAcyclicDependency([], "t", "t")).toThrow(/itself/);
    expect(prerequisitesBlockStart([{ status: "TODO" }])).toBe(true);
    expect(prerequisitesBlockStart([{ status: "DONE" }])).toBe(false);
  });

  it("derives kanbanColumn without persisting Portuguese or OVERDUE statuses", () => {
    expect(deriveKanbanColumn({ status: "TODO", late: true })).toBe("EM_RISCO");
    expect(deriveKanbanColumn({ status: "BLOCKED", late: true })).toBe("BLOQUEADAS");
    expect(deriveKanbanColumn({ status: "DONE", late: false })).toBeNull();
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, to: "EM_RISCO" }).kind).toBe("reject");
  });

  it("derives AT_RISK / MISSED without invented business thresholds", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "PLANNED",
        targetDate: new Date("2026-09-01T00:00:00.000Z"),
        linkedTasksLate: true,
        now,
      }),
    ).toBe("MISSED");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "ACHIEVED",
        targetDate: new Date("2026-09-01T00:00:00.000Z"),
        linkedTasksLate: true,
        now,
      }),
    ).toBe("ACHIEVED");
  });

  it("rejects Gantt date propagation without inventing a second schedule store", () => {
    expect(resolveGanttDateEdit({ kind: "TASK", shiftSuccessors: true }).kind).toBe("reject");
    expect(resolveGanttDateEdit({ kind: "MILESTONE" }).kind).toBe("reject");
  });
});
