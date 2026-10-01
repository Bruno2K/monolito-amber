import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { HubCacheService } from "../../src/operations/hub.cache";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m36-${Date.now()}`;
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
let viewer: Agent;
let auditor: Agent;
let external: Agent;
let teamOnly: Agent;
let phaseA: { id: string };
let discArch: { id: string };
let ownerUserId: string;

beforeAll(async () => {
  db = await startTestDatabase();
  migrate(db.url);
  seed(db.url);
  app = await createTestApp(db.url);
  emails = app.get(EmailAdapter);
  prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await prisma.$connect();

  ownerA = request.agent(app.getHttpServer());
  const registered = await ownerA.post("/api/v1/auth/register").send({
    email: `owner-a-${suffix}@example.com`,
    password: PASSWORD,
    displayName: "Owner A",
  });
  expect(registered.status).toBeLessThan(400);
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

  coordinator = await inviteToProject("coordinator", "PROJECT_COORDINATOR", "VIEWER", projectA);
  viewer = await inviteToProject("viewer", "VIEWER", "VIEWER", projectA);
  auditor = await inviteToProject("auditor", "AUDITOR", "AUDITOR", projectA);
  external = await inviteToProject("external", "EXTERNAL_CONTRIBUTOR", "EXTERNAL_CONTRIBUTOR", projectA, "EXTERNAL");
  teamOnly = await inviteOrgOnly("teamonly", "VIEWER");

  discArch = (
    await ownerA
      .post(`/api/v1/organizations/${orgA}/disciplines`)
      .set("Idempotency-Key", key("disc-arch"))
      .send({ code: "ARCH", name: "Architecture" })
  ).body;
  phaseA = (
    await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("phase"))
      .send({ name: "Concept", sequence: 1 })
  ).body;
  const activated = await coordinator
    .post(`/api/v1/projects/${projectA}/phases/${phaseA.id}/activate`)
    .set("Idempotency-Key", key("phase-act"))
    .send({ expectedVersion: phaseA.version });
  expect(activated.status).toBeLessThan(400);
  const user = await prisma.user.findUnique({ where: { email: `owner-a-${suffix}@example.com` } });
  ownerUserId = user!.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

async function inviteOrgOnly(label: string, roleTemplateKey: string, membershipType = "INTERNAL"): Promise<Agent> {
  const email = `${label}-${suffix}@example.com`;
  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email,
    roleTemplateKey,
    membershipType,
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

async function inviteToProject(
  label: string,
  projectTemplate: string,
  orgTemplate: string,
  projectId: string,
  membershipType = "INTERNAL",
): Promise<Agent> {
  const agent = await inviteOrgOnly(label, orgTemplate, membershipType);
  const email = `${label}-${suffix}@example.com`;
  const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
  const row = members.body.find((item: { email: string }) => item.email === email);
  const added = await ownerA.post(`/api/v1/projects/${projectId}/members`).send({
    organizationMembershipId: row.id,
  });
  expect(added.status).toBeLessThan(400);
  const assigned = await ownerA
    .post(`/api/v1/projects/${projectId}/members/${added.body.id}/roles`)
    .send({ templateKey: projectTemplate });
  expect(assigned.status).toBeLessThan(400);
  return agent;
}

function key(label: string): string {
  return `${label}-${suffix}-${randomUUID()}`;
}

async function createDeliverable(code: string, overrides: Record<string, unknown> = {}) {
  const created = await coordinator
    .post(`/api/v1/projects/${projectA}/deliverables`)
    .set("Idempotency-Key", key(`del-${code}`))
    .send({
      phaseId: phaseA.id,
      disciplineId: discArch.id,
      code,
      title: code,
      ...overrides,
    });
  expect(created.status).toBeLessThan(400);
  return created.body as { id: string; version: number; status: string; code: string };
}

describe("M3.6 Operational Project Hub", () => {
  it("requires project.read and ACTIVE memberships; team-only and foreign project are denied", async () => {
    const anon = request.agent(app.getHttpServer());
    expect((await anon.get(`/api/v1/projects/${projectA}/hub`)).status).toBe(403);
    expect((await teamOnly.get(`/api/v1/projects/${projectA}/hub`)).status).toBe(403);
    expect((await coordinator.get(`/api/v1/projects/${SPOOFED}/hub`)).status).toBe(403);
    expect((await coordinator.get(`/api/v1/projects/${projectB}/hub`)).status).toBe(403);
    expect((await viewer.get(`/api/v1/projects/${projectA2}/hub`)).status).toBe(403);
  });

  it("returns derived signals with origin + derivation and does not invent OVERDUE status", async () => {
    const overdue = await createDeliverable("DEL-HUB-OVERDUE", {
      dueAt: "2020-01-01T00:00:00.000Z",
    });
    const owned = await createDeliverable("DEL-HUB-OWNED");
    const gap = await createDeliverable("DEL-HUB-GAP");
    const members = await ownerA.get(`/api/v1/projects/${projectA}/members`);
    const coordinatorPm = members.body.find((row: { email: string }) =>
      row.email.startsWith("coordinator-"),
    ) as { id: string };
    await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${owned.id}/assign`)
      .set("Idempotency-Key", key("assign-owned"))
      .send({ ownerProjectMembershipId: coordinatorPm.id, expectedVersion: owned.version });

    const blocked = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("wp-block"))
      .send({ phaseId: phaseA.id, title: "Blocked package", code: "WP-HUB-BLOCK" });
    const activatedWp = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${blocked.body.id}/activate`)
      .set("Idempotency-Key", key("wp-act"))
      .send({ expectedVersion: blocked.body.version });
    expect(activatedWp.status).toBeLessThan(400);
    const blockedWp = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages/${blocked.body.id}/block`)
      .set("Idempotency-Key", key("wp-blk"))
      .send({ blockedReason: "Waiting for survey", expectedVersion: activatedWp.body.version });
    expect(blockedWp.status).toBeLessThan(400);

    const lateWp = await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("wp-late"))
      .send({
        phaseId: phaseA.id,
        title: "Late package",
        code: "WP-HUB-LATE",
        dueAt: "2020-02-01T00:00:00.000Z",
      });
    expect(lateWp.status).toBeLessThan(400);

    await prisma.milestone.create({
      data: {
        organizationId: orgA,
        projectId: projectA,
        title: "Permit checkpoint",
        status: "PLANNED",
        targetDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
    });
    await prisma.document.create({
      data: { organizationId: orgA, projectId: projectA, code: `DOC-${suffix}`, title: "Brief" },
    });
    await prisma.gate.create({
      data: {
        organizationId: orgA,
        projectId: projectA,
        name: "Gate Concept",
        createdByUserId: ownerUserId,
      },
    });

    const hub = await coordinator.get(`/api/v1/projects/${projectA}/hub`);
    expect(hub.status).toBe(200);
    expect(hub.body.currentPhase.origin).toContain("operations.phases");
    expect(hub.body.currentPhase.derivation).toMatch(/ACTIVE/);
    expect(hub.body.currentPhase.value?.id).toBe(phaseA.id);
    expect(hub.body.deliverableCountsByStatus.origin).toContain("deliverables");
    expect(hub.body.deliverableCountsByStatus.counts.OVERDUE).toBeUndefined();
    expect(hub.body.deliverableCountsByStatus.counts.PLANNED).toBeGreaterThanOrEqual(2);
    expect(hub.body.overdueDeliverables.items.some((row: { id: string }) => row.id === overdue.id)).toBe(true);
    expect(hub.body.overdueDeliverables.origin).toContain("dueAt");
    expect(hub.body.blockedWorkPackages.items.some((row: { id: string }) => row.id === blocked.body.id)).toBe(true);
    expect(hub.body.lateWorkPackages.items.some((row: { id: string }) => row.id === lateWp.body.id)).toBe(true);
    expect(hub.body.ownerGaps.items.some((row: { id: string }) => row.id === gap.id)).toBe(true);
    expect(hub.body.upcomingMilestones.items.some((row: { title: string }) => row.title === "Permit checkpoint")).toBe(
      true,
    );
    expect(hub.body.relatedSources.sources.documents.count).toBeGreaterThanOrEqual(1);
    expect(hub.body.relatedSources.sources.gates.count).toBeGreaterThanOrEqual(1);
    expect(hub.body.links.deliverables).toBe(`/projects/${projectA}/deliverables`);
    expect(hub.body.stale).toBe(false);
  });

  it("counts only the authorized project and omits hidden sibling/foreign items without placeholders", async () => {
    const hidden = await prisma.deliverable.create({
      data: {
        organizationId: orgA,
        projectId: projectA2,
        phaseId: (
          await prisma.phase.create({
            data: {
              organizationId: orgA,
              projectId: projectA2,
              name: "Hidden",
              sequence: 1,
              status: "PLANNED",
              createdBy: ownerUserId,
            },
          })
        ).id,
        disciplineId: discArch.id,
        code: `HIDDEN-${suffix}`,
        title: "Should not leak",
        status: "PLANNED",
        dueAt: new Date("2019-01-01T00:00:00.000Z"),
      },
    });
    const foreignPhase = await prisma.phase.create({
      data: {
        organizationId: orgB,
        projectId: projectB,
        name: "Foreign",
        sequence: 1,
        status: "ACTIVE",
        createdBy: ownerUserId,
      },
    });
    const foreignDisc = await prisma.discipline.create({
      data: { organizationId: orgB, code: `FOR-${suffix.slice(-6)}`, name: "Foreign" },
    });
    await prisma.deliverable.create({
      data: {
        organizationId: orgB,
        projectId: projectB,
        phaseId: foreignPhase.id,
        disciplineId: foreignDisc.id,
        code: `FOR-${suffix}`,
        title: "Other org",
        status: "IN_PROGRESS",
      },
    });

    const hub = await coordinator.get(`/api/v1/projects/${projectA}/hub`);
    expect(hub.status).toBe(200);
    const ids = JSON.stringify(hub.body);
    expect(ids).not.toContain(hidden.id);
    expect(ids).not.toContain("Should not leak");
    const returned = Object.values(hub.body.deliverableCountsByStatus.counts as Record<string, number>).reduce(
      (sum, value) => sum + value,
      0,
    );
    const global = await prisma.deliverable.count();
    const authorized = await prisma.deliverable.count({ where: { projectId: projectA, archivedAt: null } });
    expect(returned).toBe(authorized);
    expect(global).toBeGreaterThan(returned);
  });

  it("omits unauthorized related sources (no placeholder / no count leak) for viewer, auditor, and external", async () => {
    const viewerHub = await viewer.get(`/api/v1/projects/${projectA}/hub`);
    expect(viewerHub.status).toBe(200);
    expect(viewerHub.body.relatedSources.sources.documents).toBeTruthy();
    expect(viewerHub.body.relatedSources.sources.gates).toBeTruthy();
    expect(viewerHub.body.lastMaterialActivity).toBeNull();

    const auditorHub = await auditor.get(`/api/v1/projects/${projectA}/hub`);
    expect(auditorHub.status).toBe(200);
    expect(auditorHub.body.relatedSources.sources.documents).toBeUndefined();
    expect(auditorHub.body.relatedSources.sources.gates).toBeUndefined();
    expect(auditorHub.body.lastMaterialActivity).toBeTruthy();
    expect(auditorHub.body.lastMaterialActivity.origin).toContain("audit");

    const externalHub = await external.get(`/api/v1/projects/${projectA}/hub`);
    expect(externalHub.status).toBe(200);
    expect(externalHub.body.relatedSources.sources.documents).toBeTruthy();
    expect(externalHub.body.relatedSources.sources.gates).toBeUndefined();
    expect(externalHub.body.lastMaterialActivity).toBeNull();
    expect((await external.get(`/api/v1/projects/${projectA2}/hub`)).status).toBe(403);
  });

  it("revokes immediately after cache warm and does not mutate domain sources via Hub writes", async () => {
    const cache = app.get(HubCacheService);
    const warm = await viewer.get(`/api/v1/projects/${projectA}/hub`);
    expect(warm.status).toBe(200);
    expect(cache.get(cache.key({ projectId: projectA, userId: "x", permissionFingerprint: "y" }))).toBeNull();

    const members = await ownerA.get(`/api/v1/projects/${projectA}/members`);
    const viewerRow = members.body.find((row: { email: string }) => row.email.startsWith("viewer-"));
    const revoked = await ownerA.patch(`/api/v1/projects/${projectA}/members/${viewerRow.id}`).send({ status: "REMOVED" });
    expect(revoked.status).toBeLessThan(400);
    expect((await viewer.get(`/api/v1/projects/${projectA}/hub`)).status).toBe(403);

    const posted = await coordinator.post(`/api/v1/projects/${projectA}/hub`).send({ health: "OK" });
    expect([404, 405]).toContain(posted.status);
    const patched = await coordinator.patch(`/api/v1/projects/${projectA}/hub`).send({ counts: { PLANNED: 0 } });
    expect([404, 405]).toContain(patched.status);
    const after = await prisma.deliverable.count({ where: { projectId: projectA } });
    expect(after).toBeGreaterThan(0);
  });

  it("marks stale when a cached snapshot lags and rebuilds by default", async () => {
    const first = await coordinator.get(`/api/v1/projects/${projectA}/hub`);
    expect(first.status).toBe(200);
    expect(first.body.freshness.servedFromCache).toBe(false);
    await prisma.deliverable.updateMany({
      where: { projectId: projectA, code: "DEL-HUB-GAP" },
      data: { title: "Gap after cache" },
    });
    const stale = await coordinator.get(`/api/v1/projects/${projectA}/hub?refresh=false`);
    expect(stale.status).toBe(200);
    expect(stale.body.stale).toBe(true);
    expect(stale.body.freshness.stale).toBe(true);
    expect(stale.body.freshness.servedFromCache).toBe(true);
    const fresh = await coordinator.get(`/api/v1/projects/${projectA}/hub`);
    expect(fresh.status).toBe(200);
    expect(fresh.body.stale).toBe(false);
    expect(JSON.stringify(fresh.body)).toContain("Gap after cache");
  });

  it("re-authorizes drill-down at source APIs and serves empty projects without leaking other tenants", async () => {
    const emptyProject = (await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Empty ${suffix}` }))
      .body.project.id;
    const empty = await ownerA.get(`/api/v1/projects/${emptyProject}/hub`);
    expect(empty.status).toBe(200);
    expect(empty.body.currentPhase.value).toBeNull();
    expect(empty.body.overdueDeliverables.returned).toBe(0);
    expect(empty.body.deliverableCountsByStatus.counts.PLANNED).toBe(0);

    const hub = await coordinator.get(`/api/v1/projects/${projectA}/hub`);
    const overdueId = hub.body.overdueDeliverables.items[0]?.id as string | undefined;
    if (overdueId) {
      expect((await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${overdueId}`)).status).toBe(200);
      expect((await ownerB.get(`/api/v1/projects/${projectA}/deliverables/${overdueId}`)).status).toBe(403);
    }
  });

  it("performance: representative dataset is bounded (no N+1)", async () => {
    const cache = app.get(HubCacheService);
    const perfPhase = await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("perf-phase"))
      .send({ name: "Perf", sequence: 9 });
    expect(perfPhase.status).toBeLessThan(400);
    const rows = Array.from({ length: 80 }, (_, index) => ({
      organizationId: orgA,
      projectId: projectA,
      phaseId: perfPhase.body.id,
      disciplineId: discArch.id,
      code: `PERF-${suffix}-${String(index).padStart(3, "0")}`,
      title: `Perf ${index}`,
      status: index % 5 === 0 ? "DELIVERED" : "PLANNED",
      dueAt: index % 3 === 0 ? new Date("2021-01-01T00:00:00.000Z") : null,
    }));
    await prisma.deliverable.createMany({ data: rows });
    await prisma.workPackage.createMany({
      data: rows.map((row, index) => ({
        organizationId: orgA,
        projectId: projectA,
        phaseId: perfPhase.body.id,
        title: `WP perf ${index}`,
        code: `WP-PERF-${suffix}-${index}`,
        status: index % 7 === 0 ? "BLOCKED" : "PLANNED",
        blockedReason: index % 7 === 0 ? "perf block" : null,
        dueAt: index % 4 === 0 ? new Date("2021-01-01T00:00:00.000Z") : null,
      })),
    });

    cache.clear();
    const first = await coordinator.get(`/api/v1/projects/${projectA}/hub?limit=20`);
    cache.clear();
    const second = await coordinator.get(`/api/v1/projects/${projectA}/hub?limit=20`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.observability.queryCount).toBeLessThanOrEqual(16);
    expect(second.body.observability.queryCount).toBe(first.body.observability.queryCount);
    expect(first.body.observability.elapsedMs).toBeLessThan(2000);
    expect(first.body.overdueDeliverables.items.length).toBeLessThanOrEqual(20);
    const authorized = await prisma.deliverable.count({ where: { projectId: projectA, archivedAt: null } });
    const returned = Object.values(first.body.deliverableCountsByStatus.counts as Record<string, number>).reduce(
      (sum, value) => sum + value,
      0,
    );
    expect(returned).toBe(authorized);
    expect(authorized).toBeGreaterThanOrEqual(80);
  });
});
