import { describe, expect, it } from "vitest";
import { initialShellState, shellReducer } from "./shell-state";
import type { SessionView } from "./types";

const session = (org: string | null): SessionView => ({
  authenticated: true,
  userId: "u1",
  email: "a@example.com",
  displayName: "Ada",
  activeOrganizationId: org,
});

describe("shell context reducer", () => {
  it("clears prior Project context when Organization switches", () => {
    const withProject = shellReducer(initialShellState, {
      type: "project-loaded",
      project: {
        id: "p1",
        name: "Aurora",
        organizationId: "org-a",
        archivedAt: null,
        permissions: ["project.read"],
      },
    });
    expect(withProject.currentProject?.id).toBe("p1");
    const switched = shellReducer(withProject, {
      type: "org-switched",
      session: session("org-b"),
      organizations: [{ id: "org-b", name: "B", status: "ACTIVE", type: "INTERNAL", active: true }],
      projects: [],
    });
    expect(switched.currentProject).toBeNull();
    expect(switched.session?.activeOrganizationId).toBe("org-b");
    expect(switched.projects).toEqual([]);
  });

  it("records denied project access without storing the unauthorized resource", () => {
    const denied = shellReducer(initialShellState, { type: "project-denied", kind: "no-permission" });
    expect(denied.currentProject).toBeNull();
    expect(denied.projectAccess).toBe("no-permission");
  });
});
