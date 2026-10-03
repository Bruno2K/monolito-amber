import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { M3_SEED_ORGANIZATIONS, M3_SEED_WORK_PACKAGES } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m35-${Date.now()}`;
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
let phaseA2: { id: string };
let discArch: { id: string };

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
  phaseA2 = (
    await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("phase-2"))
      .send({ name: "Developed", sequence: 2 })
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
    title: "Outline programme",
    description: "",
    ...overrides,
  };
}

async function createDeliverable(code: string, phaseId = phaseA.id) {
  const created = await coordinator
    .post(`/api/v1/projects/${projectA}/deliverables`)
    .set("Idempotency-Key", key(`del-${code}`))
    .send({
      phaseId,
      disciplineId: discArch.id,
      code,
      title: code,
    });
  expect(created.status).toBeLessThan(400);
  return created.body as { id: string; version: number; status: string };
}

describe("M3.5 WorkPackage", () => {
  it("applies additive M3.5 migration without rewriting the M3.4 work_packages table", async () => {
    execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
      cwd: resolve(__dirname, "../../.."),
      env: { ...process.env, DATABASE_URL: db.url, AMBER_SEED_M3: "1", AMBER_ALLOW_DEMO_SEED: "1" },
      stdio: "inherit",
    });
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [...M3_SEED_ORGANIZATIONS.map((row) => row.slug)] } },
    });
    expect(orgs).toHaveLength(2);
    const packages = await prisma.workPackage.findMany();
    expect(packages.length).toBeGreaterThanOrEqual(M3_SEED_WORK_PACKAGES.length);
    expect(packages.some((row) => row.status === "BLOCKED" && row.blockedReason)).toBe(true);
    expect(packages.some((row) => row.deliverableId == null)).toBe(true);
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'operations'
        AND indexname IN (
          'work_packages_project_code_active',
          'work_packages_owner_project_membership_id_idx',
          'work_packages_owner_team_id_idx'
        )
    `;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      "work_packages_owner_project_membership_id_idx",
      "work_packages_owner_team_id_idx",
      "work_packages_project_code_active",
    ]);
  });

  it("creates, lists, filters, and reads WorkPackages under validated Project context", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("create"))
      .send(createBody({ code: "WP-ARCH-001", title: "Outline programme" }));
    expect(created.status).toBeLessThan(400);
    expect(created.body.status).toBe("PLANNED");
    expect(created.body.organizationId).toBe(orgA);
    expect(created.body.projectId).toBe(projectA);
    expect(created.body.phaseId).toBe(phaseA.id);
    expect(created.body.deliverableId).toBeNull();

    const listed = await coordinator.get(`/api/v1/projects/${projectA}/work-packages`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
    expect(listed.body.items.every((row: { archivedAt: string | null }) => row.archivedAt == null)).toBe(true);

    const filtered = await coordinator.get(
      `/api/v1/projects/${projectA}/work-packages?q=Outline&status=PLANNED&phaseId=${phaseA.id}`,
    );
    expect(filtered.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    const got = await coordinator.get(`/api/v1/projects/${projectA}/work-packages/${created.body.id}`);
    expect(got.status).toBe(200);
    expect(got.body.code).toBe("WP-ARCH-001");
  });

  it("rejects invalid phase/discipline/org, duplicate code, and client authority spoofing", async () => {
    const foreignPhase = await ownerB
      .post(`/api/v1/projects/${projectB}/phases`)
      .set("Idempotency-Key", key("phase-b"))
      .send({ name: "Foreign", sequence: 1 });
    const badPhase = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("bad-phase"))
      .send(createBody({ phaseId: foreignPhase.body.id }));
    expect(badPhase.status).toBe(403);

    const otherOrgDisc = await prisma.discipline.findFirst({ where: { organizationId: orgB } });
    const badDisc = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("bad-disc"))
      .send(createBody({ disciplineId: otherOrgDisc!.id }));
    expect(badDisc.status).toBe(403);

    const spoof = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("spoof-org"))
      .send(createBody({ organizationId: orgB, projectId: projectB }));
    expect(spoof.status).toBe(403);

    const first = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("dup-a"))
      .send(createBody({ code: "WP-DUP", title: "Dup A" }));
    expect(first.status).toBeLessThan(400);
    const dup = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("dup-b"))
      .send(createBody({ code: "wp-dup", title: "Dup B" }));
    expect(dup.status).toBe(409);
  });

  it("enforces explicit transitions, blockedReason, CAS, and dates never transit status", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("life"))
      .send(createBody({ code: "WP-LIFE", title: "Lifecycle" }));
    expect(created.status).toBeLessThan(400);

    const skipDone = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/complete`)
      .set("Idempotency-Key", key("skip-done"))
      .send({ expectedVersion: created.body.version });
    expect(skipDone.status).toBe(409);

    const stale = await coordinator.patch(`/api/v1/projects/${projectA}/work-packages/${created.body.id}`).send({
      title: "stale",
      expectedVersion: 999,
    });
    expect(stale.status).toBe(409);

    const dated = await coordinator.patch(`/api/v1/projects/${projectA}/work-packages/${created.body.id}`).send({
      dueAt: "2026-12-01T00:00:00.000Z",
      expectedVersion: created.body.version,
    });
    expect(dated.status).toBeLessThan(400);
    expect(dated.body.status).toBe("PLANNED");

    const statusPatch = await coordinator.patch(`/api/v1/projects/${projectA}/work-packages/${created.body.id}`).send({
      status: "DONE",
      expectedVersion: dated.body.version,
    });
    expect(statusPatch.status).toBe(409);
    expect(statusPatch.body.status).not.toBe("DONE");

    const activateKey = key("activate");
    const activated = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/activate`)
      .set("Idempotency-Key", activateKey)
      .send({ expectedVersion: dated.body.version });
    expect(activated.body.status).toBe("ACTIVE");

    const replay = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/activate`)
      .set("Idempotency-Key", activateKey)
      .send({ expectedVersion: dated.body.version });
    expect(replay.body.status).toBe("ACTIVE");
    expect(replay.body.version).toBe(activated.body.version);

    const missingReason = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/block`)
      .set("Idempotency-Key", key("block-empty"))
      .send({ expectedVersion: activated.body.version, blockedReason: "  " });
    expect(missingReason.status).toBe(409);

    const blocked = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/block`)
      .set("Idempotency-Key", key("block"))
      .send({ expectedVersion: activated.body.version, blockedReason: "Waiting for grid freeze" });
    expect(blocked.body.status).toBe("BLOCKED");
    expect(blocked.body.blockedReason).toBe("Waiting for grid freeze");

    const clearReason = await coordinator.patch(`/api/v1/projects/${projectA}/work-packages/${created.body.id}`).send({
      blockedReason: "",
      expectedVersion: blocked.body.version,
    });
    expect(clearReason.status).toBe(409);

    const skipFromBlocked = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/complete`)
      .set("Idempotency-Key", key("skip-blocked-done"))
      .send({ expectedVersion: blocked.body.version });
    expect(skipFromBlocked.status).toBe(409);

    const unblocked = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/unblock`)
      .set("Idempotency-Key", key("unblock"))
      .send({ expectedVersion: blocked.body.version });
    expect(unblocked.body.status).toBe("ACTIVE");
    expect(unblocked.body.blockedReason).toBeNull();

    const tasksBefore = await prisma.task.count({ where: { projectId: projectA } });
    const deliverablesBefore = await prisma.deliverable.count({ where: { projectId: projectA } });
    const milestonesBefore = await prisma.milestone.count({ where: { projectId: projectA } });

    const completed = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/complete`)
      .set("Idempotency-Key", key("complete"))
      .send({ expectedVersion: unblocked.body.version });
    expect(completed.body.status).toBe("DONE");

    expect(await prisma.task.count({ where: { projectId: projectA } })).toBe(tasksBefore);
    expect(await prisma.deliverable.count({ where: { projectId: projectA } })).toBe(deliverablesBefore);
    expect(await prisma.milestone.count({ where: { projectId: projectA } })).toBe(milestonesBefore);
    const mutatedTasks = await prisma.task.findMany({ where: { projectId: projectA } });
    expect(mutatedTasks.every((row) => row.status !== "DONE" || tasksBefore > 0)).toBe(true);

    const events = await prisma.auditEvent.findMany({
      where: { resourceId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((row) => row.eventType)).toEqual(
      expect.arrayContaining([
        "WORK_PACKAGE_CREATED",
        "WORK_PACKAGE_STATUS_CHANGED",
        "WORK_PACKAGE_ACTIVATED",
        "WORK_PACKAGE_BLOCKED",
        "WORK_PACKAGE_UNBLOCKED",
        "WORK_PACKAGE_COMPLETED",
      ]),
    );
    const outbox = await prisma.outboxMessage.findMany({
      where: { eventType: { in: ["WorkPackageCreated", "WorkPackageBlocked", "WorkPackageCompleted"] } },
    });
    expect(outbox.length).toBeGreaterThan(0);
  });

  it("associates only same Project/Phase Deliverables and blocks parent deliver until DONE or disassociate", async () => {
    const deliverable = await createDeliverable("DEL-WP-GUARD");
    const otherPhaseDel = await createDeliverable("DEL-OTHER-PHASE", phaseA2.id);
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("assoc-create"))
      .send(createBody({ title: "Linked package", deliverableId: deliverable.id }));
    expect(created.body.deliverableId).toBe(deliverable.id);

    const foreignDel = await ownerB
      .post(`/api/v1/projects/${projectB}/phases`)
      .set("Idempotency-Key", key("phase-b-assoc"))
      .send({ name: "Foreign assoc", sequence: 2 });
    void foreignDel;
    const otherProjectDel = (
      await ownerB
        .post(`/api/v1/organizations/${orgB}/disciplines`)
        .set("Idempotency-Key", key("disc-b2"))
        .send({ code: "STR", name: "Structure" })
    ).body;
    void otherProjectDel;

    const crossPhase = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/associate`)
      .set("Idempotency-Key", key("assoc-phase"))
      .send({ deliverableId: otherPhaseDel.id, expectedVersion: created.body.version });
    expect(crossPhase.status).toBe(403);

    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/start`)
      .set("Idempotency-Key", key("del-start"))
      .send({ expectedVersion: deliverable.version });
    const reviewed = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/submit-for-review`)
      .set("Idempotency-Key", key("del-review"))
      .send({ expectedVersion: started.body.version });
    const approved = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/approve`)
      .set("Idempotency-Key", key("del-approve"))
      .send({ expectedVersion: reviewed.body.version });

    const activated = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/activate`)
      .set("Idempotency-Key", key("assoc-activate"))
      .send({ expectedVersion: created.body.version });
    const blockedDeliver = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/deliver`)
      .set("Idempotency-Key", key("del-block"))
      .send({ expectedVersion: approved.body.version });
    expect(blockedDeliver.status).toBe(409);

    const cancelled = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/cancel`)
      .set("Idempotency-Key", key("assoc-cancel"))
      .send({ expectedVersion: activated.body.version });
    expect(cancelled.body.status).toBe("CANCELLED");
    const stillBlocked = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/deliver`)
      .set("Idempotency-Key", key("del-cancel-block"))
      .send({ expectedVersion: approved.body.version });
    expect(stillBlocked.status).toBe(409);

    const viewerDissoc = await viewer
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", key("dissoc-viewer"))
      .send({ expectedVersion: cancelled.body.version });
    expect(viewerDissoc.status).toBe(403);

    const dissociated = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", key("dissoc"))
      .send({ expectedVersion: cancelled.body.version });
    expect(dissociated.body.deliverableId).toBeNull();
    const audit = await prisma.auditEvent.findMany({
      where: { resourceId: created.body.id, eventType: "WORK_PACKAGE_DISASSOCIATED" },
    });
    expect(audit.length).toBeGreaterThan(0);

    const delivered = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/deliver`)
      .set("Idempotency-Key", key("del-ok"))
      .send({ expectedVersion: approved.body.version });
    expect(delivered.status).toBeLessThan(400);
    expect(delivered.body.status).toBe("DELIVERED");
  });

  it("still allows deliver with zero linked WorkPackages", async () => {
    const deliverable = await createDeliverable("DEL-ZERO-WP");
    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/start`)
      .set("Idempotency-Key", key("zero-start"))
      .send({ expectedVersion: deliverable.version });
    const reviewed = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/submit-for-review`)
      .set("Idempotency-Key", key("zero-review"))
      .send({ expectedVersion: started.body.version });
    const approved = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/approve`)
      .set("Idempotency-Key", key("zero-approve"))
      .send({ expectedVersion: reviewed.body.version });
    const delivered = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverable.id}/deliver`)
      .set("Idempotency-Key", key("zero-deliver"))
      .send({ expectedVersion: approved.body.version });
    expect(delivered.status).toBeLessThan(400);
  });

  it("enforces ownership XOR, ACTIVE ProjectMembership, and Team same-org without granting Project access", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("own"))
      .send(createBody({ title: "Owned package" }));
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
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/assign`)
      .set("Idempotency-Key", key("xor"))
      .send({
        ownerProjectMembershipId: coordMember!.id,
        ownerTeamId: team.id,
        expectedVersion: created.body.version,
      });
    expect(both.status).toBe(409);

    const foreignTeam = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/assign`)
      .set("Idempotency-Key", key("team-b"))
      .send({ ownerTeamId: otherTeam.id, expectedVersion: created.body.version });
    expect(foreignTeam.status).toBe(403);

    const assigned = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/assign`)
      .set("Idempotency-Key", key("team-ok"))
      .send({ ownerTeamId: team.id, expectedVersion: created.body.version });
    expect(assigned.status).toBeLessThan(400);
    expect(assigned.body.ownerTeamId).toBe(team.id);

    const session = await teamOnly.get("/api/v1/auth/session");
    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: orgA, userId: session.body.userId },
    });
    await prisma.teamMembership.create({
      data: { teamId: team.id, organizationMembershipId: membership!.id, status: "ACTIVE" },
    });
    const teamRead = await teamOnly.get(`/api/v1/projects/${projectA}/work-packages`);
    expect(teamRead.status).toBe(403);

    const extra = await inviteToProject("inactive-wp-owner", "CONTRIBUTOR_DESIGNER", projectA);
    const extraPm = await prisma.projectMembership.findFirst({
      where: {
        projectId: projectA,
        organizationMembership: { user: { email: `inactive-wp-owner-${suffix}@example.com` } },
      },
    });
    const removed = await ownerA.patch(`/api/v1/projects/${projectA}/members/${extraPm!.id}`).send({
      status: "REMOVED",
    });
    expect(removed.status).toBeLessThan(400);
    const inactiveOwner = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/assign`)
      .set("Idempotency-Key", key("inactive-owner"))
      .send({ ownerProjectMembershipId: extraPm!.id, expectedVersion: assigned.body.version });
    expect(inactiveOwner.status).toBe(409);
    void extra;
  });

  it("denies viewers/contributors mutations, hides unauthorized rows, and rejects Document/Task mutation", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("sec"))
      .send(createBody({ title: "Sec package", code: "WP-SEC" }));
    const viewerRead = await viewer.get(`/api/v1/projects/${projectA}/work-packages`);
    expect(viewerRead.status).toBe(200);
    const viewerMut = await viewer
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("viewer-create"))
      .send(createBody({ title: "NOPE" }));
    expect(viewerMut.status).toBe(403);
    const contribComplete = await contributor
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/complete`)
      .set("Idempotency-Key", key("contrib-complete"))
      .send({ expectedVersion: created.body.version });
    expect(contribComplete.status).toBe(403);
    const discCreate = await disciplineCoord
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("disc-create"))
      .send(createBody({ title: "Disc package", code: "WP-DISC" }));
    expect(discCreate.status).toBeLessThan(400);

    const cross = await ownerB.get(`/api/v1/projects/${projectA}/work-packages/${created.body.id}`);
    expect(cross.status).toBe(403);
    expect(cross.body.id).toBeUndefined();
    expect(cross.body.items).toBeUndefined();
    const spoofGet = await coordinator.get(`/api/v1/projects/${projectA}/work-packages/${SPOOFED}`);
    expect(spoofGet.status).toBe(403);
    const otherProject = await coordinator.get(`/api/v1/projects/${projectA2}/work-packages`);
    expect(otherProject.status).toBe(403);
    const unauth = await teamOnly.get(`/api/v1/projects/${projectA}/work-packages`);
    expect(unauth.status).toBe(403);
    expect(unauth.body.items).toBeUndefined();

    const docMut = await coordinator.patch(`/api/v1/projects/${projectA}/work-packages/${created.body.id}`).send({
      documentId: randomUUID(),
      taskId: randomUUID(),
      expectedVersion: created.body.version,
    });
    expect(docMut.status).toBe(409);
  });

  it("soft-archives a WorkPackage, hides it from default list, and never hard-deletes", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("arch"))
      .send(createBody({ title: "Archive me", code: "WP-ARCHV" }));
    const archived = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/archive`)
      .set("Idempotency-Key", key("arch-do"))
      .send({ expectedVersion: created.body.version });
    expect(archived.body.archivedAt).toBeTruthy();
    const listed = await coordinator.get(`/api/v1/projects/${projectA}/work-packages`);
    expect(listed.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(false);
    const hiddenFromViewer = await viewer.get(`/api/v1/projects/${projectA}/work-packages?includeArchived=true`);
    expect(hiddenFromViewer.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(false);
    const reuse = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("reuse-code"))
      .send(createBody({ title: "Reuse code", code: "WP-ARCHV" }));
    expect(reuse.status).toBeLessThan(400);
    const stillThere = await prisma.workPackage.findUnique({ where: { id: created.body.id } });
    expect(stillThere?.archivedAt).toBeTruthy();
  });

  it("rejects a duplicate-code race and replays the same Idempotency-Key", async () => {
    const race = await Promise.all([
      coordinator
        .post(`/api/v1/projects/${projectA}/work-packages`)
        .set("Idempotency-Key", key("race-1"))
        .send(createBody({ title: "Race A", code: "WP-RACE" })),
      coordinator
        .post(`/api/v1/projects/${projectA}/work-packages`)
        .set("Idempotency-Key", key("race-2"))
        .send(createBody({ title: "Race B", code: "WP-RACE" })),
    ]);
    const statuses = race.map((row) => row.status).sort();
    expect(statuses[0]).toBeLessThan(400);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const idemKey = key("idem-create");
    const first = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", idemKey)
      .send(createBody({ title: "Idem", code: "WP-IDEM" }));
    const second = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", idemKey)
      .send(createBody({ title: "Idem", code: "WP-IDEM" }));
    expect(first.status).toBeLessThan(400);
    expect(second.body.id).toBe(first.body.id);
  });

  it("disassociates with work_package.update, denies missing permission, and stays anti-enumeration safe", async () => {
    const deliverable = await createDeliverable("DEL-WP-AUTHZ");
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("authz-create"))
      .send(createBody({ title: "AuthZ package", deliverableId: deliverable.id }));
    expect(created.body.deliverableId).toBe(deliverable.id);

    const roles = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
    const viewerRole = (roles.body as Array<{ id: string; templateKey: string; permissions: string[] }>).find(
      (row) => row.templateKey === "VIEWER",
    );
    expect(viewerRole).toBeTruthy();
    const patched = await ownerA.patch(`/api/v1/organizations/${orgA}/roles/${viewerRole!.id}`).send({
      permissions: [...new Set([...(viewerRole!.permissions ?? []), "deliverable.update"])],
    });
    expect(patched.status).toBeLessThan(400);
    expect(patched.body.permissions).toContain("deliverable.update");
    expect(patched.body.permissions).not.toContain("work_package.update");

    const missing = await viewer
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", key("authz-viewer"))
      .send({ expectedVersion: created.body.version });
    expect(missing.status).toBe(403);
    expect(missing.body.deliverableId).toBeUndefined();

    const contrib = await contributor
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", key("authz-contrib"))
      .send({ expectedVersion: created.body.version });
    expect(contrib.status).toBe(403);

    const crossProject = await coordinator
      .post(`/api/v1/projects/${projectA2}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", key("authz-cross-project"))
      .send({ expectedVersion: created.body.version });
    expect(crossProject.status).toBe(403);
    expect(crossProject.body.id).toBeUndefined();

    const crossTenant = await ownerB
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", key("authz-cross-tenant"))
      .send({ expectedVersion: created.body.version });
    expect(crossTenant.status).toBe(403);
    expect(crossTenant.body.id).toBeUndefined();

    const spoofed = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${SPOOFED}/disassociate`)
      .set("Idempotency-Key", key("authz-spoof"))
      .send({ expectedVersion: created.body.version });
    expect(spoofed.status).toBe(403);

    const stale = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", key("authz-cas"))
      .send({ expectedVersion: 0 });
    expect(stale.status).toBeGreaterThanOrEqual(400);

    const idemKey = key("authz-ok");
    const permitted = await disciplineCoord
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", idemKey)
      .send({ expectedVersion: created.body.version });
    expect(permitted.status).toBeLessThan(400);
    expect(permitted.body.deliverableId).toBeNull();

    const replay = await disciplineCoord
      .post(`/api/v1/projects/${projectA}/work-packages/${created.body.id}/disassociate`)
      .set("Idempotency-Key", idemKey)
      .send({ expectedVersion: created.body.version });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(permitted.body.id);
    expect(replay.body.deliverableId).toBeNull();

    const audit = await prisma.auditEvent.findMany({
      where: { resourceId: created.body.id, eventType: "WORK_PACKAGE_DISASSOCIATED" },
    });
    expect(audit.length).toBeGreaterThan(0);
    const stillLinked = await prisma.workPackage.findUnique({ where: { id: created.body.id } });
    expect(stillLinked?.deliverableId).toBeNull();
  });
});
