import { describe, expect, it } from "vitest";
import {
  authoritativeOrganizationId,
  destinationAfterAuth,
  postAuthDestination,
  safeNextPath,
  shouldForceOrgSwitch,
} from "./guards";
import type { SessionView } from "./types";

const base: SessionView = {
  authenticated: true,
  userId: "u1",
  email: "a@example.com",
  displayName: "Ada",
  activeOrganizationId: "org-a",
  mfa: { required: false, enrolled: true, satisfied: true, freshnessOk: true },
};

describe("usability route guards", () => {
  it("sends authenticated users without an org to org-switch", () => {
    const session = { ...base, activeOrganizationId: null };
    expect(shouldForceOrgSwitch(session)).toBe(true);
    expect(postAuthDestination(session)).toBe("/org-switch");
  });

  it("never treats a spoofed next URL or client orgId as authority", () => {
    expect(safeNextPath("https://evil.example/projects")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/sign-in")).toBeNull();
    expect(safeNextPath("/projects/abc/overview")).toBe("/projects/abc/overview");
    expect(safeNextPath("/calendars/schedule")).toBe("/calendars/schedule");
    expect(safeNextPath("/messages")).toBeNull();
    expect(
      authoritativeOrganizationId({ sessionOrgId: "org-a", clientOrgId: "org-spoofed" }),
    ).toBe("org-a");
    expect(destinationAfterAuth({ ...base, authenticated: false }, "/projects/abc/overview")).toBe("/sign-in");
  });

  it("keeps MFA enrollment ahead of product routes", () => {
    expect(
      postAuthDestination({
        ...base,
        mfa: { required: true, enrolled: false, satisfied: false, freshnessOk: false },
      }),
    ).toBe("/mfa/enroll");
  });
});
