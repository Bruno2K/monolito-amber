import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `f04-${Date.now()}`;

let db: TestDb;
let app: INestApplication;
let emails: EmailAdapter;
let orgA: string;
let orgB: string;
let ownerA: ReturnType<typeof request.agent>;
let ownerB: ReturnType<typeof request.agent>;

beforeAll(async () => {
  db = await startTestDatabase();
  migrate(db.url);
  seed(db.url);
  app = await createTestApp(db.url);
  emails = app.get(EmailAdapter);

  ownerA = request.agent(app.getHttpServer());
  await ownerA.post("/api/v1/auth/register").send({
    email: `a-${suffix}@example.com`,
    password: PASSWORD,
    displayName: "Owner A",
  });
  const createdA = await ownerA.post("/api/v1/organizations").send({ name: `Org A ${suffix}` });
  orgA = createdA.body.id;
  await enrollTotp(ownerA);

  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email: `b-${suffix}@example.com`,
    roleTemplateKey: "VIEWER",
  });
  const ownerBInvite = emails.sent.filter((message) => message.to === `b-${suffix}@example.com`).at(-1);
  ownerB = request.agent(app.getHttpServer());
  await ownerB.post("/api/v1/invitations/accept").send({
    token: ownerBInvite?.token,
    password: PASSWORD,
    displayName: "Owner B",
  });
  const createdB = await ownerB.post("/api/v1/organizations").send({ name: `Org B ${suffix}` });
  orgB = createdB.body.id;
  await enrollTotp(ownerB);
}, 180_000);

afterAll(async () => {
  await app?.close();
  if (db?.stop) {
    await db.stop();
  }
});

describe("F-04 tenant isolation (HTTP, fail closed)", () => {
  it("denies Org A from reading Org B by path", async () => {
    const response = await ownerA.get(`/api/v1/organizations/${orgB}`);
    expect(response.status).toBe(403);
  });

  it("denies a forged organizationId on org-switch", async () => {
    const response = await ownerA.post("/api/v1/auth/active-organization").send({ organizationId: orgB });
    expect(response.status).toBe(403);
    const session = await ownerA.get("/api/v1/auth/session");
    expect(session.body.activeOrganizationId).toBe(orgA);
  });

  it("denies unauthenticated access by default", async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/organizations/${orgA}/members`);
    expect(response.status).toBe(403);
  });

  it("denies a suspended member from switching back into the Organization", async () => {
    await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `suspended-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
    });
    const invite = emails.sent.filter((message) => message.to === `suspended-${suffix}@example.com`).at(-1);
    const guest = request.agent(app.getHttpServer());
    const accepted = await guest.post("/api/v1/invitations/accept").send({
      token: invite?.token,
      password: PASSWORD,
      displayName: "Suspended",
    });
    const membershipId = (
      await ownerA.get(`/api/v1/organizations/${orgA}/members`)
    ).body.find((row: { email: string }) => row.email === `suspended-${suffix}@example.com`).id;
    await ownerA.patch(`/api/v1/organizations/${orgA}/members/${membershipId}`).send({ status: "SUSPENDED" });
    const revoked = await guest.get(`/api/v1/organizations/${orgA}`);
    expect(revoked.status).toBe(401);
    expect(revoked.body.code).toBe("SESSION_REVOKED");
    const relogin = request.agent(app.getHttpServer());
    await relogin.post("/api/v1/auth/login").send({
      email: `suspended-${suffix}@example.com`,
      password: PASSWORD,
    });
    const denied = await relogin.post("/api/v1/auth/active-organization").send({ organizationId: orgA });
    expect(denied.status).toBe(403);
    expect(accepted.status).toBeLessThan(400);
  });

  it("denies a removed member and an EXTERNAL user from the org directory", async () => {
    await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `ext-${suffix}@example.com`,
      roleTemplateKey: "EXTERNAL_CONTRIBUTOR",
      membershipType: "EXTERNAL",
    });
    const invite = emails.sent.filter((message) => message.to === `ext-${suffix}@example.com`).at(-1);
    const external = request.agent(app.getHttpServer());
    await external.post("/api/v1/invitations/accept").send({
      token: invite?.token,
      password: PASSWORD,
      displayName: "External",
    });
    const directory = await external.get(`/api/v1/organizations/${orgA}/members`);
    expect(directory.status).toBe(403);

    await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `removed-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
    });
    const removedInvite = emails.sent.filter((message) => message.to === `removed-${suffix}@example.com`).at(-1);
    const removedAgent = request.agent(app.getHttpServer());
    await removedAgent.post("/api/v1/invitations/accept").send({
      token: removedInvite?.token,
      password: PASSWORD,
      displayName: "Removed",
    });
    const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
    const membershipId = members.body.find((row: { email: string }) => row.email === `removed-${suffix}@example.com`).id;
    await ownerA.patch(`/api/v1/organizations/${orgA}/members/${membershipId}`).send({ status: "REMOVED" });
    const immediatelyDenied = await removedAgent.get(`/api/v1/organizations/${orgA}`);
    expect(immediatelyDenied.status).toBe(401);
    expect(immediatelyDenied.body.code).toBe("SESSION_REVOKED");
    const relogin = request.agent(app.getHttpServer());
    await relogin.post("/api/v1/auth/login").send({
      email: `removed-${suffix}@example.com`,
      password: PASSWORD,
    });
    const denied = await relogin.get(`/api/v1/organizations/${orgA}`);
    expect(denied.status).toBe(403);
  });

  it("does not let Org B manage Org A members", async () => {
    const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
    const victim = members.body[0];
    const denied = await ownerB
      .patch(`/api/v1/organizations/${orgA}/members/${victim.id}`)
      .send({ status: "SUSPENDED" });
    expect(denied.status).toBe(403);
  });
});
