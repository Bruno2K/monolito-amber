import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PERMISSIONS,
  M5_PLANNED_API_ROUTES,
  PERMISSIONS,
  assertPermission,
  calendarAccessGrantsProjectAccess,
  inaccessibleConversationLeaksCount,
  isForbiddenPermission,
  messagingParticipationGrantsProjectAccess,
  orgMembershipAloneExposesPrivateCalendar,
  permissionLooksLikeM6Plus,
  roleGrantsMessageContent,
} from "@amber/shared";

const ROOT = join(__dirname, "../../..");

describe("M5.1 baseline security (fail closed)", () => {
  it("keeps gate.override forbidden and does not smuggle M6+ permissions", () => {
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(isForbiddenPermission("gate.override")).toBe(true);
    expect(PERMISSIONS).not.toContain("gate.override");
    for (const code of PERMISSIONS) {
      expect(permissionLooksLikeM6Plus(code), code).toBe(false);
    }
  });

  it("fail-closes reserved collaboration codes and collaboration≠Project floors", () => {
    expect(() =>
      assertPermission(
        {
          userId: "u1",
          organizationId: "org-a",
          membershipStatus: "ACTIVE",
          membershipType: "INTERNAL",
          mfaSatisfied: true,
          grants: [],
        },
        "calendar.admin",
      ),
    ).toThrow();
    expect(orgMembershipAloneExposesPrivateCalendar()).toBe(false);
    expect(calendarAccessGrantsProjectAccess()).toBe(false);
    expect(messagingParticipationGrantsProjectAccess()).toBe(false);
    expect(roleGrantsMessageContent("AUDITOR")).toBe(false);
    expect(inaccessibleConversationLeaksCount()).toBe(false);
  });

  it("ships Calendar and Messaging Nest/OpenAPI while cloud stays closed", () => {
    expect(existsSync(join(ROOT, "api/src/calendar"))).toBe(true);
    expect(existsSync(join(ROOT, "api/src/messaging"))).toBe(true);
    const deploy = readFileSync(join(ROOT, ".github/workflows/deploy-cloud.yml"), "utf8");
    expect(deploy).toMatch(/if:\s*false/);
    const openapi = JSON.parse(readFileSync(join(ROOT, "api/openapi/openapi.json"), "utf8")) as {
      paths: Record<string, unknown>;
    };
    const paths = Object.keys(openapi.paths);
    for (const row of M5_PLANNED_API_ROUTES) {
      if (row.implementedIn === "m5.2" || row.implementedIn === "m5.4" || row.implementedIn === "m5.5") {
        expect(paths, row.path).toContain(row.path);
      } else {
        expect(paths, row.path).not.toContain(row.path);
      }
    }
  });
});
