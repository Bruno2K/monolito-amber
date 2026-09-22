import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `pf15-${Date.now()}`;

type Agent = ReturnType<typeof request.agent>;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;
let orgA: string;
let orgB: string;
let projectA: string;
let projectB: string;
let ownerA: Agent;
let ownerB: Agent;
let coordinator: Agent;
let contributor: Agent;
let viewer: Agent;
let coordinatorUserId: string;
let contributorUserId: string;
let issueId: string;
let standaloneTaskId: string;
let linkedTaskId: string;
let secondLinkedTaskId: string;
let predTaskId: string;
let succTaskId: string;
let milestoneId: string;
let missedMilestoneId: string;

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
  const createdB = await ownerB.post("/api/v1/organizations").send({ name: `Org B ${suffix}` });
  orgB = createdB.body.id;
  await enrollTotp(ownerB);

  const project = await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Tower ${suffix}` });
  projectA = project.body.project.id;
  const other = await ownerB.post(`/api/v1/organizations/${orgB}/projects`).send({ name: `Plant ${suffix}` });
  projectB = other.body.project.id;

  coordinator = await inviteToProject("coordinator", "PROJECT_COORDINATOR");
  contributor = await inviteToProject("contributor", "CONTRIBUTOR_DESIGNER");
  viewer = await inviteToProject("viewer", "VIEWER");

  coordinatorUserId = (await coordinator.get("/api/v1/auth/session")).body.userId;
  contributorUserId = (await contributor.get("/api/v1/auth/session")).body.userId;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

async function inviteToProject(label: string, templateKey: string): Promise<Agent> {
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

describe("PF-1.5 Planning / Tasks / Milestones", () => {
  it("creates a source Issue without auto-creating Tasks", async () => {
    const issue = await coordinator
      .post(`/api/v1/projects/${projectA}/issues`)
      .set("Idempotency-Key", `iss-${suffix}`)
      .send({ title: "Grid clash", severity: "HIGH", priority: "NORMAL" });
    expect(issue.status).toBeLessThan(400);
    expect(issue.body.status).toBe("OPEN");
    issueId = issue.body.id;
    const tasks = await coordinator.get(`/api/v1/projects/${projectA}/tasks`);
    expect(tasks.status).toBe(200);
    expect(tasks.body).toEqual([]);
  });

  it("creates standalone and Issue-linked Tasks; Issue → 0..N; client ids are not authoritative", async () => {
    const viewerCreate = await viewer
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-viewer-${suffix}`)
      .send({ title: "nope" });
    expect(viewerCreate.status).toBe(403);

    const spoof = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-spoof-${suffix}`)
      .send({ title: "spoof", organizationId: orgB, projectId: projectB });
    expect(spoof.status).toBe(403);

    const standalone = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-alone-${suffix}`)
      .send({ title: "Standalone planning item", priority: "HIGH" });
    expect(standalone.status).toBeLessThan(400);
    expect(standalone.body.status).toBe("TODO");
    expect(standalone.body.issueId).toBeNull();
    expect(standalone.body.late).toBe(false);
    standaloneTaskId = standalone.body.id;

    const replay = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-alone-${suffix}`)
      .send({ title: "Standalone planning item", priority: "HIGH" });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(standaloneTaskId);

    const linked = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-iss-1-${suffix}`)
      .send({ title: "Update grid", issueId, priority: "NORMAL" });
    expect(linked.status).toBeLessThan(400);
    expect(linked.body.issueId).toBe(issueId);
    linkedTaskId = linked.body.id;

    const second = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-iss-2-${suffix}`)
      .send({ title: "Issue second task", issueId });
    expect(second.status).toBeLessThan(400);
    expect(second.body.issueId).toBe(issueId);
    secondLinkedTaskId = second.body.id;

    const foreignIssue = await ownerB
      .post(`/api/v1/projects/${projectB}/issues`)
      .set("Idempotency-Key", `iss-b-${suffix}`)
      .send({ title: "Other org issue" });
    expect(foreignIssue.status).toBeLessThan(400);
    const crossIssue = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-xissue-${suffix}`)
      .send({ title: "steal issue", issueId: foreignIssue.body.id });
    expect(crossIssue.status).toBe(403);
  });

  it("assigns only ACTIVE ProjectMembership and rejects invented assignees", async () => {
    const assigned = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/assign`)
      .send({ assigneeUserId: contributorUserId });
    expect(assigned.status).toBeLessThan(400);
    expect(assigned.body.assigneeUserId).toBe(contributorUserId);

    const stranger = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/assign`)
      .send({ assigneeUserId: randomUUID() });
    expect(stranger.status).toBe(409);
    expect(stranger.body.code).toBe("PLANNING_STATE");

    const otherOrg = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/assign`)
      .send({ assigneeUserId: (await ownerB.get("/api/v1/auth/session")).body.userId });
    expect(otherOrg.status).toBe(409);
  });

  it("requires BLOCKED reason, derives lateness, and refuses OVERDUE as a status", async () => {
    const overdueStatus = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/status`)
      .set("Idempotency-Key", `st-overdue-${suffix}`)
      .send({ status: "OVERDUE" });
    expect(overdueStatus.status).toBe(409);

    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/status`)
      .set("Idempotency-Key", `st-start-${suffix}`)
      .send({ status: "IN_PROGRESS" });
    expect(started.status).toBeLessThan(400);
    expect(started.body.status).toBe("IN_PROGRESS");
    expect(started.body.startedAt).toBeTruthy();

    const blockedNoReason = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/status`)
      .set("Idempotency-Key", `st-block-empty-${suffix}`)
      .send({ status: "BLOCKED" });
    expect(blockedNoReason.status).toBe(409);

    const blocked = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/status`)
      .set("Idempotency-Key", `st-block-${suffix}`)
      .send({ status: "BLOCKED", blockedReason: "Waiting for survey" });
    expect(blocked.status).toBeLessThan(400);
    expect(blocked.body.status).toBe("BLOCKED");
    expect(blocked.body.blockedReason).toBe("Waiting for survey");

    const latePatch = await coordinator.patch(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}`).send({
      dueDate: "2000-01-01T00:00:00.000Z",
    });
    expect(latePatch.status).toBeLessThan(400);
    expect(latePatch.body.late).toBe(true);
    expect(latePatch.body.status).toBe("BLOCKED");
  });

  it("enforces finish-to-start dependencies: no self, duplicate, cycle, or cross-project", async () => {
    const pred = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-pred-${suffix}`)
      .send({ title: "Predecessor" });
    const succ = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-succ-${suffix}`)
      .send({ title: "Successor" });
    predTaskId = pred.body.id;
    succTaskId = succ.body.id;

    const self = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${predTaskId}/dependencies`)
      .set("Idempotency-Key", `dep-self-${suffix}`)
      .send({ predecessorTaskId: predTaskId });
    expect(self.status).toBe(409);

    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succTaskId}/dependencies`)
      .set("Idempotency-Key", `dep-ok-${suffix}`)
      .send({ predecessorTaskId: predTaskId });
    expect(created.status).toBeLessThan(400);
    expect(created.body.type).toBe("FINISH_TO_START");

    const replay = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succTaskId}/dependencies`)
      .set("Idempotency-Key", `dep-ok-${suffix}`)
      .send({ predecessorTaskId: predTaskId });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(created.body.id);

    const dup = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succTaskId}/dependencies`)
      .set("Idempotency-Key", `dep-dup-${suffix}`)
      .send({ predecessorTaskId: predTaskId });
    expect(dup.status).toBe(409);

    const cycle = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${predTaskId}/dependencies`)
      .set("Idempotency-Key", `dep-cycle-${suffix}`)
      .send({ predecessorTaskId: succTaskId });
    expect(cycle.status).toBe(409);
    expect(cycle.body.detail).not.toMatch(/projectB|organization/i);

    const startBlocked = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succTaskId}/status`)
      .set("Idempotency-Key", `st-succ-early-${suffix}`)
      .send({ status: "IN_PROGRESS" });
    expect(startBlocked.status).toBe(409);

    const otherTask = await ownerB
      .post(`/api/v1/projects/${projectB}/tasks`)
      .set("Idempotency-Key", `task-b-${suffix}`)
      .send({ title: "Other tenant task" });
    expect(otherTask.status).toBeLessThan(400);
    const cross = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succTaskId}/dependencies`)
      .set("Idempotency-Key", `dep-cross-${suffix}`)
      .send({ predecessorTaskId: otherTask.body.id });
    expect(cross.status).toBe(403);
    expect(cross.body.detail).not.toContain(otherTask.body.id);
  });

  it("allows start only after the predecessor is DONE, then completes without resolving the Issue", async () => {
    await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${predTaskId}/status`)
      .set("Idempotency-Key", `st-pred-start-${suffix}`)
      .send({ status: "IN_PROGRESS" });
    const predDone = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${predTaskId}/complete`)
      .set("Idempotency-Key", `st-pred-done-${suffix}`)
      .send({});
    expect(predDone.status).toBeLessThan(400);
    expect(predDone.body.status).toBe("DONE");

    const start = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succTaskId}/status`)
      .set("Idempotency-Key", `st-succ-ok-${suffix}`)
      .send({ status: "IN_PROGRESS" });
    expect(start.status).toBeLessThan(400);

    await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${linkedTaskId}/status`)
      .set("Idempotency-Key", `st-linked-start-${suffix}`)
      .send({ status: "IN_PROGRESS" });
    const done = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${linkedTaskId}/complete`)
      .set("Idempotency-Key", `st-linked-done-${suffix}`)
      .send({});
    expect(done.status).toBeLessThan(400);
    expect(done.body.status).toBe("DONE");
    expect(done.body.late).toBe(false);

    const issue = await coordinator.get(`/api/v1/projects/${projectA}/issues/${issueId}`);
    expect(issue.body.status).toBe("OPEN");
    expect(issue.body.resolvedAt).toBeNull();

    const secondStillOpen = await coordinator.get(`/api/v1/projects/${projectA}/tasks/${secondLinkedTaskId}`);
    expect(secondStillOpen.body.status).toBe("TODO");
    expect(secondStillOpen.body.issueId).toBe(issueId);
  });

  it("creates Milestones, derives AT_RISK/MISSED, and requires explicit achieve", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const planned = await coordinator
      .post(`/api/v1/projects/${projectA}/milestones`)
      .set("Idempotency-Key", `ms-1-${suffix}`)
      .send({ title: "Foundation ready", targetDate: future });
    expect(planned.status).toBeLessThan(400);
    expect(planned.body.recordedStatus).toBe("PLANNED");
    expect(planned.body.status).toBe("PLANNED");
    milestoneId = planned.body.id;

    const missed = await coordinator
      .post(`/api/v1/projects/${projectA}/milestones`)
      .set("Idempotency-Key", `ms-missed-${suffix}`)
      .send({ title: "Survey package", targetDate: past });
    expect(missed.status).toBeLessThan(400);
    expect(missed.body.recordedStatus).toBe("PLANNED");
    expect(missed.body.status).toBe("MISSED");
    missedMilestoneId = missed.body.id;

    const linked = await coordinator.patch(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}`).send({
      milestoneId,
    });
    expect(linked.status).toBeLessThan(400);
    expect(linked.body.milestoneId).toBe(milestoneId);
    expect(linked.body.late).toBe(true);

    const atRisk = await coordinator.get(`/api/v1/projects/${projectA}/milestones/${milestoneId}`);
    expect(atRisk.body.recordedStatus).toBe("PLANNED");
    expect(atRisk.body.status).toBe("AT_RISK");

    await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/status`)
      .set("Idempotency-Key", `st-reopen-${suffix}`)
      .send({ status: "IN_PROGRESS" });
    const completedLate = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}/complete`)
      .set("Idempotency-Key", `st-late-done-${suffix}`)
      .send({});
    expect(completedLate.status).toBeLessThan(400);
    expect(completedLate.body.status).toBe("DONE");

    const stillPlanned = await coordinator.get(`/api/v1/projects/${projectA}/milestones/${milestoneId}`);
    expect(stillPlanned.body.status).toBe("PLANNED");
    expect(stillPlanned.body.recordedStatus).toBe("PLANNED");

    const patchStatus = await coordinator.patch(`/api/v1/projects/${projectA}/milestones/${milestoneId}`).send({
      status: "ACHIEVED",
    });
    expect(patchStatus.status).toBeGreaterThanOrEqual(400);

    const achieved = await coordinator
      .post(`/api/v1/projects/${projectA}/milestones/${milestoneId}/achieve`)
      .set("Idempotency-Key", `ms-ach-${suffix}`)
      .send({});
    expect(achieved.status).toBeLessThan(400);
    expect(achieved.body.status).toBe("ACHIEVED");
    expect(achieved.body.recordedStatus).toBe("ACHIEVED");
    expect(achieved.body.achievedByUserId).toBe(coordinatorUserId);

    const replay = await coordinator
      .post(`/api/v1/projects/${projectA}/milestones/${milestoneId}/achieve`)
      .set("Idempotency-Key", `ms-ach-${suffix}`)
      .send({});
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(milestoneId);

    const issue = await coordinator.get(`/api/v1/projects/${projectA}/issues/${issueId}`);
    expect(issue.body.status).toBe("OPEN");
  });

  it("isolates tenants, rejects spoofed project/task ids, and never introduces Gates", async () => {
    const cross = await ownerB.get(`/api/v1/projects/${projectA}/tasks/${standaloneTaskId}`);
    expect(cross.status).toBe(403);
    const crossMs = await ownerB.get(`/api/v1/projects/${projectA}/milestones/${milestoneId}`);
    expect(crossMs.status).toBe(403);
    const forged = await coordinator.get(`/api/v1/projects/${projectA}/tasks/${randomUUID()}`);
    expect(forged.status).toBe(403);
    const otherProject = await coordinator.get(`/api/v1/projects/${projectB}/tasks`);
    expect(otherProject.status).toBe(403);

    const tables = await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name IN ('gates', 'formal_exceptions', 'gate_requirements')
    `;
    expect(tables).toEqual([]);

    const cancelled = await coordinator
      .post(`/api/v1/projects/${projectA}/milestones/${missedMilestoneId}/cancel`)
      .send({});
    expect(cancelled.status).toBeLessThan(400);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.recordedStatus).toBe("CANCELLED");

    const issueAfter = await prisma.issue.findUnique({ where: { id: issueId } });
    expect(issueAfter?.status).toBe("OPEN");

    const auditTypes = await prisma.auditEvent.findMany({
      where: { eventType: { in: ["TASK_CREATED", "TASK_COMPLETED", "TASK_BLOCKED", "MILESTONE_ACHIEVED"] } },
    });
    expect(auditTypes.some((row) => row.eventType === "TASK_CREATED")).toBe(true);
    expect(auditTypes.some((row) => row.eventType === "TASK_COMPLETED")).toBe(true);
    expect(auditTypes.some((row) => row.eventType === "MILESTONE_ACHIEVED")).toBe(true);
  });
});
