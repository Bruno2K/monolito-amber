import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_TEMPLATES } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `${Date.now()}`;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;

beforeAll(async () => {
  db = await startTestDatabase();
  migrate(db.url);
  seed(db.url);
  app = await createTestApp(db.url);
  emails = app.get(EmailAdapter);
  prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await prisma.$connect();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

describe("PF-1.1 identity integration", () => {
  it("seeds the closed 0.2A catalog and nine templates", async () => {
    const permissions = await request(app.getHttpServer()).get("/api/v1/catalog/permissions");
    expect(permissions.status).toBe(200);
    expect(permissions.body.permissions).not.toContain("gate.override");
    expect(permissions.body.permissions.sort()).toEqual([...PERMISSIONS].sort());
    const templates = await request(app.getHttpServer()).get("/api/v1/catalog/role-templates");
    expect(templates.body.templates).toHaveLength(ROLE_TEMPLATES.length);
  });

  it("registers a User with a separate EMAIL_PASSWORD AuthenticationIdentity", async () => {
    const email = `owner-${suffix}@example.com`;
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD, displayName: "Owner" });
    expect(response.status).toBe(201);
    expect(response.headers["set-cookie"]).toBeDefined();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { authenticationIdentities: { include: { passwordCredential: true } } },
    });
    expect(user?.authenticationIdentities).toHaveLength(1);
    expect(user?.authenticationIdentities[0]?.provider).toBe("EMAIL_PASSWORD");
    expect(user?.authenticationIdentities[0]?.passwordCredential?.algorithm).toBe("argon2id");
    expect(user?.authenticationIdentities[0]?.passwordCredential?.hash).toMatch(/^\$argon2id\$/);
  });

  it("logs in, creates an org, and audits without secrets", async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post("/api/v1/auth/login").send({
      email: `owner-${suffix}@example.com`,
      password: PASSWORD,
    });
    expect([200, 201]).toContain(login.status);
    expect(login.body.status).toBe("authenticated");
    const created = await agent.post("/api/v1/organizations").send({ name: `Atlas ${suffix}` });
    expect([200, 201]).toContain(created.status);
    const session = await agent.get("/api/v1/auth/session");
    expect(session.body.activeOrganizationId).toBe(created.body.id);
    expect(session.body.permissions).toContain("organization.manage_members");
    const events = await prisma.auditEvent.findMany({ where: { actorUserId: session.body.userId } });
    expect(events.some((event) => event.eventType === "ORG_CREATED")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
    expect(JSON.stringify(events)).not.toMatch(/\$argon2id\$/);
  });

  it("invites a member, accepts, and persists membership ACTIVE", async () => {
    const owner = request.agent(app.getHttpServer());
    await owner.post("/api/v1/auth/login").send({ email: `owner-${suffix}@example.com`, password: PASSWORD });
    const orgs = await owner.get("/api/v1/organizations");
    const orgId = (orgs.body as Array<{ active: boolean; id: string }>).find((row) => row.active)?.id;
    expect(orgId).toBeTruthy();
    const invited = await owner.post(`/api/v1/organizations/${orgId}/invitations`).send({
      email: `member-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
      membershipType: "INTERNAL",
    });
    expect([200, 201]).toContain(invited.status);
    const invite = emails.sent.filter((message) => message.template === "organization-invite").at(-1);
    expect(invite?.token).toBeTruthy();
    const accept = await request(app.getHttpServer()).post("/api/v1/invitations/accept").send({
      token: invite?.token,
      password: PASSWORD,
      displayName: "Member",
    });
    expect([200, 201]).toContain(accept.status);
    expect(accept.body.activeOrganizationId).toBe(orgId);
    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: orgId, user: { email: `member-${suffix}@example.com` } },
    });
    expect(membership?.status).toBe("ACTIVE");
  });

  it("resets a password and revokes existing sessions", async () => {
    const unknown = await request(app.getHttpServer())
      .post("/api/v1/auth/password/forgot")
      .send({ email: `nobody-${suffix}@example.com` });
    const known = await request(app.getHttpServer())
      .post("/api/v1/auth/password/forgot")
      .send({ email: `member-${suffix}@example.com` });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    const reset = emails.sent.filter((message) => message.template === "password-reset").at(-1);
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: `member-${suffix}@example.com`,
      password: PASSWORD,
    });
    const cookie = Array.isArray(login.headers["set-cookie"])
      ? login.headers["set-cookie"].map((part) => String(part).split(";")[0]).join("; ")
      : "";
    await request(app.getHttpServer()).post("/api/v1/auth/password/reset").send({
      token: reset?.token,
      password: "new-password-12",
    });
    const reused = await request(app.getHttpServer()).get("/api/v1/auth/session").set("Cookie", cookie);
    expect(reused.body.authenticated).toBe(false);
    const oldLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: `member-${suffix}@example.com`,
      password: PASSWORD,
    });
    expect(oldLogin.status).toBe(401);
  });
});
