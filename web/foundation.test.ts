import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_PROTOTYPE_PAGES = [
  "app/visao-geral",
  "app/planejamento",
  "app/calendarios",
  "app/mensagens",
  "app/equipe",
  "app/gates",
  "app/excecoes",
  "app/atividade",
  "app/portfolio",
  "app/entregas",
];

describe("web M3.2 application shell", () => {
  it("mounts canonical English product routes and does not ship Figma prototype Portuguese paths", () => {
    expect(existsSync(join(__dirname, "app/projects/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "app/projects/[projectId]/overview/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "app/projects/[projectId]/structure/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "app/projects/[projectId]/deliverables/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "app/projects/[projectId]/planner/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "app/calendars/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "app/calendars/schedule/page.tsx"))).toBe(true);
    expect(existsSync(join(__dirname, "app/messages"))).toBe(false);
    for (const relative of FORBIDDEN_PROTOTYPE_PAGES) {
      expect(existsSync(join(__dirname, relative)), relative).toBe(false);
    }
    expect("gate.override" in globalThis).toBe(false);
  });
});
