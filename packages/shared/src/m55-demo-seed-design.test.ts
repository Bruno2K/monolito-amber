import { describe, expect, it } from "vitest";
import { M3_SEED_PASSWORD, M3_SEED_USERS } from "./m3-seed-design.js";
import { countUnread, directConversationPairKey } from "./messaging.js";
import {
  M55_DEMO_CONVERSATIONS,
  M55_DEMO_DELIVERABLES,
  M55_DEMO_DEPENDENCIES,
  M55_DEMO_MESSAGES,
  M55_DEMO_MILESTONES,
  M55_DEMO_ORG_MEMBERSHIPS,
  M55_DEMO_PROJECT_MEMBERS,
  M55_DEMO_PROJECTS,
  M55_DEMO_REFERENCE_ISO,
  M55_DEMO_TASKS,
  M55_DEMO_TEAMS,
  M55_DEMO_USERS,
  assertLocalDemoSeedTarget,
  demoSeedEnabled,
  demoSeedUuid,
} from "./m55-demo-seed-design.js";

describe("M5.5 local demo seed design", () => {
  it("keeps deterministic ids and does not reuse canonical fixture keys", () => {
    expect(demoSeedUuid("user:admin-a")).toBe(demoSeedUuid("user:admin-a"));
    expect(demoSeedUuid("project:demo-hospital")).not.toBe(demoSeedUuid("user:admin-a"));
    const existing = new Set(M3_SEED_USERS.map((user) => user.key));
    for (const user of M55_DEMO_USERS) {
      expect(existing.has(user.key)).toBe(false);
      expect(user.email.endsWith("@amber.test")).toBe(true);
    }
    expect(M3_SEED_PASSWORD).toBe("correct-horse-12");
    expect(M55_DEMO_REFERENCE_ISO).toBe("2026-10-02T12:00:00.000Z");
  });

  it("keeps direct pairs unique and resource links inside the dataset", () => {
    const pairs = M55_DEMO_CONVERSATIONS.filter((row) => row.kind === "DIRECT").map((row) => {
      const [left, right] = row.userKeys ?? [];
      return directConversationPairKey(demoSeedUuid(`orgmem:${left}`), demoSeedUuid(`orgmem:${right}`)).low;
    });
    expect(new Set(pairs).size).toBe(pairs.length);
    const tasks = new Set(M55_DEMO_TASKS.map((row) => row.key));
    const deliverables = new Set(M55_DEMO_DELIVERABLES.map((row) => row.key));
    const milestones = new Set(M55_DEMO_MILESTONES.map((row) => row.key));
    const projects = new Set(M55_DEMO_PROJECTS.map((row) => row.key));
    for (const message of M55_DEMO_MESSAGES) {
      if (!("link" in message) || !message.link) {
        continue;
      }
      if (message.link.type === "TASK") {
        expect(tasks.has(message.link.taskKey)).toBe(true);
      }
      if (message.link.type === "DELIVERABLE") {
        expect(deliverables.has(message.link.deliverableKey)).toBe(true);
      }
      if (message.link.type === "MILESTONE") {
        expect(milestones.has(message.link.milestoneKey)).toBe(true);
      }
      if (message.link.type === "PROJECT") {
        expect(projects.has(message.link.projectKey)).toBe(true);
      }
    }
    const seen = new Set<string>();
    for (const edge of M55_DEMO_DEPENDENCIES) {
      expect(edge.predecessor).not.toBe(edge.successor);
      expect(seen.has(`${edge.predecessor}>${edge.successor}`)).toBe(false);
      seen.add(`${edge.predecessor}>${edge.successor}`);
    }
    expect(M55_DEMO_TEAMS.filter((team) => team.archived)).toHaveLength(1);
    expect(M55_DEMO_PROJECTS.filter((project) => project.archived)).toHaveLength(1);
    expect(M55_DEMO_MESSAGES.some((message) => message.tombstone)).toBe(true);
    expect(M55_DEMO_MESSAGES.some((message) => message.edited)).toBe(true);
  });

  it("keeps Oto external and Caio unread on Rui's later direct message", () => {
    expect(M55_DEMO_ORG_MEMBERSHIPS.find((row) => row.userKey === "contractor-a")?.membershipType).toBe("EXTERNAL");
    expect(M55_DEMO_ORG_MEMBERSHIPS.filter((row) => row.userKey !== "contractor-a").every((row) => row.membershipType === "INTERNAL")).toBe(true);
    expect(M55_DEMO_ORG_MEMBERSHIPS.find((row) => row.userKey === "contractor-a")?.templateKey).toBeNull();
    const otoProjects = M55_DEMO_PROJECT_MEMBERS.filter((row) => row.userKey === "contractor-a");
    expect(otoProjects).toEqual([{ projectKey: "demo-hospital", userKey: "contractor-a", templateKey: "EXTERNAL_CONTRIBUTOR" }]);
    const direct = M55_DEMO_CONVERSATIONS.find((row) => row.key === "dm-bim-structural");
    const messages = M55_DEMO_MESSAGES.filter((row) => row.conversationKey === "dm-bim-structural");
    const latest = messages.at(-1);
    expect(latest?.authorKey).toBe("structural-a");
    expect(latest?.at > (messages[0]?.at ?? "")).toBe(true);
    expect(direct?.readBy).toEqual(["structural-a"]);
    const bim = demoSeedUuid("orgmem:bim-a");
    const rui = demoSeedUuid("orgmem:structural-a");
    const rows = messages.map((message) => ({
      id: message.key,
      createdAt: message.at,
      authorMembershipId: message.authorKey === "bim-a" ? bim : rui,
    }));
    const watermark = { id: latest?.key ?? "", createdAt: latest?.at ?? "" };
    expect(countUnread({ readerMembershipId: bim, messages: rows, watermark: null })).toBeGreaterThan(0);
    expect(countUnread({ readerMembershipId: rui, messages: rows, watermark })).toBe(0);
    expect(countUnread({ readerMembershipId: bim, messages: rows, watermark })).toBe(0);
  });

  it("refuses a demo seed unless the target is explicitly local", () => {
    const local = "postgresql://amber:correct-horse-12@127.0.0.1:5432/amber";
    expect(demoSeedEnabled({})).toBe(false);
    expect(demoSeedEnabled({ AMBER_SEED_M3: "0" })).toBe(false);
    expect(demoSeedEnabled({ AMBER_SEED_M3: "1" })).toBe(true);
    expect(() =>
      assertLocalDemoSeedTarget({
        AMBER_ALLOW_DEMO_SEED: "1",
        DATABASE_URL: "postgresql://amber:correct-horse-12@localhost:5432/amber",
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalDemoSeedTarget({
        AMBER_ALLOW_DEMO_SEED: "1",
        DATABASE_URL: "postgresql://amber:correct-horse-12@[::1]:5432/amber",
      }),
    ).not.toThrow();
    expect(() => assertLocalDemoSeedTarget({ AMBER_ALLOW_DEMO_SEED: "1" })).toThrow(/DATABASE_URL is missing/);
    expect(() => assertLocalDemoSeedTarget({ AMBER_ALLOW_DEMO_SEED: "1", DATABASE_URL: "not a url" })).toThrow(/malformed/);
    expect(() =>
      assertLocalDemoSeedTarget({
        AMBER_ALLOW_DEMO_SEED: "1",
        NODE_ENV: "production",
        DATABASE_URL: local,
      }),
    ).toThrow(/production/);
    expect(() =>
      assertLocalDemoSeedTarget({
        AMBER_ALLOW_DEMO_SEED: "1",
        DATABASE_URL: local,
      }),
    ).not.toThrow();
    const remote = "postgresql://amber:super-secret-password@db.example.com:5432/amber";
    expect(() => assertLocalDemoSeedTarget({ AMBER_ALLOW_DEMO_SEED: "1", DATABASE_URL: remote })).toThrow(/db\.example\.com/);
    try {
      assertLocalDemoSeedTarget({ AMBER_ALLOW_DEMO_SEED: "1", DATABASE_URL: remote });
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-password");
      expect(String(error)).not.toContain("postgresql://");
    }
    expect(() =>
      assertLocalDemoSeedTarget({
        AMBER_ALLOW_DEMO_SEED: "1",
        DATABASE_URL: "postgresql://amber:super-secret-password@localhost.example.com:5432/amber",
      }),
    ).toThrow(/localhost\.example\.com/);
    expect(() => assertLocalDemoSeedTarget({ DATABASE_URL: local })).toThrow(/AMBER_ALLOW_DEMO_SEED=1 is required/);
  });
});
