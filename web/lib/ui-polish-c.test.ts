import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function read(relative: string): string {
  return readFileSync(join(webRoot, relative), "utf8");
}

describe("UI Polish C overlay stacking", () => {
  it("portals Estrutura / Entregas / Pacotes drawers and leaves Planning views alone", () => {
    const ui = read("components/ui.tsx");
    const structure = read("components/structure/StructureView.tsx");
    const deliverables = read("components/deliverables/DeliverablesView.tsx");
    const workPackages = read("components/work-packages/WorkPackagesView.tsx");
    const planner = read("components/planner/PlannerView.tsx");
    const milestones = read("components/planner/MilestoneBoard.tsx");
    const kanban = read("components/planner/TaskKanban.tsx");

    expect(ui).toMatch(/createPortal/);
    expect(ui).toMatch(/dataset\.drawerOpen/);
    expect(structure).toMatch(/<Drawer /);
    expect(deliverables).toMatch(/<Drawer /);
    expect(workPackages).toMatch(/<Drawer /);
    expect(planner).not.toMatch(/from ["'].*\/ui["']/);
    expect(planner).not.toMatch(/<Drawer /);
    expect(milestones).not.toMatch(/from ["'].*\/ui["']/);
    expect(milestones).not.toMatch(/<Drawer /);
    expect(milestones).toMatch(/onCreatingChange/);
    expect(kanban).toMatch(/className="kanban-block-prompt"/);
    expect(kanban).not.toMatch(/createPortal|<Drawer /);
  });

  it("raises overlay isolation, caps 1180 inspectors, and keeps Gantt diamonds absolute", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/\.structure-overlay \{[\s\S]*z-index:\s*80;[\s\S]*isolation:\s*isolate;/);
    expect(css).toMatch(
      /\.deliverables-inspector-shell \.structure-inspector \{[\s\S]*width:\s*min\(100%, calc\(100vw - var\(--sidebar-width\)\)\)/,
    );
    expect(css).not.toMatch(/width:\s*min\(100%,\s*100vw\)/);
    expect(css).toMatch(
      /\.milestone-diamond-btn \.gantt-diamond \{[\s\S]*position:\s*static;[\s\S]*transform:\s*none;/,
    );
    expect(css).toMatch(/\.gantt-timeline \.gantt-diamond \{[\s\S]*position:\s*absolute;[\s\S]*transform:\s*translateX\(-50%\)/);
    expect(css).toMatch(/\.kanban-block-prompt \{[\s\S]*position:\s*fixed;/);
  });
});
