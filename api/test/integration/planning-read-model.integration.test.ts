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
const suffix = `m42-${Date.now()}`;

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
let viewer: Agent;
let issueId: string;
let taskId: string;
let lateTaskId: string;
let milestoneId: string;
let predId: string;
let succId: string;
let contributorUserId: string;

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

  coordinator = await inviteToProject("coordinator", "PROJECT_COORDINATOR");
  viewer = await inviteToProject("viewer", "VIEWER");
  const contributor = await inviteToProject("contributor", "CONTRIBUTOR_DESIGNER");
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

  const onTime = await coordinator
    .post(`/api/v1/projects/${projectA}/tasks`)
    .set("Idempotency-Key", `task-on-${suffix}`)
    .send({
      title: "Update grid",
      issueId,
      milestoneId,
      dueDate: "2099-01-01T00:00:00.000Z",
      progressPercent: 20,
    });
  taskId = onTime.body.id;
  await coordinator
    .post(`/api/v1/projects/${projectA}/tasks/${taskId}/assign`)
    .set("Idempotency-Key", `asg-${suffix}`)
    .send({ assigneeUserId: contributorUserId, expectedVersion: onTime.body.version });

  const late = await coordinator
    .post(`/api/v1/projects/${projectA}/tasks`)
    .set("Idempotency-Key", `task-late-${suffix}`)
    .send({ title: "Late drawing", dueDate: "2000-01-01T00:00:00.000Z" });
  lateTaskId = late.body.id;

  const pred = await coordinator
    .post(`/api/v1/projects/${projectA}/tasks`)
    .set("Idempotency-Key", `task-pred-${suffix}`)
    .send({ title: "Predecessor" });
  const succ = await coordinator
    .post(`/api/v1/projects/${projectA}/tasks`)
    .set("Idempotency-Key", `task-succ-${suffix}`)
    .send({ title: "Successor" });
  predId = pred.body.id;
  succId = succ.body.id;
  await coordinator
    .post(`/api/v1/projects/${projectA}/tasks/${succId}/dependencies`)
    .set("Idempotency-Key", `dep-${suffix}`)
    .send({ predecessorTaskId: predId });
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

describe("M4.2 unified Planning read-model", () => {
  it("M4.2-HTTP-01 returns tasks, milestones, dependencies with derived late + kanbanColumn", async () => {
    const res = await coordinator.get(`/api/v1/projects/${projectA}/planning?view=list&sort=title&order=asc`);
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectA);
    expect(res.body.organizationId).toBe(orgA);
    expect(res.body.view).toBe("list");
    const ids = res.body.tasks.map((row: { id: string }) => row.id);
    expect(ids).toEqual(expect.arrayContaining([taskId, lateTaskId, predId, succId]));
    const linked = res.body.tasks.find((row: { id: string }) => row.id === taskId);
    expect(linked.late).toBe(false);
    expect(linked.kanbanColumn).toBe("PLANEJADAS");
    expect(linked.status).toBe("TODO");
    expect(linked.previews.issue.relation).toBe("issue");
    expect(linked.previews.issue.title).toBe("Grid clash");
    expect(linked.previews.issue.title).not.toBe(linked.title);
    expect(linked.previews.milestone.id).toBe(milestoneId);
    expect(linked.previews.assignee.userId).toBe(contributorUserId);
    const lateRow = res.body.tasks.find((row: { id: string }) => row.id === lateTaskId);
    expect(lateRow.late).toBe(true);
    expect(lateRow.kanbanColumn).toBe("EM_RISCO");
    expect(lateRow.status).toBe("TODO");
    expect(res.body.milestones.some((row: { id: string }) => row.id === milestoneId)).toBe(true);
    expect(
      res.body.dependencies.some(
        (row: { predecessorTaskId: string; successorTaskId: string }) =>
          row.predecessorTaskId === predId && row.successorTaskId === succId,
      ),
    ).toBe(true);
    expect(res.body.counts.total).toBe(res.body.page.total);
    expect(res.body.counts.late).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res.body)).not.toMatch(/OVERDUE/);
  });

  it("M4.5-HTTP-01 Kanban projection reuses the same authorized records and derived columns", async () => {
    const list = await coordinator.get(`/api/v1/projects/${projectA}/planning?view=list&sort=title&order=asc`);
    const board = await coordinator.get(`/api/v1/projects/${projectA}/planning?view=kanban&sort=title&order=asc`);
    expect(board.status).toBe(200);
    expect(board.body.view).toBe("kanban");
    expect(board.body.tasks.map((row: { id: string }) => row.id)).toEqual(
      list.body.tasks.map((row: { id: string }) => row.id),
    );
    expect(board.body.counts.total).toBe(list.body.counts.total);
    const lateRow = board.body.tasks.find((row: { id: string }) => row.id === lateTaskId);
    expect(lateRow.status).toBe("TODO");
    expect(lateRow.kanbanColumn).toBe("EM_RISCO");
    expect(lateRow.status).not.toBe("EM_RISCO");
    expect(board.body.counts.byKanbanColumn.EM_RISCO).toBeGreaterThanOrEqual(1);
    expect(
      board.body.counts.byKanbanColumn.PLANEJADAS +
        board.body.counts.byKanbanColumn.EM_ANDAMENTO +
        board.body.counts.byKanbanColumn.EM_RISCO +
        board.body.counts.byKanbanColumn.BLOQUEADAS,
    ).toBeLessThanOrEqual(board.body.counts.total);
    const persisted = await prisma.task.findUnique({ where: { id: lateTaskId } });
    expect(persisted?.status).toBe("TODO");
    expect(JSON.stringify(board.body.tasks.map((row: { status: string }) => row.status))).not.toMatch(
      /PLANEJADAS|EM_RISCO|EM_ANDAMENTO|BLOQUEADAS|OVERDUE/,
    );
  });

  it("paginates, filters, and fail-closes unauthorized filter ids", async () => {
    const page = await coordinator.get(`/api/v1/projects/${projectA}/planning?page=1&pageSize=1&sort=title&order=asc`);
    expect(page.status).toBe(200);
    expect(page.body.tasks).toHaveLength(1);
    expect(page.body.page.total).toBeGreaterThan(1);

    const lateOnly = await coordinator.get(`/api/v1/projects/${projectA}/planning?late=true`);
    expect(lateOnly.body.tasks.every((row: { late: boolean }) => row.late)).toBe(true);

    const q = await coordinator.get(`/api/v1/projects/${projectA}/planning?q=Update%20grid`);
    expect(q.body.tasks.map((row: { id: string }) => row.id)).toEqual([taskId]);

    const foreign = await coordinator.get(
      `/api/v1/projects/${projectA}/planning?phaseId=${randomUUID()}`,
    );
    expect(foreign.status).toBe(200);
    expect(foreign.body.tasks).toEqual([]);
    expect(foreign.body.counts.total).toBe(0);
  });

  it("M4.2-HTTP-02 / ADV omits unauthorized projects and inspect ids without a count leak", async () => {
    const anon = await request(app.getHttpServer()).get(`/api/v1/projects/${projectA}/planning`);
    expect(anon.status).toBe(403);
    expect(anon.body.tasks).toBeUndefined();
    expect(JSON.stringify(anon.body)).not.toContain("Update grid");

    const cross = await ownerB.get(`/api/v1/projects/${projectA}/planning`);
    expect(cross.status).toBe(403);
    expect(cross.body.tasks).toBeUndefined();
    expect(JSON.stringify(cross.body)).not.toContain("Update grid");
    expect(JSON.stringify(cross.body)).not.toMatch(/"total":\s*[1-9]/);

    const foreign = await ownerB
      .post(`/api/v1/projects/${projectB}/tasks`)
      .set("Idempotency-Key", `task-b-${suffix}`)
      .send({ title: `Hidden B ${suffix}` });
    expect(foreign.status).toBeLessThan(400);

    const globalCount = await prisma.task.count();
    const viewerRead = await viewer.get(`/api/v1/projects/${projectA}/planning`);
    expect(viewerRead.status).toBe(200);
    expect(viewerRead.body.counts.total).toBeLessThan(globalCount);
    expect(JSON.stringify(viewerRead.body)).not.toContain(`Hidden B ${suffix}`);

    const inspect = await ownerB.get(`/api/v1/projects/${projectB}/planning?inspect=${taskId}`);
    expect(inspect.status).toBe(200);
    expect(inspect.body.inspected).toBeNull();
    expect(JSON.stringify(inspect.body)).not.toContain("Update grid");

    const hidden = await coordinator.get(`/api/v1/projects/${projectA}/planning?inspect=${randomUUID()}`);
    expect(hidden.status).toBe(200);
    expect(hidden.body.inspected).toBeNull();
  });
});
