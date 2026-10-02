import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALENDAR_MUTATIONS_REQUIRE_CAS,
  CALENDAR_MUTATIONS_REQUIRE_IDEMPOTENCY,
  M5_FORBIDDEN_API_PATH_TOKENS,
  M5_PLANNED_CALENDAR_API_ROUTES,
  M5_PLANNED_MESSAGING_API_ROUTES,
  calendarAccessGrantsProjectAccess,
  calendarActionAllowed,
  calendarEditsMutateSourceLifecycle,
  orgMembershipAloneExposesPrivateCalendar,
  teamMembershipGrantsProjectAccess,
} from "@amber/shared";

const ROOT = join(__dirname, "../../..");

describe("M5.2 Calendar security floors (fail closed)", () => {
  it("keeps Calendar access owner/grant based and isolated from Project/Team", () => {
    expect(orgMembershipAloneExposesPrivateCalendar()).toBe(false);
    expect(calendarAccessGrantsProjectAccess()).toBe(false);
    expect(teamMembershipGrantsProjectAccess()).toBe(false);
    expect(calendarEditsMutateSourceLifecycle()).toBe(false);
    expect(
      calendarActionAllowed({
        actorMembershipId: "admin",
        actorMembershipStatus: "ACTIVE",
        owner: { ownerMembershipId: "owner", ownerMembershipStatus: "ACTIVE" },
        grantPaths: [],
        action: "read",
      }),
    ).toBe(false);
    expect(
      calendarActionAllowed({
        actorMembershipId: "editor",
        actorMembershipStatus: "ACTIVE",
        owner: { ownerMembershipId: "owner", ownerMembershipStatus: "ACTIVE" },
        grantPaths: [{ kind: "USER", role: "EDITOR", active: true }],
        action: "admin_grant",
      }),
    ).toBe(false);
  });

  it("freezes mutations when the owner membership is inactive", () => {
    expect(
      calendarActionAllowed({
        actorMembershipId: "editor",
        actorMembershipStatus: "ACTIVE",
        owner: { ownerMembershipId: "owner", ownerMembershipStatus: "SUSPENDED" },
        grantPaths: [{ kind: "USER", role: "EDITOR", active: true }],
        action: "mutate_manual_event",
      }),
    ).toBe(false);
    expect(
      calendarActionAllowed({
        actorMembershipId: "editor",
        actorMembershipStatus: "ACTIVE",
        owner: { ownerMembershipId: "owner", ownerMembershipStatus: "SUSPENDED" },
        grantPaths: [{ kind: "USER", role: "EDITOR", active: true }],
        action: "read",
      }),
    ).toBe(true);
  });

  it("requires idempotency and CAS on the planned Calendar mutations", () => {
    expect(CALENDAR_MUTATIONS_REQUIRE_IDEMPOTENCY).toEqual(
      expect.arrayContaining([
        "create_calendar",
        "archive_calendar",
        "create_grant",
        "revoke_grant",
        "create_event",
        "delete_event",
      ]),
    );
    expect(CALENDAR_MUTATIONS_REQUIRE_CAS).toEqual(
      expect.arrayContaining(["rename_calendar", "archive_calendar", "update_event", "delete_event"]),
    );
  });

  it("publishes Calendar OpenAPI without Messaging, cloud, or forbidden tokens", () => {
    expect(existsSync(join(ROOT, "api/src/calendar"))).toBe(true);
    expect(existsSync(join(ROOT, "api/src/messaging"))).toBe(false);
    const deploy = readFileSync(join(ROOT, ".github/workflows/deploy-cloud.yml"), "utf8");
    expect(deploy).toMatch(/if:\s*false/);
    const openapi = JSON.parse(readFileSync(join(ROOT, "api/openapi/openapi.json"), "utf8")) as {
      paths: Record<string, unknown>;
    };
    const raw = JSON.stringify(openapi);
    for (const row of M5_PLANNED_CALENDAR_API_ROUTES) {
      expect(Object.keys(openapi.paths), row.path).toContain(row.path);
    }
    for (const row of M5_PLANNED_MESSAGING_API_ROUTES) {
      expect(Object.keys(openapi.paths), row.path).not.toContain(row.path);
    }
    for (const token of M5_FORBIDDEN_API_PATH_TOKENS) {
      expect(raw).not.toContain(token);
    }
    expect(raw).not.toContain("gate.override");
  });
});
