import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "../integration/app";
import { enrollTotp } from "../integration/mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "../integration/postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m54adv-${Date.now()}`;

type Agent = ReturnType<typeof request.agent>;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let orgA: string;
let orgB: string;
let projectA: string;
let taskA: string;
let ownerA: Agent;
let ownerB: Agent;
let alice: Agent;
let bob: Agent;
let aliceMembershipId: string;
let bobMembershipId: string;
let ownerBMembershipId: string;
let directId: string;
let emails: EmailAdapter;

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
    email: `admin-a-${suffix}@example.com`,
    password: PASSWORD,
    displayName: "Admin A",
  });
  orgA = (await ownerA.post("/api/v1/organizations").send({ name: `Adv Org A ${suffix}` })).body.id;
  await enrollTotp(ownerA);

  ownerB = request.agent(app.getHttpServer());
  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email: `admin-b-${suffix}@example.com`,
    roleTemplateKey: "VIEWER",
  });
  const ownerBInvite = emails.sent.filter((message) => message.to === `admin-b-${suffix}@example.com`).at(-1);
  await ownerB.post("/api/v1/invitations/accept").send({
    token: ownerBInvite?.token,
    password: PASSWORD,
    displayName: "Admin B",
  });
  orgB = (await ownerB.post("/api/v1/organizations").send({ name: `Adv Org B ${suffix}` })).body.id;
  ownerBMembershipId = (
    await prisma.organizationMembership.findFirstOrThrow({
      where: { organizationId: orgB, user: { email: `admin-b-${suffix}@example.com` } },
    })
  ).id;
  await enrollTotp(ownerB);

  alice = await invite("alice");
  bob = await invite("bob");
  const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
  aliceMembershipId = members.body.find((row: { email: string }) => row.email.startsWith("alice-")).id;
  bobMembershipId = members.body.find((row: { email: string }) => row.email.startsWith("bob-")).id;

  projectA = (await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Adv Tower ${suffix}` })).body
    .project.id;
  const added = await ownerA.post(`/api/v1/projects/${projectA}/members`).send({
    organizationMembershipId: aliceMembershipId,
  });
  await ownerA
    .post(`/api/v1/projects/${projectA}/members/${added.body.id}/roles`)
    .send({ templateKey: "CONTRIBUTOR_DESIGNER" });
  taskA = (
    await ownerA
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `adv-task-${suffix}`)
      .send({ title: "Secret schedule title" })
  ).body.id;

  directId = (
    await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", `adv-dm-${suffix}`)
      .send({ organizationMembershipId: bobMembershipId })
  ).body.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

async function invite(label: string): Promise<Agent> {
  const email = `${label}-${suffix}@example.com`;
  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email,
    roleTemplateKey: "VIEWER",
    membershipType: "INTERNAL",
  });
  const inviteRow = emails.sent.filter((message) => message.to === email).at(-1);
  const agent = request.agent(app.getHttpServer());
  await agent.post("/api/v1/invitations/accept").send({
    token: inviteRow?.token,
    password: PASSWORD,
    displayName: label,
  });
  return agent;
}

describe("M5.4 Messaging ADV", () => {
  it("M5.4-ADV-01 denies Org Admin without participation", async () => {
    const inbox = await ownerA.get("/api/v1/conversations");
    expect(inbox.status).toBe(200);
    expect(inbox.body.items.some((row: { id: string }) => row.id === directId)).toBe(false);
    const get = await ownerA.get(`/api/v1/conversations/${directId}`);
    expect(get.status).toBe(403);
    const messages = await ownerA.get(`/api/v1/conversations/${directId}/messages`);
    expect(messages.status).toBe(403);
    const send = await ownerA
      .post(`/api/v1/conversations/${directId}/messages`)
      .set("Idempotency-Key", `admin-send-${randomUUID()}`)
      .send({ body: "admin peek" });
    expect(send.status).toBe(403);
  });

  it("M5.4-ADV-02 omits inaccessible conversations and unread after revocation", async () => {
    await bob
      .post(`/api/v1/conversations/${directId}/messages`)
      .set("Idempotency-Key", `bob-secret-${randomUUID()}`)
      .send({ body: "secret-for-alice-only" });

    await prisma.organizationMembership.update({
      where: { id: bobMembershipId },
      data: { status: "REMOVED" },
    });

    const stillOpen = await bob.get("/api/v1/conversations");
    expect(stillOpen.status).toBe(403);
    const stillGet = await bob.get(`/api/v1/conversations/${directId}`);
    expect(stillGet.status).toBe(403);
    const stillSearch = await bob.get("/api/v1/conversations/search").query({ q: "secret-for-alice-only" });
    expect(stillSearch.status).toBe(403);

    const adminInbox = await ownerA.get("/api/v1/conversations");
    expect(JSON.stringify(adminInbox.body)).not.toContain(directId);
    expect(JSON.stringify(adminInbox.body)).not.toContain("secret-for-alice-only");
    expect(
      (adminInbox.body.items as Array<{ unreadCount: number }>).reduce((sum, row) => sum + row.unreadCount, 0),
    ).toBe(0);

    await prisma.organizationMembership.update({
      where: { id: bobMembershipId },
      data: { status: "ACTIVE" },
    });
  });

  it("M5.4-ADV-03 re-authorizes deep-link previews and suppresses protected metadata", async () => {
    const sent = await alice
      .post(`/api/v1/conversations/${directId}/messages`)
      .set("Idempotency-Key", `preview-${randomUUID()}`)
      .send({
        body: `please review amber://TASK/${taskA}`,
        resourceLinks: [{ type: "TASK", id: taskA }],
      });
    expect(sent.status).toBe(201);
    const alicePreview = sent.body.resourcePreviews.find((row: { id: string }) => row.id === taskA);
    expect(alicePreview.authorized).toBe(true);
    expect(alicePreview.title).toBe("Secret schedule title");
    expect(alicePreview.projectId).toBe(projectA);

    const bobPage = await bob.get(`/api/v1/conversations/${directId}/messages`);
    const bobMessage = bobPage.body.items.find((row: { id: string }) => row.id === sent.body.id);
    const bobPreview = bobMessage.resourcePreviews.find((row: { id: string }) => row.id === taskA);
    expect(bobPreview.authorized).toBe(false);
    expect(bobPreview.title).toBeUndefined();
    expect(bobPreview.projectId).toBeUndefined();
    expect(JSON.stringify(bobPreview)).not.toContain("Secret schedule title");
    expect(JSON.stringify(bobPreview)).not.toContain(projectA);

    const cross = await alice
      .post("/api/v1/conversations/direct")
      .set("Idempotency-Key", `cross-${randomUUID()}`)
      .send({ organizationMembershipId: ownerBMembershipId });
    expect(cross.status).toBe(403);
    const foreign = await alice.get(`/api/v1/conversations/${randomUUID()}`);
    expect(foreign.status).toBe(403);
    void orgB;
  });

  it("direct candidates require an ACTIVE Organization membership inside an authorized project", async () => {
    const added = await ownerA
      .post(`/api/v1/projects/${projectA}/members`)
      .send({ organizationMembershipId: bobMembershipId });
    expect(added.status).toBeLessThan(300);
    const before = await alice.get("/api/v1/conversations/direct-candidates");
    expect(before.status).toBe(200);
    const beforeIds = (before.body.items as Array<{ id: string; displayName: string }>).map((row) => row.id);
    expect(beforeIds).toContain(bobMembershipId);
    expect(beforeIds).not.toContain(aliceMembershipId);
    expect(beforeIds).not.toContain(ownerBMembershipId);
    expect(JSON.stringify(before.body)).not.toContain("@");
    await prisma.organizationMembership.update({ where: { id: bobMembershipId }, data: { status: "SUSPENDED" } });
    const suspended = await alice.get("/api/v1/conversations/direct-candidates");
    expect((suspended.body.items as Array<{ id: string }>).map((row) => row.id)).not.toContain(bobMembershipId);
    await prisma.organizationMembership.update({ where: { id: bobMembershipId }, data: { status: "REMOVED" } });
    const removed = await alice.get("/api/v1/conversations/direct-candidates");
    expect((removed.body.items as Array<{ id: string }>).map((row) => row.id)).not.toContain(bobMembershipId);
    await prisma.organizationMembership.update({ where: { id: bobMembershipId }, data: { status: "ACTIVE" } });
  });
});
