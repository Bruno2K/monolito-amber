import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlanningReadModel } from "../../lib/planning";
import { MilestoneBoard } from "./MilestoneBoard";
import { PlanningEmpty, PlanningError, PlanningSkeleton } from "./PlanningStates";

describe("M4.2 planning system states", () => {
  it("skeleton preserves table structure without fake domain titles", () => {
    const html = renderToStaticMarkup(createElement(PlanningSkeleton));
    expect(html).toContain('data-state="loading"');
    expect(html).toContain("Carregando lista de planejamento");
    expect(html).not.toContain("Atualizar malha");
    expect(html).not.toContain("Alpha Tower");
    expect(html).not.toContain("OVERDUE");
  });

  it("distinguishes initial empty from filtered empty", () => {
    const empty = renderToStaticMarkup(createElement(PlanningEmpty, { filtered: false }));
    const filtered = renderToStaticMarkup(createElement(PlanningEmpty, { filtered: true }));
    expect(empty).toContain('data-state="empty"');
    expect(filtered).toContain('data-state="filtered-empty"');
  });

  it("error is retryable", () => {
    const html = renderToStaticMarkup(createElement(PlanningError, { detail: "falhou", onRetry: () => undefined }));
    expect(html).toContain("Tentar novamente");
    expect(html).toContain("falhou");
  });

  it("M4.3 planner enables Nova Tarefa when authorized", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PlannerView.tsx"), "utf8");
    expect(src).toMatch(/Nova Tarefa/);
    expect(src).toMatch(/canCreateTask/);
    expect(src).toMatch(/TaskInspector/);
  });

  it("M4.8.1 create inspector renders when the milestone list is empty", () => {
    const model: PlanningReadModel = {
      projectId: "p",
      organizationId: "o",
      generatedAt: "2026-01-01T00:00:00.000Z",
      view: "milestones",
      project: { archivedAt: null, readOnly: false },
      tasks: [],
      milestones: [],
      dependencies: [],
      schedule: {
        dateRange: { start: "2026-01-01T00:00:00.000Z", end: "2026-01-01T00:00:00.000Z" },
        take: 500,
        truncated: false,
        canEditTaskDates: false,
        lanes: [],
        links: [],
      },
      page: { page: 1, pageSize: 20, total: 0, sort: "createdAt", order: "asc" },
      counts: { total: 0, late: 0, byStatus: {} },
      inspected: null,
    };
    const empty = renderToStaticMarkup(
      createElement(MilestoneBoard, {
        projectId: "p",
        model,
        phases: [],
        selectedId: null,
        creating: false,
        readOnly: false,
        permissions: ["milestone.create"],
        filtered: false,
        onSelect: () => undefined,
        onCreatingChange: () => undefined,
        onChanged: () => undefined,
      }),
    );
    expect(empty).toContain("Nenhum marco neste projeto");
    expect(empty).not.toContain("Novo marco");

    const creating = renderToStaticMarkup(
      createElement(MilestoneBoard, {
        projectId: "p",
        model,
        phases: [],
        selectedId: null,
        creating: true,
        readOnly: false,
        permissions: ["milestone.create"],
        filtered: false,
        onSelect: () => undefined,
        onCreatingChange: () => undefined,
        onChanged: () => undefined,
      }),
    );
    expect(creating).toContain("Nenhum marco neste projeto");
    expect(creating).toContain("Novo marco");
    expect(creating).toContain("Criar marco");
  });

  it("M4.8.1 Novo Marco create state is not cleared by onSelect(null) and Esc dismisses it", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PlannerView.tsx"), "utf8");
    expect(src).toMatch(/creating \|\| creatingMilestone/);
    expect(src).toMatch(/setCreatingMilestone\(false\)/);
    expect(src).toMatch(/if \(id\) \{\s*setCreatingMilestone\(false\);/);
    expect(src).not.toMatch(/onSelect=\{\(id\) => \{\s*setCreatingMilestone\(false\);\s*openMilestone\(id\);/);
    expect(src).toMatch(/view !== "gantt" \? \([\s\S]*aria-label="Ordenar lista"/);
    const board = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "MilestoneBoard.tsx"), "utf8");
    expect(board).toMatch(/visible\.length === 0 && !creating && !selected/);
    expect(board).toMatch(/id="milestone-create-title"/);
  });

  it("M4.7 Marcos is a projection over the same planner, not a coming-later placeholder", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PlannerView.tsx"), "utf8");
    expect(src).toMatch(/MilestoneBoard/);
    expect(src).toMatch(/view === "milestones"/);
    expect(src).toMatch(/242:6853/);
    expect(src).not.toMatch(/Marcos em um marco posterior/);
    expect(src).not.toMatch(/search\.set\("milestone"/);
    const board = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "MilestoneBoard.tsx"), "utf8");
    expect(board).toMatch(/milestoneKpis/);
    expect(board).toMatch(/Alcançar/);
    expect(board).toMatch(/não são[\s\S]*controles de status|não são controles de status/);
    expect(board).toMatch(/Issue permanece/);
    expect(board).not.toMatch(/AT_RISK toggle|manual AT_RISK|status.*select.*AT_RISK/);
  });

  it("M4.6 Gantt is a projection over the same planner, not a coming-later placeholder", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PlannerView.tsx"), "utf8");
    expect(src).toMatch(/TaskGantt/);
    expect(src).toMatch(/view === "gantt"/);
    expect(src).not.toMatch(/Gantt em um marco posterior/);
    const gantt = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TaskGantt.tsx"), "utf8");
    expect(gantt).toMatch(/Tabela de datas do cronograma/);
    expect(gantt).toMatch(/Também deslocar sucessores/);
    expect(gantt).toMatch(/resolveGanttDateEdit/);
    expect(gantt).toMatch(/PATCH|method: "PATCH"/);
    expect(gantt).not.toMatch(/Atualizar Cronograma|caminho crítico|critical path/i);
  });

  it("M4.5 Kanban is a projection over the same planner, not a coming-later placeholder", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PlannerView.tsx"), "utf8");
    expect(src).toMatch(/TaskKanban/);
    expect(src).toMatch(/view === "kanban"/);
    expect(src).not.toMatch(/Kanban em um marco posterior/);
    const kanban = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TaskKanban.tsx"), "utf8");
    expect(kanban).toMatch(/resolveKanbanColumnMove/);
    expect(kanban).toMatch(/Mover \$\{row\.title\}/);
    expect(kanban).toMatch(/EM RISCO é atraso derivado/);
    expect(kanban).toMatch(/\/start|kanban-\$\{command\}/);
    expect(kanban).not.toMatch(/dueDate\.getTime|new Date\(row\.dueDate\)/);
    expect(kanban).not.toMatch(/OVERDUE|EM_RISCO as status/);
  });

  it("M4.4 inspector distinguishes dependency blockage from stored BLOCKED", () => {
    const inspector = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TaskInspector.tsx"), "utf8");
    expect(inspector).toMatch(/Dependências \(término-início\)/);
    expect(inspector).toMatch(/Aguardando predecessor/);
    expect(inspector).toMatch(/não é o estado Bloqueada/);
    expect(inspector).toMatch(/Adicionar dependência/);
    expect(inspector).toMatch(/Remover predecessor/);
    expect(inspector).not.toMatch(/draggable/);
  });
});
