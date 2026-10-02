import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m44-${Date.now()}`;

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
  contributor = await inviteToProject("contributor", "CONTRIBUTOR_DESIGNER");
  viewer = await inviteToProject("viewer", "VIEWER");
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

function key(label: string): string {
  return `${label}-${suffix}`;
}

async function createTask(agent: Agent, title: string, label: string, extra: Record<string, unknown> = {}) {
  const res = await agent
    .post(`/api/v1/projects/${projectA}/tasks`)
    .set("Idempotency-Key", key(label))
    .send({ title, ...extra });
  expect(res.status).toBeLessThan(400);
  return res.body as {
    id: string;
    version: number;
    status: string;
    plannedStartAt: string | null;
    dueDate: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
}

describe("M4.4 Task dependencies", () => {
  it("M4.4-HTTP-01 rejects self, duplicate, cycle, non-FS, and cross-project without leaking", async () => {
    const pred = await createTask(coordinator, "Pred reject", "pred-rej");
    const succ = await createTask(coordinator, "Succ reject", "succ-rej");

    const self = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${pred.id}/dependencies`)
      .set("Idempotency-Key", key("dep-self"))
      .send({ predecessorTaskId: pred.id });
    expect(self.status).toBe(409);
    expect(self.body.reason).toBe("DEPENDENCY_SELF");

    const kind = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-ss"))
      .send({ predecessorTaskId: pred.id, type: "START_TO_START" });
    expect(kind.status).toBe(409);
    expect(kind.body.reason).toBe("DEPENDENCY_KIND_UNSUPPORTED");

    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-ok"))
      .send({ predecessorTaskId: pred.id });
    expect(created.status).toBeLessThan(400);
    expect(created.body.type).toBe("FINISH_TO_START");

    const dup = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-dup"))
      .send({ predecessorTaskId: pred.id });
    expect(dup.status).toBe(409);
    expect(dup.body.reason).toBe("DEPENDENCY_DUPLICATE");

    const cycle = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${pred.id}/dependencies`)
      .set("Idempotency-Key", key("dep-cycle"))
      .send({ predecessorTaskId: succ.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.reason).toBe("DEPENDENCY_CYCLE");

    const other = await ownerB
      .post(`/api/v1/projects/${projectB}/tasks`)
      .set("Idempotency-Key", key("task-b"))
      .send({ title: "Foreign hidden task" });
    expect(other.status).toBeLessThan(400);
    const cross = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-cross"))
      .send({ predecessorTaskId: other.body.id });
    expect(cross.status).toBe(403);
    expect(cross.body.code).toBe("TENANCY_DENIED");
    expect(JSON.stringify(cross.body)).not.toContain(other.body.id);
    expect(JSON.stringify(cross.body)).not.toMatch(/Foreign hidden/i);
  });

  it("M4.4-HTTP-02 incomplete predecessor blocks start and DONE with explainable blockers", async () => {
    const pred = await createTask(coordinator, "Survey", "pred-block");
    const succ = await createTask(coordinator, "Foundations", "succ-block");
    const linked = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-block"))
      .send({ predecessorTaskId: pred.id });
    expect(linked.status).toBeLessThan(400);

    const start = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/start`)
      .set("Idempotency-Key", key("start-blocked"))
      .send({ expectedVersion: succ.version });
    expect(start.status).toBe(409);
    expect(start.body.reason).toBe("DEPENDENCY_PREDECESSOR_INCOMPLETE");
    expect(start.body.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ predecessorTaskId: pred.id, status: "TODO", title: "Survey" }),
      ]),
    );

    const planning = await coordinator.get(`/api/v1/projects/${projectA}/planning?inspect=${succ.id}`);
    expect(planning.status).toBe(200);
    expect(planning.body.inspected.dependencyStartBlocked).toBe(true);
    expect(planning.body.inspected.status).toBe("TODO");

    await prisma.task.update({
      where: { id: succ.id },
      data: { status: "IN_PROGRESS", version: succ.version + 1 },
    });
    const complete = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/complete`)
      .set("Idempotency-Key", key("done-blocked"))
      .send({ expectedVersion: succ.version + 1 });
    expect(complete.status).toBe(409);
    expect(complete.body.reason).toBe("DEPENDENCY_PREDECESSOR_INCOMPLETE");
    const after = await prisma.task.findUnique({ where: { id: succ.id } });
    expect(after?.status).toBe("IN_PROGRESS");
    expect(after?.completedAt).toBeNull();
  });

  it("M4.4-HTTP-03 / ADV-02 rejects retroactive unfinished edges and never shifts dates", async () => {
    const pred = await createTask(coordinator, "Later pred", "pred-retro", {
      plannedStartAt: "2026-02-01T00:00:00.000Z",
      dueDate: "2026-02-10T00:00:00.000Z",
    });
    const succ = await createTask(coordinator, "Already started", "succ-retro", {
      plannedStartAt: "2026-03-01T00:00:00.000Z",
      dueDate: "2026-03-10T00:00:00.000Z",
    });
    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/start`)
      .set("Idempotency-Key", key("start-retro"))
      .send({ expectedVersion: succ.version });
    expect(started.status).toBeLessThan(400);

    const extraDates = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-dates"))
      .send({ predecessorTaskId: pred.id, dueDate: "2030-01-01T00:00:00.000Z" });
    expect(extraDates.status).toBeGreaterThanOrEqual(400);

    const retro = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-retro"))
      .send({ predecessorTaskId: pred.id });
    expect(retro.status).toBe(409);
    expect(retro.body.reason).toBe("DEPENDENCY_RETROACTIVE");

    const predDoneStart = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${pred.id}/start`)
      .set("Idempotency-Key", key("pred-start"))
      .send({ expectedVersion: pred.version });
    const predDone = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${pred.id}/complete`)
      .set("Idempotency-Key", key("pred-done"))
      .send({ expectedVersion: predDoneStart.body.version });
    expect(predDone.status).toBeLessThan(400);

    const ok = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies`)
      .set("Idempotency-Key", key("dep-done-pred"))
      .send({ predecessorTaskId: pred.id });
    expect(ok.status).toBeLessThan(400);

    const predAfter = await coordinator.get(`/api/v1/projects/${projectA}/tasks/${pred.id}`);
    const succAfter = await coordinator.get(`/api/v1/projects/${projectA}/tasks/${succ.id}`);
    expect(predAfter.body.plannedStartAt).toBe(pred.plannedStartAt);
    expect(predAfter.body.dueDate).toBe(pred.dueDate);
    expect(succAfter.body.plannedStartAt).toBe(succ.plannedStartAt);
    expect(succAfter.body.dueDate).toBe(succ.dueDate);

    const removed = await coordinator
      .delete(`/api/v1/projects/${projectA}/tasks/${succ.id}/dependencies/${ok.body.id}`)
      .set("Idempotency-Key", key("dep-rm"));
    expect(removed.status).toBeLessThan(400);
    const succRemoved = await coordinator.get(`/api/v1/projects/${projectA}/tasks/${succ.id}`);
    expect(succRemoved.body.plannedStartAt).toBe(succ.plannedStartAt);
    expect(succRemoved.body.dueDate).toBe(succ.dueDate);
    expect(succRemoved.body.startedAt).toBe(started.body.startedAt);
  });

  it("M4.4-ADV-01/R08 candidate search omits hidden foreign Tasks and re-authorizes reads", async () => {
    const local = await createTask(coordinator, "Visible candidate", "cand-local");
    const hiddenTitle = `SecretUniqueTitle-${suffix}`;
    const foreign = await ownerB
      .post(`/api/v1/projects/${projectB}/tasks`)
      .set("Idempotency-Key", key("cand-hidden"))
      .send({ title: hiddenTitle });
    expect(foreign.status).toBeLessThan(400);

    const host = await createTask(coordinator, "Host for candidates", "cand-host");
    const found = await coordinator.get(
      `/api/v1/projects/${projectA}/tasks/${host.id}/dependency-candidates?q=Visible`,
    );
    expect(found.status).toBe(200);
    expect(found.body.items.some((item: { id: string }) => item.id === local.id)).toBe(true);
    expect(found.body.items.some((item: { id: string }) => item.id === host.id)).toBe(false);

    const hidden = await coordinator.get(
      `/api/v1/projects/${projectA}/tasks/${host.id}/dependency-candidates?q=${encodeURIComponent(hiddenTitle)}`,
    );
    expect(hidden.status).toBe(200);
    expect(hidden.body.items).toHaveLength(0);
    expect(JSON.stringify(hidden.body)).not.toContain(foreign.body.id);
    expect(JSON.stringify(hidden.body)).not.toContain(hiddenTitle);

    const viewerRead = await viewer.get(`/api/v1/projects/${projectA}/tasks/${host.id}/dependencies`);
    expect(viewerRead.status).toBe(200);
    const viewerAdd = await viewer
      .post(`/api/v1/projects/${projectA}/tasks/${host.id}/dependencies`)
      .set("Idempotency-Key", key("viewer-add"))
      .send({ predecessorTaskId: local.id });
    expect(viewerAdd.status).toBe(403);
  });

  it("M4.4-ADV-03 concurrent inverse edges, stale version, revoked member, and retry", async () => {
    const left = await createTask(coordinator, "Left", "conc-left");
    const right = await createTask(coordinator, "Right", "conc-right");

    const [one, two] = await Promise.all([
      coordinator
        .post(`/api/v1/projects/${projectA}/tasks/${right.id}/dependencies`)
        .set("Idempotency-Key", key("conc-ab"))
        .send({ predecessorTaskId: left.id }),
      coordinator
        .post(`/api/v1/projects/${projectA}/tasks/${left.id}/dependencies`)
        .set("Idempotency-Key", key("conc-ba"))
        .send({ predecessorTaskId: right.id }),
    ]);
    const statuses = [one.status, two.status].sort();
    expect(statuses[0]).toBeLessThan(400);
    expect(statuses[1]).toBe(409);
    const cycleBody = one.status >= 400 ? one.body : two.body;
    expect(cycleBody.reason).toBe("DEPENDENCY_CYCLE");
    const edges = await prisma.taskDependency.findMany({
      where: {
        projectId: projectA,
        OR: [
          { predecessorTaskId: left.id, successorTaskId: right.id },
          { predecessorTaskId: right.id, successorTaskId: left.id },
        ],
      },
    });
    expect(edges).toHaveLength(1);

    const staleHost = await createTask(coordinator, "Stale host", "stale-host");
    const stale = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${staleHost.id}/start`)
      .set("Idempotency-Key", key("stale-start"))
      .send({ expectedVersion: 99 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("OPTIMISTIC_LOCK");

    const retryPred = await createTask(coordinator, "Retry pred", "retry-pred");
    const retrySucc = await createTask(coordinator, "Retry succ", "retry-succ");
    const first = await contributor
      .post(`/api/v1/projects/${projectA}/tasks/${retrySucc.id}/dependencies`)
      .set("Idempotency-Key", key("retry-same"))
      .send({ predecessorTaskId: retryPred.id });
    expect(first.status).toBeLessThan(400);
    const replay = await contributor
      .post(`/api/v1/projects/${projectA}/tasks/${retrySucc.id}/dependencies`)
      .set("Idempotency-Key", key("retry-same"))
      .send({ predecessorTaskId: retryPred.id });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(first.body.id);
    const retryEdges = await prisma.taskDependency.count({
      where: { predecessorTaskId: retryPred.id, successorTaskId: retrySucc.id },
    });
    expect(retryEdges).toBe(1);
    const createdEvents = await prisma.auditEvent.count({
      where: { eventType: "TASK_DEPENDENCY_CREATED", resourceId: first.body.id },
    });
    expect(createdEvents).toBe(1);

    const removed = await contributor
      .delete(`/api/v1/projects/${projectA}/tasks/${retrySucc.id}/dependencies/${first.body.id}`)
      .set("Idempotency-Key", key("retry-rm"));
    expect(removed.status).toBeLessThan(400);
    const removedReplay = await contributor
      .delete(`/api/v1/projects/${projectA}/tasks/${retrySucc.id}/dependencies/${first.body.id}`)
      .set("Idempotency-Key", key("retry-rm"));
    expect(removedReplay.status).toBeLessThan(400);
    const removedEvents = await prisma.auditEvent.count({
      where: { eventType: "TASK_DEPENDENCY_REMOVED", resourceId: first.body.id },
    });
    expect(removedEvents).toBe(1);

    const members = await ownerA.get(`/api/v1/projects/${projectA}/members`);
    const contributorRow = members.body.find((row: { email: string }) => row.email === `contributor-${suffix}@example.com`);
    await ownerA.patch(`/api/v1/projects/${projectA}/members/${contributorRow.id}`).send({ status: "SUSPENDED" });
    const revokedAdd = await contributor
      .post(`/api/v1/projects/${projectA}/tasks/${retrySucc.id}/dependencies`)
      .set("Idempotency-Key", key("revoked-add"))
      .send({ predecessorTaskId: retryPred.id });
    expect(revokedAdd.status).toBeGreaterThanOrEqual(401);
    expect(JSON.stringify(revokedAdd.body)).not.toContain(retryPred.id);
    await ownerA.patch(`/api/v1/projects/${projectA}/members/${contributorRow.id}`).send({ status: "ACTIVE" });
  });

  it("M4.4-UNIT/HTTP long transitive cycle is rejected from the same-Project snapshot", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const task = await createTask(coordinator, `Chain ${index}`, `chain-${index}`);
      ids.push(task.id);
      if (index > 0) {
        const edge = await coordinator
          .post(`/api/v1/projects/${projectA}/tasks/${task.id}/dependencies`)
          .set("Idempotency-Key", key(`chain-e-${index}`))
          .send({ predecessorTaskId: ids[index - 1] });
        expect(edge.status).toBeLessThan(400);
      }
    }
    const close = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${ids[0]}/dependencies`)
      .set("Idempotency-Key", key("chain-close"))
      .send({ predecessorTaskId: ids[7] });
    expect(close.status).toBe(409);
    expect(close.body.reason).toBe("DEPENDENCY_CYCLE");
    const foreignWalk = JSON.stringify(close.body);
    expect(foreignWalk).not.toMatch(/Plant|Org B|Foreign/i);
  });
});
