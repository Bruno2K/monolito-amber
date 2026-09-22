import { describe, expect, it } from "vitest";
import { PlanningStateError } from "./errors.js";
import {
  TASK_PRIORITIES,
  assertAcyclicDependency,
  assertTaskTransition,
  deriveMilestoneStatus,
  isTaskLate,
  isTaskPriority,
  prerequisitesBlockStart,
  taskStatusRequiresBlockedReason,
  taskStatusRequiresCompletePermission,
  wouldCreateCycle,
} from "./planning.js";

describe("Task state machine", () => {
  it("encodes TODO → IN_PROGRESS → BLOCKED | DONE with CANCELLED side", () => {
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

  it("blocks IN_PROGRESS while any prerequisite is not DONE", () => {
    expect(prerequisitesBlockStart([{ status: "DONE" }])).toBe(false);
    expect(prerequisitesBlockStart([{ status: "TODO" }])).toBe(true);
    expect(prerequisitesBlockStart([{ status: "CANCELLED" }])).toBe(true);
    expect(prerequisitesBlockStart([{ status: "DONE" }, { status: "IN_PROGRESS" }])).toBe(true);
  });
});
