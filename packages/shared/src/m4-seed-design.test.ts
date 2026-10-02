import { describe, expect, it } from "vitest";
import {
  M4_8_REQUIREMENT_IDS,
  M4_SEED_DEPENDENCIES,
  M4_SEED_EMAIL_DOMAIN,
  M4_SEED_ISSUES,
  M4_SEED_MILESTONES,
  M4_SEED_PRE_M4_TASK,
  M4_SEED_RESET_POLICY,
  M4_SEED_TASKS,
} from "./m4-seed-design.js";

describe("M4.8 seed scenario completeness", () => {
  it("M4.8-SEED-01 covers Task stored statuses, FS pairs, and Milestone stored statuses", () => {
    const taskStatuses = new Set(M4_SEED_TASKS.map((row) => row.status));
    expect(taskStatuses).toEqual(new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]));
    expect(M4_SEED_TASKS.find((row) => row.status === "BLOCKED")?.blockedReason).toBeTruthy();
    expect(M4_SEED_TASKS.some((row) => row.dueDate?.startsWith("2000-"))).toBe(true);
    expect(M4_SEED_DEPENDENCIES).toHaveLength(2);
    expect(M4_SEED_DEPENDENCIES.every((row) => row.type === "FINISH_TO_START")).toBe(true);
    const msStatuses = new Set(M4_SEED_MILESTONES.map((row) => row.status));
    expect(msStatuses).toEqual(new Set(["PLANNED", "ACHIEVED", "CANCELLED"]));
    expect(M4_SEED_MILESTONES.some((row) => row.targetDate?.startsWith("2001-"))).toBe(true);
  });

  it("links representative Phase / Deliverable / WorkPackage / Issue without inventing a second SoT", () => {
    const linked = M4_SEED_TASKS.find((row) => row.key === "task-a1-todo");
    expect(linked?.issueKey).toBe("iss-a1-grid");
    expect(linked?.phaseKey).toBe("phase-a1-planned");
    expect(linked?.deliverableKey).toBe("del-a1-planned-user");
    expect(linked?.workPackageKey).toBe("wp-planned");
    expect(linked?.milestoneKey).toBe("ms-a1-planned");
    expect(M4_SEED_ISSUES).toHaveLength(1);
    expect(M4_SEED_ISSUES[0]?.origin).toBe("MANUAL");
  });

  it("keeps an Org B negative and a pre-M4 activation title for upgrade rehearsal", () => {
    expect(M4_SEED_TASKS.some((row) => row.projectKey === "project-b1")).toBe(true);
    expect(M4_SEED_MILESTONES.some((row) => row.projectKey === "project-b1")).toBe(true);
    expect(M4_SEED_PRE_M4_TASK.title).toBe("Pre-M4 activation Task");
  });

  it("forbids real PII and production credentials", () => {
    expect(M4_SEED_RESET_POLICY.realPiiForbidden).toBe(true);
    expect(M4_SEED_RESET_POLICY.productionCredentialsForbidden).toBe(true);
    expect(M4_SEED_RESET_POLICY.idempotent).toBe(true);
    expect(M4_SEED_RESET_POLICY.emailDomain).toBe(M4_SEED_EMAIL_DOMAIN);
    expect(M4_8_REQUIREMENT_IDS).toHaveLength(14);
  });
});
