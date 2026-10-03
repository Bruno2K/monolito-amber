import { describe, expect, it } from "vitest";
import { M3_SEED_PASSWORD, M3_SEED_USERS } from "./m3-seed-design.js";
import { countUnread, directConversationPairKey } from "./messaging.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isUsableMembership } from "./membership.js";
import { redactMessageProjection, teamConversationAccess } from "./messaging.js";
import {
  DEMO_SEED_COMMAND_FLAGS,
  M55_DEMO_CONVERSATIONS,
  M55_DEMO_DELIVERABLES,
  M55_DEMO_DEPENDENCIES,
  M55_DEMO_DOCUMENTS,
  M55_DEMO_MESSAGES,
  M55_DEMO_MILESTONES,
  M55_DEMO_ORG_MEMBERSHIPS,
  M55_DEMO_PROJECT_MEMBERS,
  M55_DEMO_PROJECTS,
  M55_DEMO_REFERENCE_ISO,
  M55_DEMO_TASKS,
  M55_DEMO_TEAM_MEMBERS,
  M55_DEMO_TEAMS,
  M55_DEMO_USERS,
  assertLocalDemoSeedTarget,
  demoDeclaredReadStates,
  demoMessageLifecycle,
  demoMessageResource,
  demoMessageVersion,
  demoSeedEnabled,
  demoSeedFlagsInBash,
  demoSeedFlagsInPowerShell,
  demoSeedUuid,
  encodeDemoMessageBody,
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
    const local = "postgresql://seeduser:super-secret-password@127.0.0.1:5432/amber";
    const allowed = { AMBER_SEED_M3: "1", AMBER_ALLOW_DEMO_SEED: "1" };
    expect(demoSeedEnabled({})).toBe(false);
    expect(demoSeedEnabled({ AMBER_SEED_M3: "0" })).toBe(false);
    expect(demoSeedEnabled({ AMBER_SEED_M3: "1" })).toBe(true);
    expect(() =>
      assertLocalDemoSeedTarget({
        ...allowed,
        DATABASE_URL: "postgresql://seeduser:super-secret-password@localhost:5432/amber",
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalDemoSeedTarget({
        ...allowed,
        DATABASE_URL: "postgresql://seeduser:super-secret-password@[::1]:5432/amber",
      }),
    ).not.toThrow();
    expect(() => assertLocalDemoSeedTarget({ ...allowed, DATABASE_URL: local })).not.toThrow();
    expect(() => assertLocalDemoSeedTarget({ ...allowed })).toThrow(/DATABASE_URL is missing/);
    expect(() => assertLocalDemoSeedTarget({ ...allowed, DATABASE_URL: "   " })).toThrow(/DATABASE_URL is missing/);
    expect(() => assertLocalDemoSeedTarget({ ...allowed, DATABASE_URL: "not a url" })).toThrow(/malformed/);
    expect(() => assertLocalDemoSeedTarget({ ...allowed, DATABASE_URL: "mysql://seeduser:super-secret-password@127.0.0.1:5432/amber" })).toThrow(/postgresql protocol/);
    for (const nodeEnv of ["production", "Production", " PRODUCTION ", "prod", "Prod", " Prod "]) {
      expect(() => assertLocalDemoSeedTarget({ ...allowed, NODE_ENV: nodeEnv, DATABASE_URL: local })).toThrow(/production/);
    }
    for (const amberEnv of ["production", "PRODUCTION", " production", "prod", "Prod", " Prod "]) {
      expect(() => assertLocalDemoSeedTarget({ ...allowed, AMBER_ENV: amberEnv, NODE_ENV: "development", DATABASE_URL: local })).toThrow(/production/);
    }
    expect(() => assertLocalDemoSeedTarget({ AMBER_ALLOW_DEMO_SEED: "1", DATABASE_URL: local })).toThrow(/AMBER_SEED_M3=1 is required/);
    expect(() => assertLocalDemoSeedTarget({ AMBER_SEED_M3: "1", DATABASE_URL: local })).toThrow(/AMBER_ALLOW_DEMO_SEED=1 is required/);
    expect(() => assertLocalDemoSeedTarget({ ...allowed, AMBER_SEED_M3: " 1 ", DATABASE_URL: local })).toThrow(/AMBER_SEED_M3=1 is required/);
    const refused = [
      "postgresql://seeduser:super-secret-password@db.example.com:5432/amber",
      "postgresql://seeduser:super-secret-password@postgres:5432/amber",
      "postgresql://seeduser:super-secret-password@localhost.example.com:5432/amber",
      "postgresql://seeduser:super-secret-password@0.0.0.0:5432/amber",
    ];
    for (const databaseUrl of refused) {
      expect(() =>
        assertLocalDemoSeedTarget({
          ...allowed,
          AMBER_SEED_FORCE: "1",
          AMBER_SEED_UNSAFE: "1",
          DATABASE_URL: databaseUrl,
        }),
      ).toThrow(/not loopback/);
      try {
        assertLocalDemoSeedTarget({ ...allowed, DATABASE_URL: databaseUrl });
      } catch (error) {
        const message = String(error);
        expect(message).not.toContain("super-secret-password");
        expect(message).not.toContain("seeduser");
        expect(message).not.toContain("postgresql://");
        expect(message).not.toContain(databaseUrl);
      }
    }
  });

  it("keeps Bash and PowerShell demo seed flags in lockstep", () => {
    const root = resolve(__dirname, "../../..");
    const bash = readFileSync(resolve(root, "scripts/local-rc/bootstrap.sh"), "utf8");
    const powershell = readFileSync(resolve(root, "scripts/local-rc/bootstrap.ps1"), "utf8");
    const reset = readFileSync(resolve(root, "scripts/local-rc/reset.ps1"), "utf8");
    const docs = readFileSync(resolve(root, "docs/development/m55-local-demo.md"), "utf8");
    const expected = [...DEMO_SEED_COMMAND_FLAGS].sort();
    expect(demoSeedFlagsInBash(bash)).toEqual(expected);
    expect(demoSeedFlagsInPowerShell(powershell)).toEqual(expected);
    expect(reset).toContain("bootstrap.ps1");
    expect(docs).toContain("AMBER_SEED_M3=1");
    expect(docs).toContain("AMBER_ALLOW_DEMO_SEED=1");
    expect(docs).not.toContain("service name `postgres`");
    expect(docs).toContain("127.0.0.1");
  });

  it("enumerates documents, conversations, messages, links, and read states", () => {
    expect(M55_DEMO_DOCUMENTS.map((row) => [row.key, row.projectKey, row.code, row.status])).toEqual([
      ["hosp-minutes", "demo-hospital", "HSP-ATA-012", "ACTIVE"],
      ["log-restricted", "demo-logistics", "LOG-REL-003", "ACTIVE"],
    ]);
    const messageKeys = M55_DEMO_MESSAGES.map((row) => row.key);
    expect(new Set(messageKeys).size).toBe(messageKeys.length);
    for (const message of M55_DEMO_MESSAGES) {
      expect(M55_DEMO_CONVERSATIONS.some((row) => row.key === message.conversationKey)).toBe(true);
      expect(demoMessageLifecycle(message)).toBe(message.tombstone ? "TOMBSTONED" : message.edited ? "EDITED" : "VISIBLE");
      expect(demoMessageVersion(message)).toBe(message.edited || message.tombstone ? 2 : 1);
      expect(message.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const resource = demoMessageResource(message);
      if (!("link" in message) || !message.link) {
        expect(resource).toBeNull();
        expect(encodeDemoMessageBody(message.body, null)).toBe(message.body);
        continue;
      }
      expect(resource?.type).toBe(message.link.type);
      expect(resource?.projectKey).toBeTruthy();
      const stored = encodeDemoMessageBody(message.body, { type: resource!.type, id: demoSeedUuid(`${resource!.type.toLowerCase()}:${resource!.resourceKey}`) });
      expect(stored.startsWith(message.body)).toBe(true);
      expect(stored).not.toBe(message.body);
    }
    const reads = demoDeclaredReadStates();
    expect(reads).toContainEqual({ conversationKey: "dm-bim-structural", readerKey: "structural-a", messageKey: "dm-str-2" });
    expect(reads.some((row) => row.conversationKey === "dm-bim-structural" && row.readerKey === "bim-a")).toBe(false);
    expect(reads).toHaveLength(M55_DEMO_CONVERSATIONS.reduce((sum, row) => sum + row.readBy.length, 0));
    const otoTeams = M55_DEMO_TEAM_MEMBERS.filter((row) => row.userKey === "contractor-a").map((row) => row.teamKey);
    expect(otoTeams).toEqual(["demo-site"]);
    expect(isUsableMembership("SUSPENDED")).toBe(false);
    expect(isUsableMembership("REMOVED")).toBe(false);
    expect(teamConversationAccess({ actorMembershipStatus: "SUSPENDED", teamMembershipActive: true, teamArchived: false })).toBe("none");
    expect(teamConversationAccess({ actorMembershipStatus: "REMOVED", teamMembershipActive: true, teamArchived: false })).toBe("none");
    expect(teamConversationAccess({ actorMembershipStatus: "ACTIVE", teamMembershipActive: true, teamArchived: true })).toBe("read_only");
    const tombstone = M55_DEMO_MESSAGES.find((row) => row.key === "dm-arch-3");
    expect(tombstone?.body.trim().length).toBeGreaterThan(0);
    const projected = redactMessageProjection({
      body: tombstone?.body ?? "",
      editedAt: null,
      deletedAt: tombstone?.at ?? null,
      authorOrganizationMembershipId: "coord-a",
      resourcePreviews: [{ type: "TASK", id: "secret", title: "protected preview", projectId: "demo-hospital" }],
    });
    expect(projected).toEqual({
      body: null,
      lifecycle: "TOMBSTONED",
      authorOrganizationMembershipId: "coord-a",
      resourcePreviews: [],
    });
    expect(JSON.stringify(projected)).not.toContain(tombstone?.body ?? "missing");
    expect(JSON.stringify(projected)).not.toContain("protected preview");
  });
});
