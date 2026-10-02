import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  M5_FORBIDDEN_API_PATH_TOKENS,
  M5_PLANNED_API_ROUTES,
  M5_PLANNED_UI_ROUTES,
  M5_PROTOTYPE_ONLY_UI_ROUTES,
} from "./m5-routes.js";
import { FIGMA_PROTOTYPE_ROUTE_MAP } from "./m3-routes.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("M5.1 planned routes", () => {
  it("keeps planned UI unique and does not ship Next product pages yet", () => {
    const paths = M5_PLANNED_UI_ROUTES.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(existsSync(join(ROOT, "web/app/calendars"))).toBe(false);
    expect(existsSync(join(ROOT, "web/app/messages"))).toBe(false);
    expect(existsSync(join(ROOT, "web/app/calendarios"))).toBe(false);
    expect(existsSync(join(ROOT, "web/app/mensagens"))).toBe(false);
    expect(M5_PROTOTYPE_ONLY_UI_ROUTES.map((row) => row.path)).toEqual(["/calendarios", "/mensagens"]);
    expect(FIGMA_PROTOTYPE_ROUTE_MAP.find((row) => row.figmaPath === "/calendarios")?.productPath).toBeNull();
    expect(FIGMA_PROTOTYPE_ROUTE_MAP.find((row) => row.figmaPath === "/mensagens")?.productPath).toBeNull();
  });

  it("plans Calendar/Messaging APIs without colliding with current OpenAPI or smuggling M6+", () => {
    const openapi = JSON.parse(readFileSync(join(ROOT, "api/openapi/openapi.json"), "utf8")) as {
      paths: Record<string, unknown>;
    };
    const existing = Object.keys(openapi.paths);
    const planned = M5_PLANNED_API_ROUTES.map((row) => `${row.method} ${row.path}`);
    expect(new Set(planned).size).toBe(planned.length);
    for (const row of M5_PLANNED_API_ROUTES) {
      expect(existing, row.path).not.toContain(row.path);
      expect(row.auth.includes("project.read") && row.path.includes("/calendars")).toBe(false);
      for (const token of M5_FORBIDDEN_API_PATH_TOKENS) {
        expect(row.path).not.toContain(token);
      }
    }
  });
});
