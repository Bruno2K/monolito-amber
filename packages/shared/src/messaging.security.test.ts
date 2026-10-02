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
  conversationVisibleInDirectory,
  directConversationAccess,
  inaccessibleConversationLeaksCount,
  roleGrantsMessageContent,
  searchSnippetMayRevealInaccessibleConversation,
} from "./messaging.js";

describe("M5.1 Messaging AuthZ floors", () => {
  it("keeps message.moderate reserved, high-risk, and unassigned", () => {
    expect(isPermissionCode("message.moderate")).toBe(true);
    expect(isReservedCollaborationPermission("message.moderate")).toBe(true);
    expect(isOrgScopedPermission("message.moderate")).toBe(false);
    expect(isProjectScopedPermission("message.moderate")).toBe(false);
    expect(HIGH_RISK_PERMISSIONS).toContain("message.moderate");
    for (const template of ROLE_TEMPLATES) {
      expect(template.permissions).not.toContain("message.moderate");
    }
    expect(PERMISSIONS).not.toContain("message.send");
    expect(PERMISSIONS).not.toContain("message.read");
  });

  it("fail-closes message.moderate and role-based content reads", () => {
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
              permissions: ["organization.read", "message.moderate"],
            },
          ],
        },
        "message.moderate",
      ),
    ).toThrow(DenyByDefaultError);
    expect(roleGrantsMessageContent("ORGANIZATION_ADMINISTRATOR")).toBe(false);
    expect(roleGrantsMessageContent("AUDITOR")).toBe(false);
    expect(roleGrantsMessageContent("PROJECT_COORDINATOR")).toBe(false);
  });

  it("omits inaccessible conversations from lists, search, and unread", () => {
    const pair = { low: "m1", high: "m2" };
    expect(
      directConversationAccess({
        actorMembershipId: "m3",
        actorMembershipStatus: "ACTIVE",
        pair,
      }),
    ).toBe("none");
    expect(conversationVisibleInDirectory("none")).toBe(false);
    expect(inaccessibleConversationLeaksCount()).toBe(false);
    expect(searchSnippetMayRevealInaccessibleConversation()).toBe(false);
  });
});
