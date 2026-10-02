import { describe, expect, it } from "vitest";
import { DenyByDefaultError } from "./errors.js";
import { HIGH_RISK_PERMISSIONS, assertPermission } from "./authz.js";
import {
  PERMISSIONS,
  isOrgScopedPermission,
  isPermissionCode,
  isProjectScopedPermission,
  isReservedCollaborationPermission,
} from "./permissions.js";
import { ROLE_TEMPLATES } from "./role-templates.js";
import {
  calendarAccessGrantsProjectAccess,
  calendarActionAllowed,
  orgMembershipAloneExposesPrivateCalendar,
  projectReferencedEvent,
} from "./calendar.js";

describe("M5.1 Calendar AuthZ floors", () => {
  it("keeps calendar.admin reserved, high-risk, and unassigned", () => {
    expect(isPermissionCode("calendar.admin")).toBe(true);
    expect(isReservedCollaborationPermission("calendar.admin")).toBe(true);
    expect(isOrgScopedPermission("calendar.admin")).toBe(false);
    expect(isProjectScopedPermission("calendar.admin")).toBe(false);
    expect(HIGH_RISK_PERMISSIONS).toContain("calendar.admin");
    for (const template of ROLE_TEMPLATES) {
      expect(template.permissions).not.toContain("calendar.admin");
    }
    expect(PERMISSIONS).not.toContain("calendar.read");
    expect(PERMISSIONS).not.toContain("calendar.create");
  });

  it("fail-closes reserved calendar.admin even for org administrators", () => {
    expect(() =>
      assertPermission(
        {
          userId: "u1",
          organizationId: "org-a",
          membershipStatus: "ACTIVE",
          membershipType: "ADMINISTRATIVE",
          mfaSatisfied: true,
          grants: [
            {
              templateKey: "ORGANIZATION_ADMINISTRATOR",
              scope: "organization",
              permissions: ["organization.read", "calendar.admin"],
            },
          ],
        },
        "calendar.admin",
      ),
    ).toThrow(DenyByDefaultError);
  });

  it("does not expose private calendars from Org membership or Calendar→Project", () => {
    expect(orgMembershipAloneExposesPrivateCalendar()).toBe(false);
    expect(calendarAccessGrantsProjectAccess()).toBe(false);
    expect(
      projectReferencedEvent({
        hasCalendarAccess: true,
        sourceExists: true,
        sourceDeletedOrArchived: false,
        sourceAuthorized: false,
        persistedSnapshotTitle: "secret task",
        liveSourceTitle: "secret task",
      }).omit,
    ).toBe(true);
  });

  it("revokes inactive actors immediately", () => {
    expect(
      calendarActionAllowed({
        actorMembershipId: "owner",
        actorMembershipStatus: "REMOVED",
        owner: { ownerMembershipId: "owner", ownerMembershipStatus: "REMOVED" },
        grantPaths: [{ kind: "USER", role: "EDITOR", active: true }],
        action: "read",
      }),
    ).toBe(false);
  });
});
