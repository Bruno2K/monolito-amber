import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { M3_SEED_DELIVERABLES, M3_SEED_ORGANIZATIONS } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m34-${Date.now()}`;
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
let phaseA: { id: string };
let discArch: { id: string };
let _discStr: { id: string };

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

  discArch = (
    await ownerA
      .post(`/api/v1/organizations/${orgA}/disciplines`)
      .set("Idempotency-Key", key("disc-arch"))
      .send({ code: "ARCH", name: "Architecture" })
  ).body;
  _discStr = (
    await ownerA
      .post(`/api/v1/organizations/${orgA}/disciplines`)
      .set("Idempotency-Key", key("disc-str"))
      .send({ code: "STR", name: "Structure" })
  ).body;
  await ownerB
    .post(`/api/v1/organizations/${orgB}/disciplines`)
    .set("Idempotency-Key", key("disc-b"))
    .send({ code: "ARCH", name: "Architecture" });
  phaseA = (
    await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("phase"))
      .send({ name: "Concept", sequence: 1 })
  ).body;
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

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    phaseId: phaseA.id,
    disciplineId: discArch.id,
    code: `DEL-${randomUUID().slice(0, 8)}`,
    title: "Concept pack",
    description: "",
    ...overrides,
  };
}

describe("M3.4 Deliverable", () => {
  it("applies M3 seed Deliverables onto the migrated schema", async () => {
    execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
      cwd: resolve(__dirname, "../../.."),
      env: { ...process.env, DATABASE_URL: db.url, AMBER_SEED_M3: "1" },
      stdio: "inherit",
    });
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [...M3_SEED_ORGANIZATIONS.map((row) => row.slug)] } },
    });
    expect(orgs).toHaveLength(2);
    const deliverables = await prisma.deliverable.findMany();
    expect(deliverables.length).toBeGreaterThanOrEqual(M3_SEED_DELIVERABLES.length);
    expect(deliverables.some((row) => row.status === "PLANNED")).toBe(true);
    expect(deliverables.some((row) => row.status === "IN_PROGRESS" && row.ownerTeamId)).toBe(true);
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'operations'
        AND indexname IN ('deliverables_project_code_active', 'work_packages_project_code_active')
    `;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      "deliverables_project_code_active",
      "work_packages_project_code_active",
    ]);
  });

  it("creates, lists, filters, and reads Deliverables under validated Project context", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("create"))
      .send(createBody({ code: "DEL-ARCH-001", title: "Concept pack" }));
    expect(created.status).toBeLessThan(400);
    expect(created.body.status).toBe("PLANNED");
    expect(created.body.organizationId).toBe(orgA);
    expect(created.body.projectId).toBe(projectA);
    expect(created.body.phaseId).toBe(phaseA.id);
    expect(created.body.disciplineId).toBe(discArch.id);

    const listed = await coordinator.get(`/api/v1/projects/${projectA}/deliverables`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
    expect(listed.body.items.every((row: { archivedAt: string | null }) => row.archivedAt == null)).toBe(true);

    const filtered = await coordinator.get(
      `/api/v1/projects/${projectA}/deliverables?q=Concept&status=PLANNED&phaseId=${phaseA.id}`,
    );
    expect(filtered.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    const got = await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${created.body.id}`);
    expect(got.status).toBe(200);
    expect(got.body.code).toBe("DEL-ARCH-001");
  });

  it("rejects invalid phase/discipline/org, duplicate code, and client authority spoofing", async () => {
    const foreignPhase = await ownerB
      .post(`/api/v1/projects/${projectB}/phases`)
      .set("Idempotency-Key", key("phase-b"))
      .send({ name: "Foreign", sequence: 1 });
    const badPhase = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("bad-phase"))
      .send(createBody({ phaseId: foreignPhase.body.id }));
    expect(badPhase.status).toBe(403);

    const otherOrgDisc = await prisma.discipline.findFirst({ where: { organizationId: orgB } });
    const badDisc = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("bad-disc"))
      .send(createBody({ disciplineId: otherOrgDisc!.id }));
    expect(badDisc.status).toBe(403);

    const spoof = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("spoof-org"))
      .send(createBody({ organizationId: orgB, projectId: projectB }));
    expect(spoof.status).toBe(403);

    const first = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("dup-a"))
      .send(createBody({ code: "DEL-DUP" }));
    expect(first.status).toBeLessThan(400);
    const dup = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("dup-b"))
      .send(createBody({ code: "del-dup" }));
    expect(dup.status).toBe(409);
  });

  it("enforces linear transitions, skip rejection, CAS, and dates/progress never transit status", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("life"))
      .send(createBody({ code: "DEL-LIFE" }));
    expect(created.status).toBeLessThan(400);

    const skip = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/approve`)
      .set("Idempotency-Key", key("skip"))
      .send({ expectedVersion: created.body.version });
    expect(skip.status).toBe(409);

    const deliverEarly = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/deliver`)
      .set("Idempotency-Key", key("deliver-early"))
      .send({ expectedVersion: created.body.version });
    expect(deliverEarly.status).toBe(409);

    const stale = await coordinator.patch(`/api/v1/projects/${projectA}/deliverables/${created.body.id}`).send({
      title: "stale",
      expectedVersion: 999,
    });
    expect(stale.status).toBe(409);

    const progressed = await coordinator.patch(`/api/v1/projects/${projectA}/deliverables/${created.body.id}`).send({
      progressPercent: 100,
      dueAt: "2026-12-01T00:00:00.000Z",
      expectedVersion: created.body.version,
    });
    expect(progressed.status).toBeLessThan(400);
    expect(progressed.body.status).toBe("PLANNED");
    expect(progressed.body.progressPercent).toBe(100);

    const badProgress = await coordinator.patch(`/api/v1/projects/${projectA}/deliverables/${created.body.id}`).send({
      progressPercent: 101,
      expectedVersion: progressed.body.version,
    });
    expect(badProgress.status).toBeGreaterThanOrEqual(400);

    const startKey = key("start");
    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/start`)
      .set("Idempotency-Key", startKey)
      .send({ expectedVersion: progressed.body.version });
    expect(started.status).toBeLessThan(400);
    expect(started.body.status).toBe("IN_PROGRESS");

    const idempotent = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/start`)
      .set("Idempotency-Key", startKey)
      .send({ expectedVersion: progressed.body.version });
    expect(idempotent.status).toBeLessThan(400);
    expect(idempotent.body.status).toBe("IN_PROGRESS");
    expect(idempotent.body.version).toBe(started.body.version);

    const reviewed = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/submit-for-review`)
      .set("Idempotency-Key", key("review"))
      .send({ expectedVersion: started.body.version });
    expect(reviewed.body.status).toBe("IN_REVIEW");

    const approved = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/approve`)
      .set("Idempotency-Key", key("approve"))
      .send({ expectedVersion: reviewed.body.version });
    expect(approved.body.status).toBe("APPROVED");

    const delivered = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/deliver`)
      .set("Idempotency-Key", key("deliver-zero-wp"))
      .send({ expectedVersion: approved.body.version });
    expect(delivered.status).toBeLessThan(400);
    expect(delivered.body.status).toBe("DELIVERED");

    const events = await prisma.auditEvent.findMany({
      where: { resourceId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((row) => row.eventType)).toEqual(
      expect.arrayContaining([
        "DELIVERABLE_CREATED",
        "DELIVERABLE_STATUS_CHANGED",
        "DELIVERABLE_STARTED",
        "DELIVERABLE_APPROVED",
        "DELIVERABLE_DELIVERED",
      ]),
    );
    const outbox = await prisma.outboxMessage.findMany({
      where: { eventType: { in: ["DeliverableCreated", "DeliverableApproved", "DeliverableDelivered"] } },
    });
    expect(outbox.length).toBeGreaterThan(0);
  });

  it("allows deliver with zero linked WPs and blocks when a linked WP is not DONE", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("wp-rule"))
      .send(createBody({ code: "DEL-WP" }));
    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/start`)
      .set("Idempotency-Key", key("wp-start"))
      .send({ expectedVersion: created.body.version });
    const reviewed = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/submit-for-review`)
      .set("Idempotency-Key", key("wp-review"))
      .send({ expectedVersion: started.body.version });
    const approved = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/approve`)
      .set("Idempotency-Key", key("wp-approve"))
      .send({ expectedVersion: reviewed.body.version });

    await prisma.workPackage.create({
      data: {
        organizationId: orgA,
        projectId: projectA,
        phaseId: phaseA.id,
        deliverableId: created.body.id,
        title: "Blocking package",
        status: "ACTIVE",
      },
    });
    const blocked = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/deliver`)
      .set("Idempotency-Key", key("wp-block"))
      .send({ expectedVersion: approved.body.version });
    expect(blocked.status).toBe(409);

    await prisma.workPackage.updateMany({
      where: { deliverableId: created.body.id },
      data: { status: "DONE" },
    });
    const ok = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/deliver`)
      .set("Idempotency-Key", key("wp-ok"))
      .send({ expectedVersion: approved.body.version });
    expect(ok.status).toBeLessThan(400);
    expect(ok.body.status).toBe("DELIVERED");
  });

  it("enforces ownership XOR, ACTIVE ProjectMembership, and Team same-org without granting Project access", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("own"))
      .send(createBody({ code: "DEL-OWN" }));
    const members = await ownerA.get(`/api/v1/projects/${projectA}/members`);
    const coordMember = (members.body as Array<{ id: string; email: string }>).find((row) =>
      row.email.startsWith("coordinator-"),
    );
    const team = await prisma.team.create({
      data: { organizationId: orgA, name: `Alpha Structure ${suffix}` },
    });
    const otherTeam = await prisma.team.create({
      data: { organizationId: orgB, name: `Beta Team ${suffix}` },
    });

    const both = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/assign`)
      .set("Idempotency-Key", key("xor"))
      .send({
        ownerProjectMembershipId: coordMember!.id,
        ownerTeamId: team.id,
        expectedVersion: created.body.version,
      });
    expect(both.status).toBe(409);

    const foreignTeam = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/assign`)
      .set("Idempotency-Key", key("team-b"))
      .send({ ownerTeamId: otherTeam.id, expectedVersion: created.body.version });
    expect(foreignTeam.status).toBe(403);

    const assigned = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/assign`)
      .set("Idempotency-Key", key("team-ok"))
      .send({ ownerTeamId: team.id, expectedVersion: created.body.version });
    expect(assigned.status).toBeLessThan(400);
    expect(assigned.body.ownerTeamId).toBe(team.id);
    expect(assigned.body.ownerProjectMembershipId).toBeNull();

    const session = await teamOnly.get("/api/v1/auth/session");
    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: orgA, userId: session.body.userId },
    });
    await prisma.teamMembership.create({
      data: { teamId: team.id, organizationMembershipId: membership!.id, status: "ACTIVE" },
    });
    const teamRead = await teamOnly.get(`/api/v1/projects/${projectA}/deliverables`);
    expect(teamRead.status).toBe(403);

    const extra = await inviteToProject("inactive-owner", "CONTRIBUTOR_DESIGNER", projectA);
    const extraPm = await prisma.projectMembership.findFirst({
      where: {
        projectId: projectA,
        organizationMembership: { user: { email: `inactive-owner-${suffix}@example.com` } },
      },
    });
    expect(extraPm).toBeTruthy();
    const removed = await ownerA.patch(`/api/v1/projects/${projectA}/members/${extraPm!.id}`).send({
      status: "REMOVED",
    });
    expect(removed.status).toBeLessThan(400);
    const inactiveOwner = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/assign`)
      .set("Idempotency-Key", key("inactive-owner"))
      .send({ ownerProjectMembershipId: extraPm!.id, expectedVersion: assigned.body.version });
    expect(inactiveOwner.status).toBe(409);
    void extra;
  });

  it("denies viewers/contributors approve/deliver, hides unauthorized rows, and rejects Document mutation", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("sec"))
      .send(createBody({ code: "DEL-SEC" }));
    const viewerRead = await viewer.get(`/api/v1/projects/${projectA}/deliverables`);
    expect(viewerRead.status).toBe(200);
    const viewerMut = await viewer
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("viewer-create"))
      .send(createBody({ code: "NOPE" }));
    expect(viewerMut.status).toBe(403);
    const contribApprove = await contributor
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/approve`)
      .set("Idempotency-Key", key("contrib-approve"))
      .send({ expectedVersion: created.body.version });
    expect(contribApprove.status).toBe(403);
    const discDeliver = await disciplineCoord
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/deliver`)
      .set("Idempotency-Key", key("disc-deliver"))
      .send({ expectedVersion: created.body.version });
    expect(discDeliver.status).toBe(403);
    const discCreate = await disciplineCoord
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("disc-create"))
      .send(createBody({ code: "DEL-DISC" }));
    expect(discCreate.status).toBeLessThan(400);

    const cross = await ownerB.get(`/api/v1/projects/${projectA}/deliverables/${created.body.id}`);
    expect(cross.status).toBe(403);
    expect(cross.body.id).toBeUndefined();
    expect(cross.body.items).toBeUndefined();
    const spoofGet = await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${SPOOFED}`);
    expect(spoofGet.status).toBe(403);
    const otherProject = await coordinator.get(`/api/v1/projects/${projectA2}/deliverables`);
    expect(otherProject.status).toBe(403);
    const unauth = await teamOnly.get(`/api/v1/projects/${projectA}/deliverables`);
    expect(unauth.status).toBe(403);
    expect(unauth.body.items).toBeUndefined();

    const docMut = await coordinator.patch(`/api/v1/projects/${projectA}/deliverables/${created.body.id}`).send({
      documentId: randomUUID(),
      expectedVersion: created.body.version,
    });
    expect(docMut.status).toBe(409);
    const statusPatch = await coordinator.patch(`/api/v1/projects/${projectA}/deliverables/${created.body.id}`).send({
      status: "DELIVERED",
      expectedVersion: created.body.version,
    });
    expect(statusPatch.status).toBe(409);
  });

  it("soft-archives a Deliverable, hides it from default list, and never hard-deletes", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("arch"))
      .send(createBody({ code: "DEL-ARCHV" }));
    const archived = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${created.body.id}/archive`)
      .set("Idempotency-Key", key("arch-do"))
      .send({ expectedVersion: created.body.version });
    expect(archived.body.archivedAt).toBeTruthy();
    const listed = await coordinator.get(`/api/v1/projects/${projectA}/deliverables`);
    expect(listed.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(false);
    const hiddenFromViewer = await viewer.get(`/api/v1/projects/${projectA}/deliverables?includeArchived=true`);
    expect(hiddenFromViewer.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(false);
    const reuse = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", key("reuse-code"))
      .send(createBody({ code: "DEL-ARCHV" }));
    expect(reuse.status).toBeLessThan(400);
    const stillThere = await prisma.deliverable.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.archivedAt).toBeTruthy();
  });

  it("rejects a duplicate-code race and replays the same Idempotency-Key", async () => {
    const race = await Promise.all([
      coordinator
        .post(`/api/v1/projects/${projectA}/deliverables`)
        .set("Idempotency-Key", key("race-1"))
        .send(createBody({ code: "DEL-RACE" })),
      coordinator
        .post(`/api/v1/projects/${projectA}/deliverables`)
        .set("Idempotency-Key", key("race-2"))
        .send(createBody({ code: "DEL-RACE" })),
    ]);
    const statuses = race.map((row) => row.status).sort();
    expect(statuses[0]).toBeLessThan(400);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const idemKey = key("idem-create");
    const first = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", idemKey)
      .send(createBody({ code: "DEL-IDEM" }));
    const second = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables`)
      .set("Idempotency-Key", idemKey)
      .send(createBody({ code: "DEL-IDEM" }));
    expect(first.status).toBeLessThan(400);
    expect(second.body.id).toBe(first.body.id);
  });
});
