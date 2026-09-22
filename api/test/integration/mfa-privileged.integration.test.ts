import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `mfa-${Date.now()}`;

let db: TestDb;
let app: INestApplication;

beforeAll(async () => {
  db = await startTestDatabase();
  migrate(db.url);
  seed(db.url);
  app = await createTestApp(db.url);
}, 180_000);

afterAll(async () => {
  await app?.close();
  if (db?.stop) {
    await db.stop();
  }
});

describe("PF-1.1R mandatory MFA fail-closed", () => {
  it("denies privileged org-admin ops until TOTP is enrolled; enroll and logout remain available", async () => {
    const agent = request.agent(app.getHttpServer());
    const registered = await agent.post("/api/v1/auth/register").send({
      email: `admin-${suffix}@example.com`,
      password: PASSWORD,
      displayName: "MFA Admin",
    });
    expect(registered.status).toBe(201);

    const created = await agent.post("/api/v1/organizations").send({ name: `MFA Org ${suffix}` });
    expect(created.status).toBeLessThan(400);
    const orgId = created.body.id as string;

    const denied = await agent.post(`/api/v1/organizations/${orgId}/invitations`).send({
      email: `guest-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
    });
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe("MFA_REQUIRED");

    const session = await agent.get("/api/v1/auth/session");
    expect(session.status).toBe(200);
    expect(session.body.authenticated).toBe(true);
    expect(session.body.mfa.required).toBe(true);
    expect(session.body.mfa.enrolled).toBe(false);
    expect(session.body.permissions).not.toContain("organization.manage_members");

    const startEnroll = await agent.post("/api/v1/auth/mfa/enroll");
    expect(startEnroll.status).toBeLessThan(400);
    expect(startEnroll.body.otpauth).toContain("otpauth://");

    const logout = await agent.post("/api/v1/auth/logout");
    expect(logout.status).toBeLessThan(400);

    const again = request.agent(app.getHttpServer());
    const login = await again.post("/api/v1/auth/login").send({
      email: `admin-${suffix}@example.com`,
      password: PASSWORD,
    });
    expect(login.body.status).toBe("mfa_enrollment_required");
    await again.post("/api/v1/auth/active-organization").send({ organizationId: orgId });
    await enrollTotp(again);

    const invited = await again.post(`/api/v1/organizations/${orgId}/invitations`).send({
      email: `guest-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
    });
    expect(invited.status).toBeLessThan(400);
  });
});
