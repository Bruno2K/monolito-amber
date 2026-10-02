import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
