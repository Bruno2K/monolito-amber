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

  it("M4.2-R14 planner view does not smuggle mutations", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PlannerView.tsx"), "utf8");
    expect(src).not.toMatch(/method:\s*"POST"/);
    expect(src).not.toMatch(/task\.create/);
    expect(src).toMatch(/Nova Tarefa/);
    expect(src).toMatch(/disabled/);
  });
});
