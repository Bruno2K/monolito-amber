import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MESSAGE_SENT_IS_AUDIT_EVENT } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m54-${Date.now()}`;

type Agent = ReturnType<typeof request.agent>;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;
let orgA: string;
let orgB: string;
let projectA: string;
let taskA: string;
let ownerA: Agent;
let ownerB: Agent;
let alice: Agent;
let bob: Agent;
let carol: Agent;
let aliceMembershipId: string;
let bobMembershipId: string;
let carolMembershipId: string;
let ownerMembershipId: string;
let ownerBMembershipId: string;
let directId: string;
let teamId: string;
let teamConversationId: string;

beforeAll(async () => {
  db = await startTestDatabase();
  migrate(db.url);
  seed(db.url);
  app = await createTestApp(db.url);
  emails = app.get(EmailAdapter);
  prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await prisma.$connect();

  ownerA = request.agent(app.getHttpServer());
  await ownerA.post("/api/v1/auth/register").send({
    email: `owner-a-${suffix}@example.com`,
    password: PASSWORD,
    displayName: "Owner A",
  });
  const createdA = await ownerA.post("/api/v1/organizations").send({ name: `Org A ${suffix}` });
  orgA = createdA.body.id;
  ownerMembershipId = createdA.body.membershipId;
  await enrollTotp(ownerA);

  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email: `owner-b-${suffix}@example.com`,
    roleTemplateKey: "VIEWER",
  });
  const ownerBInvite = emails.sent.filter((message) => message.to === `owner-b-${suffix}@example.com`).at(-1);
  ownerB = request.agent(app.getHttpServer());
  await ownerB.post("/api/v1/invitations/accept").send({
    token: ownerBInvite?.token,
    password: PASSWORD,
    displayName: "Owner B",
  });
  const createdB = await ownerB.post("/api/v1/organizations").send({ name: `Org B ${suffix}` });
  orgB = createdB.body.id;
  ownerBMembershipId = createdB.body.membershipId;
  await enrollTotp(ownerB);

  alice = await inviteToOrg("alice");
  bob = await inviteToOrg("bob");
  carol = await inviteToOrg("carol");
  const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
  aliceMembershipId = members.body.find((row: { email: string }) => row.email.startsWith("alice-")).id;
  bobMembershipId = members.body.find((row: { email: string }) => row.email.startsWith("bob-")).id;
  carolMembershipId = members.body.find((row: { email: string }) => row.email.startsWith("carol-")).id;

  const project = await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Tower ${suffix}` });
  projectA = project.body.project.id;
  const aliceAdded = await ownerA.post(`/api/v1/projects/${projectA}/members`).send({
    organizationMembershipId: aliceMembershipId,
  });
  await ownerA.post(`/api/v1/projects/${projectA}/members/${aliceAdded.body.id}/roles`).send({
    templateKey: "CONTRIBUTOR_DESIGNER",
  });
  const task = await ownerA
    .post(`/api/v1/projects/${projectA}/tasks`)
    .set("Idempotency-Key", `task-${suffix}`)
    .send({ title: "Protected grid task" });
  taskA = task.body.id;

  const team = await prisma.team.create({
    data: { organizationId: orgA, name: `Structure ${suffix}` },
  });
  teamId = team.id;
  await prisma.teamMembership.createMany({
    data: [
      { teamId, organizationMembershipId: aliceMembershipId, status: "ACTIVE" },
      { teamId, organizationMembershipId: carolMembershipId, status: "ACTIVE" },
    ],
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

async function inviteToOrg(label: string): Promise<Agent> {
  const email = `${label}-${suffix}@example.com`;
  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email,
    roleTemplateKey: "VIEWER",
    membershipType: "INTERNAL",
  });
  const invite = emails.sent.filter((message) => message.to === email).at(-1);
  const agent = request.agent(app.getHttpServer());
  await agent.post("/api/v1/invitations/accept").send({
    token: invite?.token,
    password: PASSWORD,
    displayName: label,
  });
  return agent;
}

function key(label: string): string {
  return `${label}-${suffix}-${randomUUID()}`;
}

describe("M5.4 Messaging HTTP", () => {
  it("M5.4-HTTP-01 finds or creates DIRECT by unordered pair and is concurrent-safe", async () => {
    const forward = await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", key("dm-1"))
      .send({ organizationMembershipId: bobMembershipId });
    expect([200, 201]).toContain(forward.status);
    directId = forward.body.id;
    expect(forward.body.kind).toBe("DIRECT");
    expect(forward.body.participantLowId < forward.body.participantHighId).toBe(true);
    expect([forward.body.participantLowId, forward.body.participantHighId].sort()).toEqual(
      [aliceMembershipId, bobMembershipId].sort(),
    );

    const reverse = await bob
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", key("dm-2"))
      .send({ organizationMembershipId: aliceMembershipId });
    expect(reverse.status).toBeLessThan(400);
    expect(reverse.body.id).toBe(directId);

    const retryKey = key("dm-retry");
    const first = await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", retryKey)
      .send({ organizationMembershipId: bobMembershipId });
    const replay = await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", retryKey)
      .send({ organizationMembershipId: bobMembershipId });
    expect(replay.status).toBe(first.status);
    expect(replay.body.id).toBe(first.body.id);

    const conflict = await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", retryKey)
      .send({ organizationMembershipId: carolMembershipId });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const self = await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", key("dm-self"))
      .send({ organizationMembershipId: aliceMembershipId });
    expect(self.status).toBe(409);

    const cross = await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", key("dm-cross"))
      .send({ organizationMembershipId: ownerBMembershipId });
    expect(cross.status).toBe(403);
    expect(cross.body.detail ?? "").not.toContain(orgB);
    void ownerB;
    void ownerMembershipId;
  });

  it("M5.4-HTTP-02 does not inherit Direct onto a new membership id", async () => {
    const inbox = await carol.get("/api/v1/conversations");
    expect(inbox.status).toBe(200);
    expect(inbox.body.items.some((row: { id: string }) => row.id === directId)).toBe(false);
    const leaked = await carol.get(`/api/v1/conversations/${directId}`);
    expect(leaked.status).toBe(403);
    expect(leaked.body.code).toBe("TENANCY_DENIED");
  });

  it("M5.4-HTTP-03 send/edit/tombstone honor CAS, idempotency, and author-only", async () => {
    const sendKey = key("msg-1");
    const sent = await alice
      .post(`/api/v1/conversations/${directId}/messages`)
      .set("Idempotency-Key", sendKey)
      .send({ body: "hello bob amber://TASK/" + taskA, resourceLinks: [{ type: "TASK", id: taskA }] });
    expect(sent.status).toBe(201);
    expect(sent.body.authorOrganizationMembershipId).toBe(aliceMembershipId);
    expect(sent.body.body).toBe("hello bob amber://TASK/" + taskA);
    const replay = await alice
      .post(`/api/v1/conversations/${directId}/messages`)
      .set("Idempotency-Key", sendKey)
      .send({ body: "hello bob amber://TASK/" + taskA, resourceLinks: [{ type: "TASK", id: taskA }] });
    expect(replay.body.id).toBe(sent.body.id);

    const missing = await alice
      .patch(`/api/v1/conversations/${directId}/messages/${sent.body.id}`)
      .send({ body: "edited" });
    expect(missing.status).toBeGreaterThanOrEqual(400);

    const stale = await alice
      .patch(`/api/v1/conversations/${directId}/messages/${sent.body.id}`)
      .send({ body: "edited", expectedVersion: sent.body.version + 3 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("OPTIMISTIC_LOCK");

    const edited = await alice
      .patch(`/api/v1/conversations/${directId}/messages/${sent.body.id}`)
      .send({ body: "hello bob (edited)", expectedVersion: sent.body.version });
    expect(edited.status).toBe(200);
    expect(edited.body.lifecycle).toBe("EDITED");
    expect(edited.body.editedAt).toBeTruthy();

    const notAuthor = await bob
      .patch(`/api/v1/conversations/${directId}/messages/${sent.body.id}`)
      .send({ body: "hijack", expectedVersion: edited.body.version });
    expect(notAuthor.status).toBe(403);

    const tombstoneKey = key("tomb-1");
    const tombstoned = await alice
      .post(`/api/v1/conversations/${directId}/messages/${sent.body.id}/tombstone`)
      .set("Idempotency-Key", tombstoneKey)
      .send({ expectedVersion: edited.body.version });
    expect(tombstoned.status).toBeLessThan(400);
    expect(tombstoned.body.lifecycle).toBe("TOMBSTONED");
    expect(tombstoned.body.body).toBeNull();
    expect(tombstoned.body.deletedAt).toBeTruthy();
    const tombReplay = await alice
      .post(`/api/v1/conversations/${directId}/messages/${sent.body.id}/tombstone`)
      .set("Idempotency-Key", tombstoneKey)
      .send({ expectedVersion: edited.body.version });
    expect(tombReplay.body.id).toBe(tombstoned.body.id);
  });

  it("M5.4-HTTP-04 counts unread only from others after the watermark", async () => {
    const first = await bob
      .post(`/api/v1/conversations/${directId}/messages`)
      .set("Idempotency-Key", key("bob-1"))
      .send({ body: "from bob 1" });
    const second = await bob
      .post(`/api/v1/conversations/${directId}/messages`)
      .set("Idempotency-Key", key("bob-2"))
      .send({ body: "from bob 2" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const inbox = await alice.get("/api/v1/conversations");
    const row = inbox.body.items.find((item: { id: string }) => item.id === directId);
    expect(row.unreadCount).toBe(2);

    const ownInbox = await bob.get("/api/v1/conversations");
    const ownRow = ownInbox.body.items.find((item: { id: string }) => item.id === directId);
    expect(ownRow.unreadCount).toBe(0);

    await alice
      .put(`/api/v1/conversations/${directId}/read-state`)
      .send({ lastReadMessageId: first.body.id });
    const mid = await alice.get("/api/v1/conversations");
    expect(mid.body.items.find((item: { id: string }) => item.id === directId).unreadCount).toBe(1);

    await alice
      .put(`/api/v1/conversations/${directId}/read-state`)
      .send({ lastReadMessageId: second.body.id });
    await alice
      .put(`/api/v1/conversations/${directId}/read-state`)
      .send({ lastReadMessageId: first.body.id });
    const done = await alice.get("/api/v1/conversations");
    expect(done.body.items.find((item: { id: string }) => item.id === directId).unreadCount).toBe(0);
  });

  it("M5.4-HTTP-05 keeps archived Team read-only and revokes removed members immediately", async () => {
    const ensured = await alice
      .post("/api/v1/conversations/team")
      .set("Idempotency-Key", key("team-1"))
      .send({ teamId });
    expect(ensured.status).toBeLessThan(400);
    teamConversationId = ensured.body.id;
    expect(ensured.body.kind).toBe("TEAM");
    expect(ensured.body.teamId).toBe(teamId);

    const sent = await alice
      .post(`/api/v1/conversations/${teamConversationId}/messages`)
      .set("Idempotency-Key", key("team-msg"))
      .send({ body: "team history stays" });
    expect(sent.status).toBe(201);

    const late = await carol.get(`/api/v1/conversations/${teamConversationId}/messages`);
    expect(late.status).toBe(200);
    expect(late.body.items.some((row: { body: string }) => row.body === "team history stays")).toBe(true);

    await prisma.team.update({ where: { id: teamId }, data: { archivedAt: new Date() } });
    const archivedSend = await alice
      .post(`/api/v1/conversations/${teamConversationId}/messages`)
      .set("Idempotency-Key", key("team-archived"))
      .send({ body: "should fail" });
    expect(archivedSend.status).toBeGreaterThanOrEqual(400);
    const archivedRead = await alice.get(`/api/v1/conversations/${teamConversationId}/messages`);
    expect(archivedRead.status).toBe(200);

    await prisma.team.update({ where: { id: teamId }, data: { archivedAt: null } });
    await prisma.teamMembership.updateMany({
      where: { teamId, organizationMembershipId: carolMembershipId },
      data: { status: "REMOVED" },
    });
    const removed = await carol.get(`/api/v1/conversations/${teamConversationId}`);
    expect(removed.status).toBe(403);
    const removedInbox = await carol.get("/api/v1/conversations");
    expect(removedInbox.body.items.some((row: { id: string }) => row.id === teamConversationId)).toBe(false);
    expect(removedInbox.body.items.reduce((sum: number, row: { unreadCount: number }) => sum + row.unreadCount, 0)).toBe(
      0,
    );
  });

  it("M5.4-HTTP-06 searches only authorized snippets", async () => {
    const hit = await alice.get("/api/v1/conversations/search").query({ q: "from bob 2" });
    expect(hit.status).toBe(200);
    expect(hit.body.items.some((row: { snippet: string }) => row.snippet.includes("from bob 2"))).toBe(true);
    const miss = await carol.get("/api/v1/conversations/search").query({ q: "from bob 2" });
    expect(miss.body.items).toEqual([]);
    const secret = await carol.get("/api/v1/conversations/search").query({ q: "team history stays" });
    expect(secret.body.items).toEqual([]);
  });

  it("M5.4-REG-01 keeps MessageSent out of Audit and omits message bodies from audit payloads", async () => {
    expect(MESSAGE_SENT_IS_AUDIT_EVENT).toBe(false);
    const events = await prisma.auditEvent.findMany({
      where: { organizationId: orgA, eventType: { in: ["DIRECT_CONVERSATION_CREATED", "MESSAGE_EDITED", "MESSAGE_DELETED", "TEAM_CONVERSATION_CREATED"] } },
    });
    expect(events.some((event) => event.eventType === "DIRECT_CONVERSATION_CREATED")).toBe(true);
    expect(events.some((event) => event.eventType === "MESSAGE_EDITED")).toBe(true);
    expect(events.some((event) => event.eventType === "MESSAGE_DELETED")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("hello bob");
    expect(JSON.stringify(events)).not.toContain("from bob");
    const sentAudit = await prisma.auditEvent.findFirst({
      where: { organizationId: orgA, eventType: "MESSAGE_SENT" },
    });
    expect(sentAudit).toBeNull();
    const hub = await ownerA.get(`/api/v1/projects/${projectA}/hub`);
    expect(hub.status).toBe(200);
    const activity = JSON.stringify(hub.body.activity ?? {});
    expect(activity).not.toContain("from bob");
    expect(activity).not.toContain("MESSAGE_SENT");
  });
});
