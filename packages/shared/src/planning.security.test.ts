import { describe, expect, it } from "vitest";
import { PlanningStateError } from "./errors.js";
import { PERMISSIONS } from "./permissions.js";
import {
  assertAcyclicDependency,
  assertFinishToStartType,
  assertTaskTransition,
  deriveMilestoneStatus,
  isTaskLate,
  taskStatusRequiresBlockedReason,
  wouldCreateCycle,
} from "./planning.js";

describe("Planning security floors (fail closed)", () => {
  it("uses closed task.* / milestone.* catalog and never invents gate.override", () => {
    expect(PERMISSIONS).toContain("task.create");
    expect(PERMISSIONS).toContain("task.assign");
    expect(PERMISSIONS).toContain("task.update");
    expect(PERMISSIONS).toContain("task.complete");
    expect(PERMISSIONS).toContain("milestone.create");
    expect(PERMISSIONS).toContain("milestone.update");
    expect(PERMISSIONS).toContain("milestone.achieve");
    expect(PERMISSIONS).not.toContain("gate.override");
    expect(PERMISSIONS.some((code) => code.startsWith("gate.") && code.includes("override"))).toBe(false);
  });

  it("keeps Issue ≠ Task and lateness ≠ status", () => {
    expect(() => assertTaskTransition("TODO", "DONE")).toThrow(PlanningStateError);
    expect(taskStatusRequiresBlockedReason("BLOCKED")).toBe(true);
    expect(
      isTaskLate({
        dueDate: new Date("2000-01-01T00:00:00.000Z"),
        status: "DONE",
        now: new Date("2026-09-22T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("rejects cycles and non finish-to-start types without leaking graph details", () => {
    expect(() => assertFinishToStartType("START_TO_START")).toThrow(PlanningStateError);
    expect(() => assertAcyclicDependency([], "same", "same")).toThrow(/itself/);
    expect(
      wouldCreateCycle(
        [{ predecessorTaskId: "tenant-a-task", successorTaskId: "tenant-a-other" }],
        "tenant-a-other",
        "tenant-a-task",
      ),
    ).toBe(true);
  });

  it("does not invent AT_RISK business thresholds — only documented derivation", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "PLANNED",
        targetDate: new Date("2026-09-21T00:00:00.000Z"),
        linkedTasksLate: false,
        now,
      }),
    ).toBe("MISSED");
    expect(
      deriveMilestoneStatus({
        recordedStatus: "ACHIEVED",
        targetDate: new Date("2026-09-21T00:00:00.000Z"),
        linkedTasksLate: true,
        now,
      }),
    ).toBe("ACHIEVED");
  });
});
