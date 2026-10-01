import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { M3_SEED_DISCIPLINES, M3_SEED_ORGANIZATIONS, M3_SEED_PHASES } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m33-${Date.now()}`;
const SPOOFED = "99999999-9999-4999-8999-999999999999";

type Agent = ReturnType<typeof request.agent>;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;
let orgA: string;
let orgB: string;
let projectA: string;
let projectA2: string;
let projectB: string;
let ownerA: Agent;
let ownerB: Agent;
let coordinator: Agent;
let disciplineCoord: Agent;
let contributor: Agent;
let viewer: Agent;
let teamOnly: Agent;

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
  orgA = (await ownerA.post("/api/v1/organizations").send({ name: `Org A ${suffix}` })).body.id;
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
  orgB = (await ownerB.post("/api/v1/organizations").send({ name: `Org B ${suffix}` })).body.id;
  await enrollTotp(ownerB);

  projectA = (await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Tower ${suffix}` })).body
    .project.id;
  projectA2 = (await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Plant ${suffix}` })).body
    .project.id;
  projectB = (await ownerB.post(`/api/v1/organizations/${orgB}/projects`).send({ name: `Campus ${suffix}` })).body
    .project.id;

  coordinator = await inviteToProject("coordinator", "PROJECT_COORDINATOR", projectA);
  disciplineCoord = await inviteToProject("discipline", "DISCIPLINE_COORDINATOR", projectA);
  contributor = await inviteToProject("contributor", "CONTRIBUTOR_DESIGNER", projectA);
  viewer = await inviteToProject("viewer", "VIEWER", projectA);
  teamOnly = await inviteOrgOnly("teamonly");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

async function inviteOrgOnly(label: string): Promise<Agent> {
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

async function inviteToProject(label: string, templateKey: string, projectId: string): Promise<Agent> {
  const agent = await inviteOrgOnly(label);
  const email = `${label}-${suffix}@example.com`;
  const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
  const row = members.body.find((item: { email: string }) => item.email === email);
  const added = await ownerA.post(`/api/v1/projects/${projectId}/members`).send({
    organizationMembershipId: row.id,
  });
  expect(added.status).toBeLessThan(400);
  const assigned = await ownerA
    .post(`/api/v1/projects/${projectId}/members/${added.body.id}/roles`)
    .send({ templateKey });
  expect(assigned.status).toBeLessThan(400);
  return agent;
}

function key(label: string): string {
  return `${label}-${suffix}-${randomUUID()}`;
}

describe("M3.3 Phase & Discipline", () => {
  it("applies M3.1 seed design onto the migrated schema", async () => {
    execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
      cwd: resolve(__dirname, "../../.."),
      env: { ...process.env, DATABASE_URL: db.url, AMBER_SEED_M3: "1" },
      stdio: "inherit",
    });
    const orgs = await prisma.organization.findMany({ where: { slug: { in: [...M3_SEED_ORGANIZATIONS.map((row) => row.slug)] } } });
    expect(orgs).toHaveLength(2);
    const disciplines = await prisma.discipline.findMany();
    expect(disciplines.length).toBeGreaterThanOrEqual(M3_SEED_DISCIPLINES.length);
    expect(disciplines.some((row) => row.code === "ARCH")).toBe(true);
    expect(disciplines.some((row) => row.code === "STR")).toBe(true);
    const phases = await prisma.phase.findMany();
    expect(phases.length).toBeGreaterThanOrEqual(M3_SEED_PHASES.length);
    expect(phases.some((row) => row.status === "PLANNED")).toBe(true);
    expect(phases.some((row) => row.status === "ACTIVE")).toBe(true);
    expect(phases.some((row) => row.status === "COMPLETED")).toBe(true);
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname IN ('operations', 'org')
        AND indexname IN ('phases_project_sequence_active', 'disciplines_org_code_ci')
    `;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      "disciplines_org_code_ci",
      "phases_project_sequence_active",
    ]);
  });

  it("creates, lists, and reads Phases under validated Project context", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("create"))
      .send({ name: "Concept", description: "", sequence: 1 });
    expect(created.status).toBeLessThan(400);
    expect(created.body.status).toBe("PLANNED");
    expect(created.body.organizationId).toBe(orgA);
    expect(created.body.projectId).toBe(projectA);
    expect(created.body.version).toBe(1);

    const listed = await coordinator.get(`/api/v1/projects/${projectA}/phases`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
    expect(listed.body.items.every((row: { archivedAt: string | null }) => row.archivedAt == null)).toBe(true);

    const got = await coordinator.get(`/api/v1/projects/${projectA}/phases/${created.body.id}`);
    expect(got.status).toBe(200);
    expect(got.body.name).toBe("Concept");
  });

  it("rejects invalid dates, overlap is allowed, and dates never complete a Phase", async () => {
    const invalid = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("dates-bad"))
      .send({
        name: "Bad dates",
        sequence: 20,
        plannedStartAt: "2026-06-01T00:00:00.000Z",
        plannedEndAt: "2026-01-01T00:00:00.000Z",
      });
    expect(invalid.status).toBe(409);

    const first = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("overlap-a"))
      .send({
        name: "Overlap A",
        sequence: 21,
        plannedStartAt: "2026-01-01T00:00:00.000Z",
        plannedEndAt: "2026-06-01T00:00:00.000Z",
      });
    const second = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("overlap-b"))
      .send({
        name: "Overlap B",
        sequence: 22,
        plannedStartAt: "2026-03-01T00:00:00.000Z",
        plannedEndAt: "2026-09-01T00:00:00.000Z",
      });
    expect(first.status).toBeLessThan(400);
    expect(second.status).toBeLessThan(400);

    const patched = await coordinator.patch(`/api/v1/projects/${projectA}/phases/${first.body.id}`).send({
      plannedEndAt: "2020-01-01T00:00:00.000Z",
      expectedVersion: first.body.version,
    });
    expect(patched.status).toBe(409);

    const dated = await coordinator.patch(`/api/v1/projects/${projectA}/phases/${first.body.id}`).send({
      plannedEndAt: "2026-12-01T00:00:00.000Z",
      expectedVersion: first.body.version,
    });
    expect(dated.status).toBeLessThan(400);
    expect(dated.body.status).toBe("PLANNED");
  });

  it("enforces unique sequence, CAS, and explicit transitions", async () => {
    const phase = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("machine"))
      .send({ name: "Lifecycle", sequence: 30 });
    expect(phase.status).toBeLessThan(400);

    const dup = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("dup-seq"))
      .send({ name: "Collision", sequence: 30 });
    expect(dup.status).toBe(409);

    const skip = await coordinator
      .post(`/api/v1/projects/${projectA}/phases/${phase.body.id}/complete`)
      .set("Idempotency-Key", key("skip"))
      .send({ expectedVersion: phase.body.version });
    expect(skip.status).toBe(409);

    const stale = await coordinator.patch(`/api/v1/projects/${projectA}/phases/${phase.body.id}`).send({
      name: "stale",
      expectedVersion: 999,
    });
    expect(stale.status).toBe(409);

    const activated = await coordinator
      .post(`/api/v1/projects/${projectA}/phases/${phase.body.id}/activate`)
      .set("Idempotency-Key", key("act"))
      .send({ expectedVersion: phase.body.version });
    expect(activated.status).toBeLessThan(400);
    expect(activated.body.status).toBe("ACTIVE");
    expect(activated.body.actualStartAt).toBeTruthy();

    const completed = await coordinator
      .post(`/api/v1/projects/${projectA}/phases/${phase.body.id}/complete`)
      .set("Idempotency-Key", key("cmp"))
      .send({ expectedVersion: activated.body.version });
    expect(completed.status).toBeLessThan(400);
    expect(completed.body.status).toBe("COMPLETED");

    const events = await prisma.auditEvent.findMany({
      where: { resourceId: phase.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((row) => row.eventType)).toEqual(
      expect.arrayContaining(["PHASE_CREATED", "PHASE_STATUS_CHANGED", "PHASE_ACTIVATED", "PHASE_COMPLETED"]),
    );
    const outbox = await prisma.outboxMessage.findMany({
      where: { eventType: { in: ["PhaseCreated", "PhaseActivated", "PhaseCompleted"] } },
    });
    expect(outbox.length).toBeGreaterThan(0);
  });

  it("soft-archives a Phase, frees sequence, and never hard-deletes", async () => {
    const phase = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("arch"))
      .send({ name: "Archivable", sequence: 40 });
    const archived = await coordinator
      .post(`/api/v1/projects/${projectA}/phases/${phase.body.id}/archive`)
      .set("Idempotency-Key", key("arch-do"))
      .send({ expectedVersion: phase.body.version });
    expect(archived.status).toBeLessThan(400);
    expect(archived.body.archivedAt).toBeTruthy();
    const listed = await coordinator.get(`/api/v1/projects/${projectA}/phases`);
    expect(listed.body.items.some((row: { id: string }) => row.id === phase.body.id)).toBe(false);
    const hiddenFromViewer = await viewer.get(`/api/v1/projects/${projectA}/phases?includeArchived=true`);
    expect(hiddenFromViewer.status).toBe(200);
    expect(hiddenFromViewer.body.items.some((row: { id: string }) => row.id === phase.body.id)).toBe(false);
    const reuse = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("reuse"))
      .send({ name: "Reused sequence", sequence: 40 });
    expect(reuse.status).toBeLessThan(400);
    const stillThere = await prisma.phase.findUnique({ where: { id: phase.body.id } });
    expect(stillThere?.archivedAt).toBeTruthy();
  });

  it("reorders with CAS and rejects a duplicate-sequence race", async () => {
    const a = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("ro-a"))
      .send({ name: "R1", sequence: 50 });
    const b = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("ro-b"))
      .send({ name: "R2", sequence: 51 });
    const reordered = await coordinator
      .post(`/api/v1/projects/${projectA}/phases/reorder`)
      .set("Idempotency-Key", key("reorder"))
      .send({
        items: [
          { id: a.body.id, sequence: 51, expectedVersion: a.body.version },
          { id: b.body.id, sequence: 50, expectedVersion: b.body.version },
        ],
      });
    expect(reordered.status).toBeLessThan(400);
    const race = await Promise.all([
      coordinator
        .post(`/api/v1/projects/${projectA}/phases`)
        .set("Idempotency-Key", key("race-1"))
        .send({ name: "Race 1", sequence: 60 }),
      coordinator
        .post(`/api/v1/projects/${projectA}/phases`)
        .set("Idempotency-Key", key("race-2"))
        .send({ name: "Race 2", sequence: 60 }),
    ]);
    const statuses = race.map((row) => row.status).sort();
    expect(statuses[0]).toBeLessThan(400);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
  });

  it("lists Org Disciplines for project.read and rejects cross-tenant / cross-project writes", async () => {
    const created = await ownerA
      .post(`/api/v1/organizations/${orgA}/disciplines`)
      .set("Idempotency-Key", key("disc"))
      .send({ code: "ARCH", name: "Architecture", sortOrder: 1 });
    expect(created.status).toBeLessThan(400);
    const listed = await coordinator.get(
      `/api/v1/organizations/${orgA}/disciplines?projectId=${projectA}`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row: { code: string }) => row.code === "ARCH")).toBe(true);

    const spoofedOrg = await ownerA
      .post(`/api/v1/organizations/${orgA}/disciplines`)
      .set("Idempotency-Key", key("disc-spoof"))
      .send({ code: "FAKE", name: "Fake", organizationId: orgB });
    expect(spoofedOrg.status).toBe(403);
    const crossProject = await coordinator.get(
      `/api/v1/organizations/${orgA}/disciplines?projectId=${projectA2}`,
    );
    expect(crossProject.status).toBe(403);
    const rename = await ownerA.patch(`/api/v1/organizations/${orgA}/disciplines/${created.body.id}`).send({
      code: "ARCHITECTURE",
    });
    expect(rename.status).toBe(409);

    const crossOrg = await ownerB.get(`/api/v1/organizations/${orgA}/disciplines`);
    expect(crossOrg.status).toBe(403);
    const crossWrite = await ownerB
      .post(`/api/v1/organizations/${orgA}/disciplines`)
      .set("Idempotency-Key", key("disc-b"))
      .send({ code: "MEP", name: "MEP" });
    expect(crossWrite.status).toBe(403);
    const otherCatalog = await ownerB
      .post(`/api/v1/organizations/${orgB}/disciplines`)
      .set("Idempotency-Key", key("disc-b-ok"))
      .send({ code: "ARCH", name: "Architecture" });
    expect(otherCatalog.status).toBeLessThan(400);
  });

  it("denies cross-tenant Phase ids, TeamMembership-only access, viewers, and revoked members", async () => {
    const phase = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("iso"))
      .send({ name: "Isolation", sequence: 70 });
    const cross = await ownerB.get(`/api/v1/projects/${projectA}/phases/${phase.body.id}`);
    expect(cross.status).toBe(403);
    const spoof = await coordinator.get(`/api/v1/projects/${projectA}/phases/${SPOOFED}`);
    expect(spoof.status).toBe(403);
    const foreign = await ownerB
      .post(`/api/v1/projects/${projectB}/phases`)
      .set("Idempotency-Key", key("iso-b"))
      .send({ name: "Foreign", sequence: 1 });
    expect(foreign.status).toBeLessThan(400);
    const stolen = await coordinator.get(`/api/v1/projects/${projectA}/phases/${foreign.body.id}`);
    expect(stolen.status).toBe(403);
    expect(stolen.body.items).toBeUndefined();
    expect(stolen.body.id).toBeUndefined();
    const otherProject = await coordinator.get(`/api/v1/projects/${projectA2}/phases`);
    expect(otherProject.status).toBe(403);
    const teamRead = await teamOnly.get(`/api/v1/projects/${projectA}/phases`);
    expect(teamRead.status).toBe(403);

    const team = await prisma.team.create({
      data: { organizationId: orgA, name: `Alpha Structure ${suffix}` },
    });
    const session = await teamOnly.get("/api/v1/auth/session");
    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: orgA, userId: session.body.userId },
    });
    await prisma.teamMembership.create({
      data: { teamId: team.id, organizationMembershipId: membership!.id, status: "ACTIVE" },
    });
    const stillDenied = await teamOnly.get(`/api/v1/projects/${projectA}/phases`);
    expect(stillDenied.status).toBe(403);

    const viewerRead = await viewer.get(`/api/v1/projects/${projectA}/phases`);
    expect(viewerRead.status).toBe(200);
    const statusPatch = await viewer.patch(`/api/v1/projects/${projectA}/phases/${phase.body.id}`).send({
      status: "COMPLETED",
      expectedVersion: phase.body.version,
    });
    expect(statusPatch.status).toBe(403);
    const coordinatorStatusPatch = await coordinator
      .patch(`/api/v1/projects/${projectA}/phases/${phase.body.id}`)
      .send({ status: "COMPLETED", expectedVersion: phase.body.version });
    expect(coordinatorStatusPatch.status).toBe(409);
    const viewerCreate = await viewer
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("viewer"))
      .send({ name: "nope", sequence: 71 });
    expect(viewerCreate.status).toBe(403);
    const discComplete = await disciplineCoord
      .post(`/api/v1/projects/${projectA}/phases/${phase.body.id}/complete`)
      .set("Idempotency-Key", key("disc-complete"))
      .send({ expectedVersion: phase.body.version });
    expect(discComplete.status).toBe(403);
    const contribComplete = await contributor
      .post(`/api/v1/projects/${projectA}/phases/${phase.body.id}/complete`)
      .set("Idempotency-Key", key("contrib-complete"))
      .send({ expectedVersion: phase.body.version });
    expect(contribComplete.status).toBe(403);

    const members = await ownerA.get(`/api/v1/projects/${projectA}/members`);
    const viewerMember = (members.body as Array<{ id: string; email?: string; userId?: string }>).at(-1);
    const orgMembers = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
    const viewerRow = (orgMembers.body as Array<{ email: string; id: string }>).find(
      (row) => row.email === `viewer-${suffix}@example.com`,
    );
    const projectMembers = await prisma.projectMembership.findMany({
      where: { projectId: projectA },
      include: { organizationMembership: true },
    });
    const viewerPm = projectMembers.find((row) => row.organizationMembershipId === viewerRow?.id);
    expect(viewerPm).toBeTruthy();
    const removed = await ownerA.patch(`/api/v1/projects/${projectA}/members/${viewerPm!.id}`).send({
      status: "REMOVED",
    });
    expect(removed.status).toBeLessThan(400);
    const revoked = await viewer.get(`/api/v1/projects/${projectA}/phases`);
    expect(revoked.status).toBe(403);
    void viewerMember;
  });

  it("omits unauthorized rows without hidden counts and keeps historical discipline strings", async () => {
    const unauthListed = await teamOnly.get(`/api/v1/projects/${projectA}/phases`);
    expect(unauthListed.status).toBe(403);
    expect(unauthListed.body.items).toBeUndefined();
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE (table_schema = 'document' AND table_name = 'documents' AND column_name = 'discipline_id')
         OR (table_schema = 'coordination' AND table_name = 'issues' AND column_name = 'responsible_discipline_id')
         OR (table_schema = 'planning' AND table_name = 'tasks' AND column_name = 'responsible_discipline_id')
    `;
    expect(columns).toHaveLength(3);
  });
});
