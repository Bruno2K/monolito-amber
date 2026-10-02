import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m43-${Date.now()}`;

type Agent = ReturnType<typeof request.agent>;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;
let orgA: string;
let orgB: string;
let projectA: string;
let projectB: string;
let archiveProject: string;
let ownerA: Agent;
let ownerB: Agent;
let coordinator: Agent;
let contributor: Agent;
let viewer: Agent;
let external: Agent;
let contributorUserId: string;
let issueId: string;
let milestoneId: string;
let phaseId: string;
let deliverableId: string;
let workPackageId: string;
let gateId: string;

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

  projectA = (await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Tower ${suffix}` })).body.project.id;
  projectB = (await ownerB.post(`/api/v1/organizations/${orgB}/projects`).send({ name: `Plant ${suffix}` })).body.project.id;
  archiveProject = (await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Archive ${suffix}` })).body.project.id;

  coordinator = await inviteToProject("coordinator", "PROJECT_COORDINATOR");
  contributor = await inviteToProject("contributor", "CONTRIBUTOR_DESIGNER");
  viewer = await inviteToProject("viewer", "VIEWER");
  external = await inviteToProject("external", "EXTERNAL_CONTRIBUTOR", "EXTERNAL");
  contributorUserId = (await contributor.get("/api/v1/auth/session")).body.userId;

  const issue = await coordinator
    .post(`/api/v1/projects/${projectA}/issues`)
    .set("Idempotency-Key", `iss-${suffix}`)
    .send({ title: "Grid clash", severity: "HIGH", priority: "NORMAL" });
  issueId = issue.body.id;

  const milestone = await coordinator
    .post(`/api/v1/projects/${projectA}/milestones`)
    .set("Idempotency-Key", `ms-${suffix}`)
    .send({ title: "Concept freeze" });
  milestoneId = milestone.body.id;

  const phase = await coordinator
    .post(`/api/v1/projects/${projectA}/phases`)
    .set("Idempotency-Key", `ph-${suffix}`)
    .send({ name: "Concept", sequence: 1 });
  expect(phase.status).toBeLessThan(400);
  phaseId = phase.body.id;

  const discipline = await ownerA
    .post(`/api/v1/organizations/${orgA}/disciplines`)
    .set("Idempotency-Key", `disc-${suffix}`)
    .send({ code: `AR${suffix.slice(-4)}`, name: "Architecture" });
  expect(discipline.status).toBeLessThan(400);

  const deliverable = await coordinator
    .post(`/api/v1/projects/${projectA}/deliverables`)
    .set("Idempotency-Key", `del-${suffix}`)
    .send({
      code: `D${suffix.slice(-6)}`,
      title: "Pack",
      phaseId,
      disciplineId: discipline.body.id,
    });
  expect(deliverable.status).toBeLessThan(400);
  deliverableId = deliverable.body.id;

  const workPackage = await coordinator
    .post(`/api/v1/projects/${projectA}/work-packages`)
    .set("Idempotency-Key", `wp-${suffix}`)
    .send({ title: "Outline", phaseId, deliverableId });
  expect(workPackage.status).toBeLessThan(400);
  workPackageId = workPackage.body.id;

  const gate = await ownerA
    .post(`/api/v1/projects/${projectA}/gates`)
    .set("Idempotency-Key", `gate-${suffix}`)
    .send({ name: "Concept gate" });
  gateId = gate.body?.id ?? "";
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

async function inviteToProject(
  label: string,
  templateKey: string,
  membershipType = "INTERNAL",
): Promise<Agent> {
  const email = `${label}-${suffix}@example.com`;
  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email,
    roleTemplateKey: membershipType === "EXTERNAL" ? "EXTERNAL_CONTRIBUTOR" : "VIEWER",
    membershipType,
  });
  const invite = emails.sent.filter((message) => message.to === email).at(-1);
  const agent = request.agent(app.getHttpServer());
  await agent.post("/api/v1/invitations/accept").send({
    token: invite?.token,
    password: PASSWORD,
    displayName: label,
  });
  const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
  const row = members.body.find((item: { email: string }) => item.email === email);
  const added = await ownerA.post(`/api/v1/projects/${projectA}/members`).send({
    organizationMembershipId: row.id,
  });
  expect(added.status).toBeLessThan(400);
  const assigned = await ownerA
    .post(`/api/v1/projects/${projectA}/members/${added.body.id}/roles`)
    .send({ templateKey });
  expect(assigned.status).toBeLessThan(400);
  return agent;
}

async function taskOf(agent: Agent, taskId: string) {
  const res = await agent.get(`/api/v1/projects/${projectA}/tasks/${taskId}`);
  expect(res.status).toBe(200);
  return res.body as { version: number; status: string; progressPercent: number | null };
}

function key(label: string): string {
  return `${label}-${suffix}`;
}

describe("M4.3 Task operations", () => {
  it("M4.3-HTTP-01 create + assign + start/block/unblock/complete require key and expectedVersion", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-happy"))
      .send({
        title: "Operate grid",
        issueId,
        milestoneId,
        phaseId,
        deliverableId,
        workPackageId,
        priority: "HIGH",
        plannedStartAt: "2026-02-01T00:00:00.000Z",
        dueDate: "2026-03-01T00:00:00.000Z",
        estimatedMinutes: 90,
        progressPercent: 10,
      });
    expect(created.status).toBeLessThan(400);
    expect(created.body.status).toBe("TODO");
    expect(created.body.issueId).toBe(issueId);
    const taskId = created.body.id as string;

    const missingKey = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/assign`)
      .send({ assigneeUserId: contributorUserId, expectedVersion: created.body.version });
    expect(missingKey.status).toBeGreaterThanOrEqual(400);

    const missingVersion = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/assign`)
      .set("Idempotency-Key", key("asg-no-ver"))
      .send({ assigneeUserId: contributorUserId });
    expect(missingVersion.status).toBeGreaterThanOrEqual(400);

    const assigned = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/assign`)
      .set("Idempotency-Key", key("asg-ok"))
      .send({ assigneeUserId: contributorUserId, expectedVersion: created.body.version });
    expect(assigned.status).toBeLessThan(400);
    expect(assigned.body.assigneeUserId).toBe(contributorUserId);

    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/start`)
      .set("Idempotency-Key", key("start-ok"))
      .send({ expectedVersion: assigned.body.version });
    expect(started.status).toBeLessThan(400);
    expect(started.body.status).toBe("IN_PROGRESS");

    const blocked = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/block`)
      .set("Idempotency-Key", key("block-ok"))
      .send({ expectedVersion: started.body.version, blockedReason: "Waiting for survey" });
    expect(blocked.status).toBeLessThan(400);
    expect(blocked.body.status).toBe("BLOCKED");
    expect(blocked.body.blockedReason).toBe("Waiting for survey");

    const unblocked = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/unblock`)
      .set("Idempotency-Key", key("unblock-ok"))
      .send({ expectedVersion: blocked.body.version });
    expect(unblocked.status).toBeLessThan(400);
    expect(unblocked.body.status).toBe("IN_PROGRESS");
    expect(unblocked.body.blockedReason).toBeNull();

    const done = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/complete`)
      .set("Idempotency-Key", key("done-ok"))
      .send({ expectedVersion: unblocked.body.version });
    expect(done.status).toBeLessThan(400);
    expect(done.body.status).toBe("DONE");
    expect(done.body.completedAt).toBeTruthy();

    const history = await coordinator.get(`/api/v1/projects/${projectA}/tasks/${taskId}/history`);
    expect(history.status).toBe(200);
    const types = (history.body as Array<{ eventType: string }>).map((row) => row.eventType);
    expect(types).toEqual(expect.arrayContaining([
      "TASK_CREATED",
      "TASK_ASSIGNED",
      "TASK_STATUS_CHANGED",
      "TASK_BLOCKED",
      "TASK_UNBLOCKED",
      "TASK_COMPLETED",
    ]));
  });

  it("M4.3-HTTP-02 BLOCKED without reason rejected; DONE requires task.complete; viewer cannot complete", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-block"))
      .send({ title: "Needs reason" });
    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/start`)
      .set("Idempotency-Key", key("start-block"))
      .send({ expectedVersion: created.body.version });
    expect(started.status).toBeLessThan(400);

    const empty = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/block`)
      .set("Idempotency-Key", key("block-empty"))
      .send({ expectedVersion: started.body.version, blockedReason: "   " });
    expect(empty.status).toBe(409);
    expect(empty.body.code).toBe("PLANNING_STATE");

    const skipFromTodo = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-skip-done"))
      .send({ title: "Cannot skip to done" });
    const skipCurrent = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${skipFromTodo.body.id}/status`)
      .set("Idempotency-Key", key("todo-done"))
      .send({ status: "DONE", expectedVersion: skipFromTodo.body.version });
    expect(skipCurrent.status).toBe(409);
    expect((await taskOf(coordinator, skipFromTodo.body.id)).status).toBe("TODO");

    const viewerComplete = await viewer
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/complete`)
      .set("Idempotency-Key", key("viewer-done"))
      .send({ expectedVersion: started.body.version });
    expect(viewerComplete.status).toBe(403);
  });

  it("M4.3-HTTP-03 dates/progress do not write status; progress 100% ≠ DONE; PATCH cannot set status", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-progress"))
      .send({ title: "Progress only", progressPercent: 20 });
    const patched = await coordinator.patch(`/api/v1/projects/${projectA}/tasks/${created.body.id}`).send({
      progressPercent: 100,
      dueDate: "2000-01-01T00:00:00.000Z",
      expectedVersion: created.body.version,
    });
    expect(patched.status).toBeLessThan(400);
    expect(patched.body.progressPercent).toBe(100);
    expect(patched.body.status).toBe("TODO");
    expect(patched.body.late).toBe(true);

    const sneak = await coordinator.patch(`/api/v1/projects/${projectA}/tasks/${created.body.id}`).send({
      status: "DONE",
      expectedVersion: patched.body.version,
    });
    expect(sneak.status).toBeGreaterThanOrEqual(400);
    expect((await taskOf(coordinator, created.body.id)).status).toBe("TODO");
  });

  it("M4.3-HTTP-04 complete/cancel never cascade sibling aggregates", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-cascade"))
      .send({ title: "No cascade", issueId, milestoneId, phaseId, deliverableId, workPackageId });
    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/start`)
      .set("Idempotency-Key", key("start-cascade"))
      .send({ expectedVersion: created.body.version });
    const done = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/complete`)
      .set("Idempotency-Key", key("done-cascade"))
      .send({ expectedVersion: started.body.version });
    expect(done.status).toBeLessThan(400);

    const cancelled = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-cancel"))
      .send({ title: "Cancel sibling", issueId, milestoneId });
    const cancel = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${cancelled.body.id}/cancel`)
      .set("Idempotency-Key", key("cancel-ok"))
      .send({ expectedVersion: cancelled.body.version });
    expect(cancel.status).toBeLessThan(400);
    expect(cancel.body.status).toBe("CANCELLED");

    expect((await coordinator.get(`/api/v1/projects/${projectA}/issues/${issueId}`)).body.status).toBe("OPEN");
    expect((await coordinator.get(`/api/v1/projects/${projectA}/milestones/${milestoneId}`)).body.recordedStatus).toBe("PLANNED");
    expect((await coordinator.get(`/api/v1/projects/${projectA}/phases/${phaseId}`)).body.status).not.toBe("COMPLETED");
    expect((await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${deliverableId}`)).body.status).not.toBe("DELIVERED");
    expect((await coordinator.get(`/api/v1/projects/${projectA}/work-packages/${workPackageId}`)).body.status).not.toBe("DONE");
    if (gateId) {
      const gate = await ownerA.get(`/api/v1/projects/${projectA}/gates/${gateId}`);
      if (gate.status < 400) {
        expect(gate.body.status).not.toMatch(/RELEASED/);
      }
    }

    const completedAudit = await prisma.auditEvent.findFirst({
      where: { resourceId: created.body.id, eventType: "TASK_COMPLETED" },
    });
    const payload = (completedAudit?.payload ?? {}) as Record<string, unknown>;
    expect(payload.autoResolvedIssue).toBe(false);
    expect(payload.autoAchievedMilestone).toBe(false);
  });

  it("M4.3-ADV-01 stale expectedVersion fails closed", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-cas"))
      .send({ title: "CAS" });
    const stale = await coordinator.patch(`/api/v1/projects/${projectA}/tasks/${created.body.id}`).send({
      title: "lost update",
      expectedVersion: 999,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("OPTIMISTIC_LOCK");
    expect((await taskOf(coordinator, created.body.id)).status).toBe("TODO");
  });

  it("M4.5-ADV concurrent start with stale version is OPTIMISTIC_LOCK, not same-status", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-kanban-cas"))
      .send({ title: "Kanban CAS" });
    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/start`)
      .set("Idempotency-Key", key("start-kanban-cas"))
      .send({ expectedVersion: created.body.version });
    expect(started.status).toBeLessThan(400);
    const stale = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/start`)
      .set("Idempotency-Key", key("start-kanban-cas-stale"))
      .send({ expectedVersion: created.body.version });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("OPTIMISTIC_LOCK");
    expect(stale.body.detail).not.toMatch(/IN_PROGRESS to IN_PROGRESS/);
    expect((await taskOf(coordinator, created.body.id)).status).toBe("IN_PROGRESS");
  });

  it("M4.3-ADV-02 duplicate Idempotency-Key does not duplicate Task or extra audit", async () => {
    const first = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-replay"))
      .send({ title: "Replay me" });
    expect(first.status).toBeLessThan(400);
    const replay = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-replay"))
      .send({ title: "Replay me" });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(first.body.id);
    const createdEvents = await prisma.auditEvent.findMany({
      where: { resourceId: first.body.id, eventType: "TASK_CREATED" },
    });
    expect(createdEvents).toHaveLength(1);

    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${first.body.id}/start`)
      .set("Idempotency-Key", key("start-replay"))
      .send({ expectedVersion: first.body.version });
    const startReplay = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${first.body.id}/start`)
      .set("Idempotency-Key", key("start-replay"))
      .send({ expectedVersion: first.body.version });
    expect(startReplay.body.version).toBe(started.body.version);
    expect(startReplay.body.status).toBe("IN_PROGRESS");
  });

  it("M4.3-ADV-03 viewer/external/cross-tenant/org-only/revoked fail closed without existence leak", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-authz"))
      .send({ title: "Protected" });

    const viewerCreate = await viewer
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("viewer-create"))
      .send({ title: "nope" });
    expect(viewerCreate.status).toBe(403);

    const viewerPatch = await viewer.patch(`/api/v1/projects/${projectA}/tasks/${created.body.id}`).send({
      title: "hack",
      expectedVersion: created.body.version,
    });
    expect(viewerPatch.status).toBe(403);

    const contributorCreate = await contributor
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("contrib-create"))
      .send({ title: "no create" });
    expect(contributorCreate.status).toBe(403);

    const contributorAssign = await contributor
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/assign`)
      .set("Idempotency-Key", key("contrib-asg"))
      .send({ assigneeUserId: contributorUserId, expectedVersion: created.body.version });
    expect(contributorAssign.status).toBe(403);

    const externalCreate = await external
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("ext-create"))
      .send({ title: "ext nope" });
    expect(externalCreate.status).toBe(403);

    const foreignIssue = await ownerB
      .post(`/api/v1/projects/${projectB}/issues`)
      .set("Idempotency-Key", key("iss-b"))
      .send({ title: "Other org issue" });
    const cross = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("cross-issue"))
      .send({ title: "steal", issueId: foreignIssue.body.id });
    expect(cross.status).toBe(403);
    expect(JSON.stringify(cross.body)).not.toContain("Other org issue");
    expect(cross.body.detail).not.toContain(foreignIssue.body.id);

    const otherTenant = await ownerB.get(`/api/v1/projects/${projectA}/tasks/${created.body.id}`);
    expect(otherTenant.status).toBe(403);
    expect(JSON.stringify(otherTenant.body)).not.toContain("Protected");

    const orgOnlyEmail = `orgonly-${suffix}@example.com`;
    await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
      email: orgOnlyEmail,
      roleTemplateKey: "VIEWER",
      membershipType: "INTERNAL",
    });
    const invite = emails.sent.filter((message) => message.to === orgOnlyEmail).at(-1);
    const orgOnly = request.agent(app.getHttpServer());
    await orgOnly.post("/api/v1/invitations/accept").send({
      token: invite?.token,
      password: PASSWORD,
      displayName: "Org only",
    });
    const teamOnly = await orgOnly.get(`/api/v1/projects/${projectA}/tasks`);
    expect(teamOnly.status).toBe(403);

    const members = await ownerA.get(`/api/v1/projects/${projectA}/members`);
    const viewerRow = members.body.find((row: { email: string }) => row.email === `viewer-${suffix}@example.com`);
    await ownerA.patch(`/api/v1/projects/${projectA}/members/${viewerRow.id}`).send({ status: "SUSPENDED" });
    const revoked = await viewer.get(`/api/v1/projects/${projectA}/planning`);
    expect(revoked.status).toBeGreaterThanOrEqual(401);
    expect(JSON.stringify(revoked.body)).not.toContain("Protected");
    await ownerA.patch(`/api/v1/projects/${projectA}/members/${viewerRow.id}`).send({ status: "ACTIVE" });
  });

  it("M4.3-R02/R09 archived Project is readable and rejects mutations clearly", async () => {
    const created = await ownerA
      .post(`/api/v1/projects/${archiveProject}/tasks`)
      .set("Idempotency-Key", key("create-arch"))
      .send({ title: "Before archive" });
    expect(created.status).toBeLessThan(400);

    const archived = await ownerA.post(`/api/v1/projects/${archiveProject}/archive`).send({});
    expect(archived.status).toBeLessThan(400);

    const readable = await ownerA.get(`/api/v1/projects/${archiveProject}/tasks/${created.body.id}`);
    expect(readable.status).toBe(200);
    expect(readable.body.title).toBe("Before archive");

    const mutate = await ownerA.patch(`/api/v1/projects/${archiveProject}/tasks/${created.body.id}`).send({
      title: "after archive",
      expectedVersion: created.body.version,
    });
    expect(mutate.status).toBe(409);
    expect(mutate.body.code).toBe("PLANNING_STATE");
    expect(mutate.body.detail).toMatch(/Archived Project/i);

    const createAfter = await ownerA
      .post(`/api/v1/projects/${archiveProject}/tasks`)
      .set("Idempotency-Key", key("create-after-arch"))
      .send({ title: "nope" });
    expect(createAfter.status).toBe(409);
  });

  it("rejects invalid transitions on dedicated commands", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create-invalid"))
      .send({ title: "Machine" });
    const blockFromTodo = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/block`)
      .set("Idempotency-Key", key("block-from-todo"))
      .send({ expectedVersion: created.body.version, blockedReason: "too soon" });
    expect(blockFromTodo.status).toBe(409);

    const cancel = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/cancel`)
      .set("Idempotency-Key", key("cancel-machine"))
      .send({ expectedVersion: created.body.version });
    expect(cancel.status).toBeLessThan(400);
    const restart = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${created.body.id}/start`)
      .set("Idempotency-Key", key("restart-cancelled"))
      .send({ expectedVersion: cancel.body.version });
    expect(restart.status).toBe(409);
  });
});
