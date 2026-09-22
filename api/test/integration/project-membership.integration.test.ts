import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLE_TEMPLATES } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp, loginWithOptionalMfa } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `pf12-${Date.now()}`;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;
let ownerSecret: string;
let ownerBSecret: string;
let orgA: string;
let orgB: string;
let project1: string;
let project2: string;
let ownerA: ReturnType<typeof request.agent>;
let ownerB: ReturnType<typeof request.agent>;

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
  ownerSecret = (await enrollTotp(ownerA)).secret;

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
  ownerBSecret = (await enrollTotp(ownerB)).secret;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

describe("PF-1.2 Project Membership / contextual RBAC", () => {
  it("instantiates org-owned RoleDefinitions from templates and never binds global templates", async () => {
    const roles = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
    expect(roles.status).toBe(200);
    expect(roles.body).toHaveLength(ROLE_TEMPLATES.length);
    expect(roles.body.every((role: { organizationId?: string; isSystemTemplate: boolean; sourceTemplateKey: string }) =>
      role.isSystemTemplate === false && Boolean(role.sourceTemplateKey),
    )).toBe(true);
    const bindings = await prisma.roleBinding.findMany({
      include: { role: true, membership: true },
    });
    const orgABindings = bindings.filter((row) => row.membership.organizationId === orgA);
    expect(orgABindings.length).toBeGreaterThan(0);
    expect(orgABindings.every((row) => row.role.organizationId === orgA && row.role.isSystemTemplate === false)).toBe(
      true,
    );
    const templates = await prisma.roleDefinition.findMany({ where: { organizationId: null } });
    expect(templates).toHaveLength(ROLE_TEMPLATES.length);
    expect(templates.every((row) => row.isSystemTemplate)).toBe(true);
  });

  it("lets two Organizations diverge from the same template origin", async () => {
    const rolesA = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
    const rolesB = await ownerB.get(`/api/v1/organizations/${orgB}/roles`);
    const viewerA = rolesA.body.find((role: { templateKey: string }) => role.templateKey === "VIEWER");
    const viewerB = rolesB.body.find((role: { templateKey: string }) => role.templateKey === "VIEWER");
    expect(viewerA.permissions).toEqual(expect.arrayContaining(["project.read", "document.read"]));
    const patched = await ownerB.patch(`/api/v1/organizations/${orgB}/roles/${viewerB.id}`).send({
      name: "Viewer (constrained)",
      permissions: ["project.read"],
    });
    expect(patched.status).toBeLessThan(400);
    expect(patched.body.permissions).toEqual(["project.read"]);
    const stillA = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
    const viewerAAfter = stillA.body.find((role: { templateKey: string }) => role.templateKey === "VIEWER");
    expect(viewerAAfter.permissions).toEqual(expect.arrayContaining(["project.read", "document.read"]));
    expect(viewerAAfter.name).not.toBe("Viewer (constrained)");
  });

  it("creates a Project with explicit coordinator membership and no implicit org-wide project.read", async () => {
    const created = await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Tower ${suffix}` });
    expect(created.status).toBeLessThan(400);
    project1 = created.body.project.id;
    const orgSession = await ownerA.get("/api/v1/auth/session");
    expect(orgSession.body.permissions).toContain("project.create");
    expect(orgSession.body.permissions).not.toContain("project.read");
    const projectSession = await ownerA.get(`/api/v1/auth/session?projectId=${project1}`);
    expect(projectSession.body.permissions).toContain("project.read");
    expect(projectSession.body.permissions).toContain("project.assign_roles");
    const read = await ownerA.get(`/api/v1/projects/${project1}`);
    expect(read.status).toBe(200);
    expect(read.body.permissions).toContain("project.manage_members");
  });

  it("requires ACTIVE ProjectMembership + assignment; union stays inside the selected Project", async () => {
    await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `member-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
      membershipType: "INTERNAL",
    });
    const invite = emails.sent.filter((message) => message.to === `member-${suffix}@example.com`).at(-1);
    const member = request.agent(app.getHttpServer());
    await member.post("/api/v1/invitations/accept").send({
      token: invite?.token,
      password: PASSWORD,
      displayName: "Member",
    });
    const deniedBeforeMembership = await member.get(`/api/v1/projects/${project1}`);
    expect(deniedBeforeMembership.status).toBe(403);

    const orgMembers = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
    const memberRow = orgMembers.body.find((row: { email: string }) => row.email === `member-${suffix}@example.com`);
    const added = await ownerA
      .post(`/api/v1/projects/${project1}/members`)
      .send({ organizationMembershipId: memberRow.id });
    expect(added.status).toBeLessThan(400);
    const deniedBeforeRole = await member.get(`/api/v1/projects/${project1}`);
    expect(deniedBeforeRole.status).toBe(403);

    const assigned = await ownerA
      .post(`/api/v1/projects/${project1}/members/${added.body.id}/roles`)
      .send({ templateKey: "VIEWER" });
    expect(assigned.status).toBeLessThan(400);
    const allowed = await member.get(`/api/v1/projects/${project1}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.permissions).toContain("project.read");
    expect(allowed.body.permissions).not.toContain("project.assign_roles");

    const second = await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Plant ${suffix}` });
    project2 = second.body.project.id;
    const crossProject = await member.get(`/api/v1/projects/${project2}`);
    expect(crossProject.status).toBe(403);

    await ownerA
      .post(`/api/v1/projects/${project1}/members/${added.body.id}/roles`)
      .send({ templateKey: "CONTRIBUTOR_DESIGNER" });
    const unioned = await member.get(`/api/v1/projects/${project1}`);
    expect(unioned.body.permissions).toEqual(expect.arrayContaining(["project.read", "revision.create"]));
    const stillDeniedP2 = await member.get(`/api/v1/projects/${project2}`);
    expect(stillDeniedP2.status).toBe(403);
  });

  it("denies forged path/body projectId and other-org projects", async () => {
    const forged = randomUUID();
    const forgedPath = await ownerA.get(`/api/v1/projects/${forged}`);
    expect(forgedPath.status).toBe(403);
    const sessionForged = await ownerA.get(`/api/v1/auth/session?projectId=${forged}`);
    expect(sessionForged.status).toBe(403);
    const createdB = await ownerB.post(`/api/v1/organizations/${orgB}/projects`).send({ name: `Other ${suffix}` });
    expect(createdB.status).toBeLessThan(400);
    const otherProject = createdB.body.project.id;
    const crossOrg = await ownerA.get(`/api/v1/projects/${otherProject}`);
    expect(crossOrg.status).toBe(403);
    const orgBMembers = await ownerB.get(`/api/v1/organizations/${orgB}/members`);
    const foreignMember = orgBMembers.body[0];
    const spoofBody = await ownerA
      .post(`/api/v1/projects/${project1}/members`)
      .send({ organizationMembershipId: foreignMember.id });
    expect(spoofBody.status).toBe(403);
  });

  it("enforces coordinator limits and no self-escalation on project.assign_roles", async () => {
    await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `coord-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
    });
    const invite = emails.sent.filter((message) => message.to === `coord-${suffix}@example.com`).at(-1);
    const coord = request.agent(app.getHttpServer());
    await coord.post("/api/v1/invitations/accept").send({
      token: invite?.token,
      password: PASSWORD,
      displayName: "Coordinator",
    });
    const orgMembers = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
    const coordOrg = orgMembers.body.find((row: { email: string }) => row.email === `coord-${suffix}@example.com`);
    const added = await ownerA
      .post(`/api/v1/projects/${project1}/members`)
      .send({ organizationMembershipId: coordOrg.id });
    await ownerA
      .post(`/api/v1/projects/${project1}/members/${added.body.id}/roles`)
      .send({ templateKey: "PROJECT_COORDINATOR" });

    const inviteDenied = await coord.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `nope-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
    });
    expect(inviteDenied.status).toBe(403);

    const roles = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
    const viewer = roles.body.find((role: { templateKey: string }) => role.templateKey === "VIEWER");
    const rolePatchDenied = await coord.patch(`/api/v1/organizations/${orgA}/roles/${viewer.id}`).send({
      permissions: ["project.read", "project.assign_roles"],
    });
    expect(rolePatchDenied.status).toBe(403);

    const selfEscalate = await coord
      .post(`/api/v1/projects/${project1}/members/${added.body.id}/roles`)
      .send({ templateKey: "GOVERNANCE_APPROVER" });
    expect(selfEscalate.status).toBe(403);
    expect(selfEscalate.body.code).toBe("SOD_VIOLATION");

    const globalTemplate = await prisma.roleDefinition.findFirst({
      where: { organizationId: null, templateKey: "VIEWER" },
    });
    const globalDenied = await coord
      .post(`/api/v1/projects/${project1}/members/${added.body.id}/roles`)
      .send({ roleId: globalTemplate?.id });
    expect(globalDenied.status).toBe(403);

    await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: `extra-${suffix}@example.com`,
      roleTemplateKey: "VIEWER",
    });
    const extraInvite = emails.sent.filter((message) => message.to === `extra-${suffix}@example.com`).at(-1);
    await request(app.getHttpServer()).post("/api/v1/invitations/accept").send({
      token: extraInvite?.token,
      password: PASSWORD,
      displayName: "Extra",
    });
    const extraOrg = (await ownerA.get(`/api/v1/organizations/${orgA}/members`)).body.find(
      (row: { email: string }) => row.email === `extra-${suffix}@example.com`,
    );
    const extraAdded = await coord
      .post(`/api/v1/projects/${project1}/members`)
      .send({ organizationMembershipId: extraOrg.id });
    expect(extraAdded.status).toBeLessThan(400);
    const extraRole = await coord
      .post(`/api/v1/projects/${project1}/members/${extraAdded.body.id}/roles`)
      .send({ templateKey: "VIEWER" });
    expect(extraRole.status).toBeLessThan(400);
  });

  it("isolates EXTERNAL collaborators to explicit org+project membership and roles", async () => {
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
    expect((await external.get(`/api/v1/organizations/${orgA}/members`)).status).toBe(403);
    expect((await external.get(`/api/v1/organizations/${orgA}/projects`)).status).toBe(403);
    expect((await external.get(`/api/v1/organizations/${orgA}/roles`)).status).toBe(403);
    expect((await external.get(`/api/v1/projects/${project1}`)).status).toBe(403);
    expect((await external.get(`/api/v1/projects/${project2}`)).status).toBe(403);

    const orgMembers = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
    const extOrg = orgMembers.body.find((row: { email: string }) => row.email === `ext-${suffix}@example.com`);
    const added = await ownerA
      .post(`/api/v1/projects/${project1}/members`)
      .send({ organizationMembershipId: extOrg.id });
    await ownerA
      .post(`/api/v1/projects/${project1}/members/${added.body.id}/roles`)
      .send({ templateKey: "EXTERNAL_CONTRIBUTOR" });

    const assigned = await external.get(`/api/v1/projects/${project1}`);
    expect(assigned.status).toBe(200);
    expect((await external.get(`/api/v1/projects/${project2}`)).status).toBe(403);
    expect((await external.get(`/api/v1/organizations/${orgA}/projects`)).status).toBe(403);
    expect((await external.get("/api/v1/projects")).status).toBe(200);
    const mine = await external.get("/api/v1/projects");
    expect(mine.body.map((row: { id: string }) => row.id)).toEqual([project1]);
    expect((await external.get(`/api/v1/organizations/${orgB}`)).status).toBe(403);
  });

  it("drops project access immediately on Project or Organization membership loss", async () => {
    const member = request.agent(app.getHttpServer());
    await member.post("/api/v1/auth/login").send({
      email: `member-${suffix}@example.com`,
      password: PASSWORD,
    });
    await member.post("/api/v1/auth/active-organization").send({ organizationId: orgA });
    const members = await ownerA.get(`/api/v1/projects/${project1}/members`);
    const projectMembership = members.body.find(
      (row: { email: string }) => row.email === `member-${suffix}@example.com`,
    );
    const suspended = await ownerA
      .patch(`/api/v1/projects/${project1}/members/${projectMembership.id}`)
      .send({ status: "SUSPENDED" });
    expect(suspended.status).toBeLessThan(400);
    expect((await member.get(`/api/v1/projects/${project1}`)).status).toBe(403);

    const reactivated = await ownerA
      .patch(`/api/v1/projects/${project1}/members/${projectMembership.id}`)
      .send({ status: "ACTIVE" });
    expect(reactivated.status).toBeLessThan(400);
    expect((await member.get(`/api/v1/projects/${project1}`)).status).toBe(200);

    const orgMembers = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
    const orgMembership = orgMembers.body.find(
      (row: { email: string }) => row.email === `member-${suffix}@example.com`,
    );
    await ownerA.patch(`/api/v1/organizations/${orgA}/members/${orgMembership.id}`).send({ status: "SUSPENDED" });
    const afterOrg = await member.get(`/api/v1/projects/${project1}`);
    expect(afterOrg.status).toBe(401);
    expect(afterOrg.body.code).toBe("SESSION_REVOKED");
    const relogin = request.agent(app.getHttpServer());
    await relogin.post("/api/v1/auth/login").send({
      email: `member-${suffix}@example.com`,
      password: PASSWORD,
    });
    const switchDenied = await relogin.post("/api/v1/auth/active-organization").send({ organizationId: orgA });
    expect(switchDenied.status).toBe(403);
    expect((await relogin.get(`/api/v1/projects/${project1}`)).status).toBe(403);
  });

  it("preserves MFA fail-closed for org-admin privileged operations", async () => {
    await loginWithOptionalMfa(ownerA, {
      email: `owner-a-${suffix}@example.com`,
      password: PASSWORD,
      secret: ownerSecret,
    });
    await ownerA.post("/api/v1/auth/active-organization").send({ organizationId: orgA });
    await loginWithOptionalMfa(ownerB, {
      email: `owner-b-${suffix}@example.com`,
      password: PASSWORD,
      secret: ownerBSecret,
    });
    const session = await ownerA.get("/api/v1/auth/session");
    expect(session.body.mfa.satisfied).toBe(true);
    expect(session.body.permissions).toContain("organization.manage_members");
  });
});
