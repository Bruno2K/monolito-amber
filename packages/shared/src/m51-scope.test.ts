import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions.js";
import { ROLE_TEMPLATES } from "./role-templates.js";
import { M5_PLANNED_API_ROUTES } from "./m5-routes.js";
import {
  M51_CLOUD_FENCE,
  M51_FORBIDDEN_MODEL_NAMES,
  M51_FORBIDDEN_PATH_TOKENS,
  permissionLooksLikeM6Plus,
  textSmugglesM6CloudOrAttachment,
} from "./m51-scope.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("M5.1-R15 scope fence", () => {
  it("does not add M6+/resource/time/attachment/moderation/team.* catalog codes", () => {
    for (const code of PERMISSIONS) {
      expect(permissionLooksLikeM6Plus(code), code).toBe(false);
    }
    const granted = ROLE_TEMPLATES.flatMap((template) => template.permissions);
    expect(granted.some((code) => permissionLooksLikeM6Plus(code))).toBe(false);
  });

  it("does not plan M6+ API families and keeps cloud deploy disabled", () => {
    for (const row of M5_PLANNED_API_ROUTES) {
      for (const token of M51_FORBIDDEN_PATH_TOKENS) {
        expect(row.path).not.toContain(token);
      }
    }
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    for (const model of M51_FORBIDDEN_MODEL_NAMES) {
      expect(schema).not.toContain(`model ${model}`);
    }
    expect(schema).not.toContain('@@schema("resource")');
    const deploy = readFileSync(join(ROOT, ".github/workflows/deploy-cloud.yml"), "utf8");
    expect(deploy).toMatch(/if:\s*false/);
    expect(M51_CLOUD_FENCE.deployWorkflowMustStayDisabled).toBe(true);
    expect(existsSync(join(ROOT, "api/src/calendar"))).toBe(true);
    expect(existsSync(join(ROOT, "api/src/messaging"))).toBe(false);
    expect(existsSync(join(ROOT, "web/app/calendars"))).toBe(false);
    expect(existsSync(join(ROOT, "web/app/messages"))).toBe(false);
  });

  it("does not treat reserved collaboration codes as M6 smuggling", () => {
    expect(textSmugglesM6CloudOrAttachment("CalendarAccessGrant VIEWER/EDITOR")).toBe(false);
    expect(textSmugglesM6CloudOrAttachment("ResourceAllocation plus TimeEntry")).toBe(true);
  });
});
