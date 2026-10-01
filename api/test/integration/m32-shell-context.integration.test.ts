import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp, loginWithOptionalMfa } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m32-${Date.now()}`;
const SPOOFED = "99999999-9999-4999-8999-999999999999";

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;
let ownerSecret: string;
let orgA: string;
let orgB: string;
let projectA: string;
let projectB: string;
let owner: ReturnType<typeof request.agent>;

beforeAll(async () => {
  db = await startTestDatabase();
  migrate(db.url);
  seed(db.url);
  app = await createTestApp(db.url);
  emails = app.get(EmailAdapter);
  prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await prisma.$connect();

  owner = request.agent(app.getHttpServer());
  await owner.post("/api/v1/auth/register").send({
    email: `owner-${suffix}@example.com`,
    password: PASSWORD,
    displayName: "Shell Owner",
  });
  const createdA = await owner.post("/api/v1/organizations").send({ name: `Org A ${suffix}` });
  orgA = createdA.body.id;
  ownerSecret = (await enrollTotp(owner)).secret;
  const createdB = await owner.post("/api/v1/organizations").send({ name: `Org B ${suffix}` });
  orgB = createdB.body.id;
  await owner.post("/api/v1/auth/active-organization").send({ organizationId: orgA });
  const projectCreated = await owner.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Tower A ${suffix}` });
  projectA = projectCreated.body.project.id;
  await owner.post("/api/v1/auth/active-organization").send({ organizationId: orgB });
  const projectCreatedB = await owner.post(`/api/v1/organizations/${orgB}/projects`).send({
    name: `Tower B ${suffix}`,
  });
  projectB = projectCreatedB.body.project.id;
  await owner.post("/api/v1/auth/active-organization").send({ organizationId: orgA });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

describe("M3.2 session / org / project context", () => {
  it("loads identity from the session-bound Organization and never from a client orgId", async () => {
    const session = await owner.get("/api/v1/auth/session");
    expect(session.status).toBe(200);
    expect(session.body.authenticated).toBe(true);
    expect(session.body.activeOrganizationId).toBe(orgA);
    expect(session.body.activeOrganizationId).not.toBe(orgB);
    const listed = await owner.get("/api/v1/projects");
    expect(listed.status).toBe(200);
    const ids = (listed.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(projectA);
    expect(ids).not.toContain(projectB);
  });

  it("revalidates Project IDs server-side; URL and spoofed identifiers are not authority", async () => {
    const allowed = await owner.get(`/api/v1/projects/${projectA}`);
    expect(allowed.status).toBeLessThan(400);
    expect(allowed.body.permissions).toContain("project.read");
    const spoofed = await owner.get(`/api/v1/projects/${SPOOFED}`);
    expect(spoofed.status).toBe(403);
    const crossOrg = await owner.get(`/api/v1/projects/${projectB}`);
    expect(crossOrg.status).toBe(403);
    const spoofedSession = await owner.get(`/api/v1/auth/session?projectId=${SPOOFED}`);
    expect(spoofedSession.status).toBe(403);
  });

  it("invalidates prior Project context after Organization switch", async () => {
    const switched = await owner.post("/api/v1/auth/active-organization").send({ organizationId: orgB });
    expect(switched.status).toBeLessThan(400);
    const session = await owner.get("/api/v1/auth/session");
    expect(session.body.activeOrganizationId).toBe(orgB);
    const listed = await owner.get("/api/v1/projects");
    const ids = (listed.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(projectB);
    expect(ids).not.toContain(projectA);
    const prior = await owner.get(`/api/v1/projects/${projectA}`);
    expect(prior.status).toBe(403);
  });

  it("denies a removed ProjectMembership immediately", async () => {
    await owner.post("/api/v1/auth/active-organization").send({ organizationId: orgA });
    await owner.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `viewer-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
      membershipType: "INTERNAL",
    });
    const invite = emails.sent.filter((message) => message.to === `viewer-${suffix}@example.com`).at(-1);
    const viewer = request.agent(app.getHttpServer());
    await viewer.post("/api/v1/invitations/accept").send({
      token: invite?.token,
      password: PASSWORD,
      displayName: "Viewer",
    });
    const orgMembers = await owner.get(`/api/v1/organizations/${orgA}/members`);
    const memberRow = (orgMembers.body as Array<{ email: string; id: string }>).find(
      (row) => row.email === `viewer-${suffix}@example.com`,
    );
    const added = await owner
      .post(`/api/v1/projects/${projectA}/members`)
      .send({ organizationMembershipId: memberRow?.id });
    expect(added.status).toBeLessThan(400);
    await owner.post(`/api/v1/projects/${projectA}/members/${added.body.id}/roles`).send({ templateKey: "VIEWER" });
    const allowed = await viewer.get(`/api/v1/projects/${projectA}`);
    expect(allowed.status).toBe(200);
    const removed = await owner
      .patch(`/api/v1/projects/${projectA}/members/${added.body.id}`)
      .send({ status: "REMOVED" });
    expect(removed.status).toBeLessThan(400);
    const denied = await viewer.get(`/api/v1/projects/${projectA}`);
    expect(denied.status).toBe(403);
  });

  it("keeps login available after logout (session expiry/revocation flow)", async () => {
    const logout = await owner.post("/api/v1/auth/logout");
    expect(logout.status).toBeLessThan(400);
    const session = await owner.get("/api/v1/auth/session");
    expect(session.body.authenticated).toBe(false);
    await loginWithOptionalMfa(owner, {
      email: `owner-${suffix}@example.com`,
      password: PASSWORD,
      secret: ownerSecret,
    });
    const restored = await owner.get("/api/v1/auth/session");
    expect(restored.body.authenticated).toBe(true);
  });
});
