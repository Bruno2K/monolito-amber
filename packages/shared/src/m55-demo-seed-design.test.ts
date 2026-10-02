import { describe, expect, it } from "vitest";
import { M3_SEED_PASSWORD, M3_SEED_USERS } from "./m3-seed-design.js";
import { directConversationPairKey } from "./messaging.js";
import {
  M55_DEMO_CONVERSATIONS,
  M55_DEMO_DELIVERABLES,
  M55_DEMO_DEPENDENCIES,
  M55_DEMO_MESSAGES,
  M55_DEMO_MILESTONES,
  M55_DEMO_PROJECTS,
  M55_DEMO_REFERENCE_ISO,
  M55_DEMO_TASKS,
  M55_DEMO_TEAMS,
  M55_DEMO_USERS,
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
});
