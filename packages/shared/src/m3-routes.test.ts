import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXISTING_FOUNDATION_UI_ROUTES,
  FIGMA_PROTOTYPE_ROUTE_MAP,
  M3_2_NEXT_APP_ROUTES,
  M3_3_API_ROUTES,
  M3_4_API_ROUTES,
  M3_5_API_ROUTES,
  M3_5_NEXT_APP_ROUTES,
  M3_6_API_ROUTES,
  M3_7_API_ROUTES,
  M3_CANONICAL_UI_ROUTES,
  M3_LATER_API_ROUTES,
  M3_PLANNED_API_ROUTES,
  M4_2_NEXT_APP_ROUTES,
  M4_CANONICAL_UI_ROUTES,
  M4_PLANNED_API_ROUTES,
  M4_RESERVED_UI_ROUTES,
} from "./m3-routes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function listNextAppRoutes(appDir: string, prefix = ""): string[] {
  if (!existsSync(appDir)) {
    return [];
  }
  const routes: string[] = [];
  for (const name of readdirSync(appDir)) {
    if (name === "components" || name === "lib" || name.startsWith("_")) {
      continue;
    }
    const full = join(appDir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      const nextPrefix = name.startsWith("(") && name.endsWith(")") ? prefix : `${prefix}/${name}`;
      routes.push(...listNextAppRoutes(full, nextPrefix));
    } else if (name === "page.tsx" || name === "page.ts") {
      routes.push(prefix || "/");
    }
  }
  return routes;
}

describe("M3 route collision audit", () => {
  it("keeps canonical UI routes unique and implements the M3.2 shell without colliding with foundation pages", () => {
    const paths = M3_CANONICAL_UI_ROUTES.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
    const existing = listNextAppRoutes(join(ROOT, "web/app"));
    for (const foundation of EXISTING_FOUNDATION_UI_ROUTES) {
      expect(existing, foundation).toContain(foundation);
    }
    for (const implemented of M3_2_NEXT_APP_ROUTES) {
      expect(existing, implemented).toContain(implemented);
    }
    for (const implemented of M3_5_NEXT_APP_ROUTES) {
      expect(existing, implemented).toContain(implemented);
    }
    for (const implemented of M4_2_NEXT_APP_ROUTES) {
      expect(existing, implemented).toContain(implemented);
    }
    expect(existsSync(join(ROOT, "web/app/projects"))).toBe(true);
    expect(existsSync(join(ROOT, "web/app/projects/[projectId]/overview/page.tsx"))).toBe(true);
  });

  it("ships /planner as the M4.2 product path and never treats /planejamento as a Next route", () => {
    expect(M4_CANONICAL_UI_ROUTES.some((row) => row.path.includes("planner"))).toBe(true);
    expect(M4_RESERVED_UI_ROUTES.some((row) => row.path === "/planejamento")).toBe(true);
    expect(FIGMA_PROTOTYPE_ROUTE_MAP.find((row) => row.figmaPath === "/planejamento")?.productPath).toBeNull();
    expect(FIGMA_PROTOTYPE_ROUTE_MAP.find((row) => row.figmaPath === "/entregas")?.productPath).toBe(
      "/projects/:projectId/deliverables",
    );
    const existing = listNextAppRoutes(join(ROOT, "web/app"));
    expect(existing.some((route) => route.includes("planejamento") || route.includes("visao-geral"))).toBe(false);
    expect(existing).toContain("/projects/[projectId]/planner");
    expect(existsSync(join(ROOT, "web/app/planejamento"))).toBe(false);
  });

  it("exposes M3.3–M3.7 Phase/Discipline/Deliverable/WorkPackage/Hub/Traceability API paths in OpenAPI", () => {
    const openapi = JSON.parse(readFileSync(join(ROOT, "api/openapi/openapi.json"), "utf8")) as {
      paths: Record<string, unknown>;
    };
    const existing = Object.keys(openapi.paths);
    const planned = M3_PLANNED_API_ROUTES.map((row) => `${row.method} ${row.path}`);
    expect(new Set(planned).size).toBe(planned.length);
    for (const row of M3_3_API_ROUTES) {
      expect(existing, row.path).toContain(row.path);
    }
    for (const row of M3_4_API_ROUTES) {
      expect(existing, row.path).toContain(row.path);
    }
    for (const row of M3_5_API_ROUTES) {
      expect(existing, row.path).toContain(row.path);
    }
    for (const row of M3_6_API_ROUTES) {
      expect(existing, row.path).toContain(row.path);
    }
    for (const row of M3_7_API_ROUTES) {
      expect(existing, row.path).toContain(row.path);
    }
    for (const row of M3_LATER_API_ROUTES) {
      expect(existing, row.path).not.toContain(row.path);
    }
    expect(existing).toContain("/api/v1/projects");
    expect(existing).toContain("/api/v1/projects/{projectId}");
    expect(existing).toContain("/api/v1/projects/{projectId}/deliverables");
    expect(existing).toContain("/api/v1/projects/{projectId}/work-packages");
    expect(existing).toContain("/api/v1/projects/{projectId}/hub");
    for (const row of M4_PLANNED_API_ROUTES) {
      expect(existing, row.path).toContain(row.path);
    }
    expect(M3_PLANNED_API_ROUTES.every((row) => !row.path.includes("gate.override"))).toBe(true);
    expect(M4_PLANNED_API_ROUTES.every((row) => !row.path.includes("gate.override"))).toBe(true);
    const disassociate = M3_5_API_ROUTES.find((row) => row.path.endsWith("/disassociate"));
    expect(disassociate?.permission).toBe("work_package.update");
  });
});
