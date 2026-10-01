import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  payloadLeaksHiddenCount,
  progressPercent100MarksTaskDone,
  taskCompleteCascadesToDeliverable,
  taskCompleteCascadesToWorkPackage,
} from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { HubCacheService } from "../../src/operations/hub.cache";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m37-${Date.now()}`;
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
let viewer: Agent;
let auditor: Agent;
let teamOnly: Agent;
let phaseA: { id: string };
let phaseA2: { id: string };
let discArch: { id: string };
let deliverableA: { id: string; version: number; status: string };
let deliverableB: { id: string };
let workPackageA: { id: string; status: string; version: number };
let documentA: { id: string; status: string; version: number; currentRevisionId: string | null };
let documentHidden: { id: string };

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
  disciplineCoord = await inviteToProject("discipline", "DISCIPLINE_COORDINATOR", "VIEWER", projectA);
  viewer = await inviteToProject("viewer", "VIEWER", "VIEWER", projectA);
  auditor = await inviteToProject("auditor", "AUDITOR", "AUDITOR", projectA);
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
  phaseA2 = (
    await coordinator
      .post(`/api/v1/projects/${projectA}/phases`)
      .set("Idempotency-Key", key("phase-2"))
      .send({ name: "Develop", sequence: 2 })
  ).body;

  deliverableA = await createDeliverable("DEL-M37-A");
  deliverableB = await createDeliverable("DEL-M37-B", { phaseId: phaseA2.id });
  const wp = await coordinator
    .post(`/api/v1/projects/${projectA}/work-packages`)
    .set("Idempotency-Key", key("wp"))
    .send({ phaseId: phaseA.id, deliverableId: deliverableA.id, title: "Outline" });
  expect(wp.status).toBeLessThan(400);
  workPackageA = wp.body;

  const createdDoc = await disciplineCoord.post(`/api/v1/projects/${projectA}/documents`).send({
    title: "Concept brief",
    code: `DOC-M37-${suffix.slice(-6)}`,
  });
  expect(createdDoc.status).toBeLessThan(400);
  documentA = createdDoc.body;

  documentHidden = await prisma.document.create({
    data: {
      organizationId: orgA,
      projectId: projectA2,
      title: "Hidden plant doc",
      code: `DOC-HID-${suffix.slice(-6)}`,
      status: "ACTIVE",
    },
  });
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
  return created.body as { id: string; version: number; status: string };
}

describe("M3.7 Cross-Domain Traceability", () => {
  it("denies cross-tenant/project context and team-only access (no Project membership)", async () => {
    const anon = request.agent(app.getHttpServer());
    expect([401, 403]).toContain(
      (await anon.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/context`)).status,
    );
    expect((await teamOnly.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/context`)).status).toBe(
      403,
    );
    expect((await coordinator.get(`/api/v1/projects/${projectB}/deliverables/${deliverableA.id}/context`)).status).toBe(
      403,
    );
    expect((await ownerB.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/context`)).status).toBe(403);
    expect((await coordinator.get(`/api/v1/projects/${SPOOFED}/deliverables/${deliverableA.id}/context`)).status).toBe(
      403,
    );
  });

  it("rejects inconsistent Task phase/deliverable/WP chains without rewriting", async () => {
    const badWp = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("task-bad-wp"))
      .send({
        title: "Bad chain",
        workPackageId: workPackageA.id,
        deliverableId: deliverableB.id,
      });
    expect(badWp.status).toBeGreaterThanOrEqual(400);

    const badPhase = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("task-bad-phase"))
      .send({
        title: "Bad phase",
        deliverableId: deliverableA.id,
        phaseId: phaseA2.id,
      });
    expect(badPhase.status).toBeGreaterThanOrEqual(400);

    const cross = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("task-cross"))
      .send({ title: "Cross", phaseId: SPOOFED });
    expect(cross.status).toBe(403);
  });

  it("stores additive Task/Milestone refs on a consistent chain", async () => {
    const task = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("task-ok"))
      .send({
        title: "Draft outline",
        workPackageId: workPackageA.id,
        plannedStartAt: "2026-02-01T00:00:00.000Z",
        estimatedMinutes: 120,
        progressPercent: 10,
      });
    expect(task.status).toBeLessThan(400);
    expect(task.body.workPackageId).toBe(workPackageA.id);
    expect(task.body.deliverableId).toBe(deliverableA.id);
    expect(task.body.phaseId).toBe(phaseA.id);
    expect(task.body.progressPercent).toBe(10);

    const listed = await coordinator.get(
      `/api/v1/projects/${projectA}/tasks?workPackageId=${encodeURIComponent(workPackageA.id)}`,
    );
    expect(listed.status).toBeLessThan(400);
    expect(listed.body.some((row: { id: string }) => row.id === task.body.id)).toBe(true);

    const milestone = await coordinator
      .post(`/api/v1/projects/${projectA}/milestones`)
      .set("Idempotency-Key", key("ms-ok"))
      .send({ title: "Concept freeze", deliverableId: deliverableA.id });
    expect(milestone.status).toBeLessThan(400);
    expect(milestone.body.deliverableId).toBe(deliverableA.id);
    expect(milestone.body.phaseId).toBe(phaseA.id);
  });

  it("links and unlinks Document evidence without mutating Document/Revision; both-side AuthZ", async () => {
    const before = await prisma.document.findUnique({ where: { id: documentA.id } });
    const linked = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/documents`)
      .set("Idempotency-Key", key("doc-link"))
      .send({ documentId: documentA.id });
    expect(linked.status).toBeLessThan(400);
    const after = await prisma.document.findUnique({ where: { id: documentA.id } });
    expect(after?.status).toBe(before?.status);
    expect(after?.version).toBe(before?.version);
    expect(after?.currentRevisionId).toBe(before?.currentRevisionId);

    const mutateStatus = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/documents`)
      .set("Idempotency-Key", key("doc-status"))
      .send({ documentId: documentA.id, status: "ARCHIVED" });
    expect(mutateStatus.status).toBeGreaterThanOrEqual(400);

    const guessed = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/documents`)
      .set("Idempotency-Key", key("doc-guess"))
      .send({ documentId: documentHidden.id });
    expect(guessed.status).toBe(403);

    const viewerLink = await viewer
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/documents`)
      .set("Idempotency-Key", key("doc-viewer"))
      .send({ documentId: documentA.id });
    expect(viewerLink.status).toBe(403);

    const events = await prisma.auditEvent.findMany({
      where: { eventType: "DOCUMENT_DELIVERABLE_LINKED", projectId: projectA },
    });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      expect(Object.keys(payload).every((key) => /Id$/i.test(key) || key === "from" || key === "to")).toBe(true);
      expect(JSON.stringify(payload)).not.toMatch(/Concept brief|bytes|checksum/i);
    }

    const unlinked = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/documents/${documentA.id}/unlink`)
      .set("Idempotency-Key", key("doc-unlink"));
    expect(unlinked.status).toBeLessThan(400);
    const afterUnlink = await prisma.document.findUnique({ where: { id: documentA.id } });
    expect(afterUnlink?.status).toBe(before?.status);

    const relink = await coordinator
      .post(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/documents`)
      .set("Idempotency-Key", key("doc-relink"))
      .send({ documentId: documentA.id });
    expect(relink.status).toBeLessThan(400);
  });

  it("omits unauthorized context sections without count/metadata leak", async () => {
    await coordinator
      .post(`/api/v1/projects/${projectA}/gates`)
      .set("Idempotency-Key", key("gate"))
      .send({ name: "Concept gate" });

    const full = await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/context`);
    expect(full.status).toBeLessThan(400);
    expect(full.body).toHaveProperty("documents");
    expect(full.body).toHaveProperty("gates");
    expect(full.body).toHaveProperty("tasks");
    expect(full.body).toHaveProperty("milestones");
    expect(full.body).toHaveProperty("issues");
    expect(payloadLeaksHiddenCount(full.body)).toBe(false);

    const auditorCtx = await auditor.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/context`);
    expect(auditorCtx.status).toBeLessThan(400);
    expect(auditorCtx.body).not.toHaveProperty("documents");
    expect(auditorCtx.body).not.toHaveProperty("gates");
    expect(auditorCtx.body).toHaveProperty("tasks");
    expect(JSON.stringify(auditorCtx.body)).not.toMatch(/1 item oculto|item oculto|hidden item/i);
    expect(auditorCtx.body.hiddenCount).toBeUndefined();
    expect(auditorCtx.body.documentsCount).toBeUndefined();

    const wpCtx = await coordinator.get(`/api/v1/projects/${projectA}/work-packages/${workPackageA.id}/context`);
    expect(wpCtx.status).toBeLessThan(400);
    expect(wpCtx.body.workPackageId).toBe(workPackageA.id);
  });

  it("does not cascade Task complete or progressPercent 100 onto parents", async () => {
    expect(progressPercent100MarksTaskDone()).toBe(false);
    expect(taskCompleteCascadesToWorkPackage()).toBe(false);
    expect(taskCompleteCascadesToDeliverable()).toBe(false);

    const task = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("task-cascade"))
      .send({
        title: "Finish outline",
        workPackageId: workPackageA.id,
        progressPercent: 40,
      });
    expect(task.status).toBeLessThan(400);

    const progressed = await coordinator.patch(`/api/v1/projects/${projectA}/tasks/${task.body.id}`).send({
      progressPercent: 100,
      expectedVersion: task.body.version,
    });
    expect(progressed.status).toBeLessThan(400);
    expect(progressed.body.progressPercent).toBe(100);
    expect(progressed.body.status).toBe("TODO");

    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${task.body.id}/status`)
      .set("Idempotency-Key", key("task-start"))
      .send({ status: "IN_PROGRESS", expectedVersion: progressed.body.version });
    expect(started.status).toBeLessThan(400);
    const done = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${task.body.id}/complete`)
      .set("Idempotency-Key", key("task-done"))
      .send({ expectedVersion: started.body.version });
    expect(done.status).toBeLessThan(400);
    expect(done.body.status).toBe("DONE");

    const wp = await coordinator.get(`/api/v1/projects/${projectA}/work-packages/${workPackageA.id}`);
    const del = await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}`);
    expect(wp.body.status).not.toBe("DONE");
    expect(del.body.status).not.toBe("DELIVERED");
  });

  it("exposes authorized delivery context on Document/Issue reads and keeps Issue ≠ Task", async () => {
    const issue = await coordinator
      .post(`/api/v1/projects/${projectA}/issues`)
      .set("Idempotency-Key", key("issue"))
      .send({ title: "Clash" });
    expect(issue.status).toBeLessThan(400);
    const task = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("task-issue"))
      .send({
        title: "Resolve clash",
        issueId: issue.body.id,
        deliverableId: deliverableA.id,
      });
    expect(task.status).toBeLessThan(400);
    expect(task.body.id).not.toBe(issue.body.id);

    const gotIssue = await coordinator.get(`/api/v1/projects/${projectA}/issues/${issue.body.id}`);
    expect(gotIssue.status).toBeLessThan(400);
    expect(gotIssue.body.deliveryContext).toEqual(
      expect.arrayContaining([expect.objectContaining({ taskId: task.body.id, deliverableId: deliverableA.id })]),
    );

    const gotDoc = await coordinator.get(`/api/v1/projects/${projectA}/documents/${documentA.id}`);
    expect(gotDoc.status).toBeLessThan(400);
    expect(gotDoc.body.status).toBe("ACTIVE");
    expect(gotDoc.body.deliveryContext).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: deliverableA.id })]),
    );
  });

  it("reauthorizes after membership removal (no stale context after revoke)", async () => {
    const hub = app.get(HubCacheService);
    await viewer.get(`/api/v1/projects/${projectA}/hub`);
    const warm = await viewer.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/context`);
    expect(warm.status).toBeLessThan(400);

    const members = await ownerA.get(`/api/v1/projects/${projectA}/members`);
    const viewerRow = members.body.find((row: { email: string }) => row.email.startsWith("viewer-"));
    const revoked = await ownerA
      .patch(`/api/v1/projects/${projectA}/members/${viewerRow.id}`)
      .send({ status: "REMOVED" });
    expect(revoked.status).toBeLessThan(400);
    hub.invalidateProject(projectA);

    expect((await viewer.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}/context`)).status).toBe(403);
    expect((await viewer.get(`/api/v1/projects/${projectA}/hub`)).status).toBe(403);
    expect((await viewer.get(`/api/v1/projects/${projectA}/deliverables/${deliverableA.id}`)).status).toBe(403);
  });
});
