import { describe, expect, it } from "vitest";
import {
  auditEventLabel,
  canAchieveMilestone,
  canAssignTask,
  canCompleteTask,
  canCreateMilestone,
  canCreateTask,
  canUpdateMilestone,
  canUpdateTask,
  milestoneKpis,
  milestoneStatusLabel,
  contextLabel,
  dependencyStartExplanation,
  lateExplanation,
  plannerPath,
  resolveGanttDateEdit,
  resolveKanbanColumnMove,
  scheduleLaneKindLabel,
  taskStatusLabel,
  type PlanningTaskRow,
} from "./planning";

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
    expect(plannerPath("abc", { view: "gantt" })).toBe("/projects/abc/planner?view=gantt");
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

  it("M4.3 permission helpers stay on closed task.* codes", () => {
    expect(canCreateTask(["task.create"])).toBe(true);
    expect(canCreateTask(["project.read"])).toBe(false);
    expect(canUpdateTask(["task.update"])).toBe(true);
    expect(canAssignTask(["task.assign"])).toBe(true);
    expect(canCompleteTask(["task.complete"])).toBe(true);
    expect(auditEventLabel("TASK_UNBLOCKED")).toBe("Desbloqueada");
    expect(auditEventLabel("TASK_DEPENDENCY_CREATED")).toBe("Dependência criada");
    expect(auditEventLabel("TASK_DEPENDENCY_REMOVED")).toBe("Dependência removida");
    expect(auditEventLabel("TASK_PROGRESS_CHANGED")).toBe("Progresso alterado");
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

  it("M4.5 maps Kanban columns to existing commands without inventing EM_RISCO status", () => {
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, kanbanColumn: "PLANEJADAS", to: "EM_ANDAMENTO" })).toEqual({
      kind: "command",
      command: "start",
    });
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, kanbanColumn: "PLANEJADAS", to: "EM_RISCO" })).toMatchObject({
      kind: "reject",
      reason: "KANBAN_DERIVED_COLUMN",
    });
    expect(resolveKanbanColumnMove({ status: "TODO", late: false, kanbanColumn: "PLANEJADAS", to: "BLOQUEADAS" }).kind).toBe(
      "reject",
    );
    expect(resolveKanbanColumnMove({ status: "IN_PROGRESS", late: false, kanbanColumn: "EM_ANDAMENTO", to: "PLANEJADAS" }).kind).toBe(
      "reject",
    );
  });

  it("distinguishes dependency start blockage from stored BLOCKED", () => {
    expect(dependencyStartExplanation([{ predecessorTaskId: "p1", status: "TODO", title: "Survey", message: "x" }])).toMatch(
      /Survey/,
    );
    expect(dependencyStartExplanation([{ predecessorTaskId: "p1", status: "TODO", title: "Survey", message: "x" }])).toMatch(
      /não é o estado Bloqueada/,
    );
    expect(taskStatusLabel("BLOCKED")).toBe("Bloqueada");
  });

  it("M4.6 Gantt date helper rejects successor propagation without inventing a write model", () => {
    expect(scheduleLaneKindLabel("WORK_PACKAGE")).toBe("Pacote");
    expect(resolveGanttDateEdit({ kind: "TASK" }).kind).toBe("apply");
    expect(resolveGanttDateEdit({ kind: "TASK", shiftSuccessors: true })).toMatchObject({
      kind: "reject",
      reason: "DEPENDENCY_DATE_SHIFT_REJECTED",
    });
    expect(resolveGanttDateEdit({ kind: "PHASE" }).kind).toBe("reject");
  });

  it("M4.7 KPI helpers stay on derived milestone rows and closed milestone.* codes", () => {
    expect(canCreateMilestone(["milestone.create"])).toBe(true);
    expect(canUpdateMilestone(["milestone.update"])).toBe(true);
    expect(canAchieveMilestone(["milestone.achieve"])).toBe(true);
    expect(canCreateMilestone(["task.create"])).toBe(false);
    expect(milestoneStatusLabel("AT_RISK")).toBe("Em risco");
    expect(milestoneStatusLabel("MISSED")).toBe("Perdido");
    const kpis = milestoneKpis([
      { id: "a", title: "Next", recordedStatus: "PLANNED", status: "AT_RISK", targetDate: "2099-01-01T00:00:00.000Z", phaseId: null, deliverableId: null },
      { id: "b", title: "Done", recordedStatus: "ACHIEVED", status: "ACHIEVED", targetDate: "2020-01-01T00:00:00.000Z", phaseId: null, deliverableId: null },
      { id: "c", title: "Late", recordedStatus: "PLANNED", status: "MISSED", targetDate: "2020-01-01T00:00:00.000Z", phaseId: null, deliverableId: null },
    ]);
    expect(kpis.next?.id).toBe("a");
    expect(kpis.achieved).toBe(1);
    expect(kpis.total).toBe(3);
    expect(kpis.atRisk).toBe(1);
    expect(kpis.missed).toBe(1);
    expect(plannerPath("abc", { view: "milestones", milestone: "ms-1" })).toBe(
      "/projects/abc/planner?view=milestones&milestone=ms-1",
    );
  });
});
