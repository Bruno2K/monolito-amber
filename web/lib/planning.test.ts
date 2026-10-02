import { describe, expect, it } from "vitest";
import { contextLabel, lateExplanation, plannerPath, taskStatusLabel, type PlanningTaskRow } from "./planning";

function row(partial: Partial<PlanningTaskRow> = {}): PlanningTaskRow {
  return {
    id: "t1",
    organizationId: "o",
    projectId: "p",
    issueId: null,
    milestoneId: null,
    phaseId: null,
    deliverableId: null,
    workPackageId: null,
    title: "Task",
    description: "",
    status: "TODO",
    late: false,
    kanbanColumn: "PLANEJADAS",
    priority: null,
    responsibleDisciplineId: null,
    assigneeUserId: null,
    dueDate: null,
    plannedStartAt: null,
    estimatedMinutes: null,
    progressPercent: null,
    startedAt: null,
    completedAt: null,
    blockedReason: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    previews: {},
    ...partial,
  };
}

describe("planner URL + labels", () => {
  it("keeps default List URL stable and records filters", () => {
    expect(plannerPath("abc")).toBe("/projects/abc/planner");
    expect(plannerPath("abc", { view: "list" })).toBe("/projects/abc/planner");
    expect(plannerPath("abc", { view: "kanban", q: "grid", late: "true", page: 2, inspect: "t1" })).toBe(
      "/projects/abc/planner?view=kanban&q=grid&late=true&page=2&inspect=t1",
    );
  });

  it("labels stored status in Portuguese without inventing OVERDUE", () => {
    expect(taskStatusLabel("TODO")).toBe("A fazer");
    expect(taskStatusLabel("OVERDUE")).toBe("OVERDUE");
    expect(lateExplanation("TODO")).toMatch(/não é um status/);
  });

  it("labels Issue as a relation, never as the Task title", () => {
    const linked = row({
      title: "Atualizar malha",
      issueId: "iss-1",
      previews: { issue: { id: "iss-1", title: "Choque de malha", status: "OPEN", relation: "issue" } },
    });
    expect(linked.title).toBe("Atualizar malha");
    expect(linked.previews.issue?.relation).toBe("issue");
    expect(linked.previews.issue?.title).not.toBe(linked.title);
  });

  it("builds context from authorized previews only", () => {
    expect(contextLabel(row())).toBe("—");
    expect(
      contextLabel(
        row({
          previews: {
            phase: { id: "ph", name: "Concept" },
            deliverable: { id: "d", code: "DEL-1", title: "Pack" },
          },
        }),
      ),
    ).toBe("Concept · DEL-1");
  });
});
