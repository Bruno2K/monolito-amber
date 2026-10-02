import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  M4_SEED_MILESTONES,
  M4_SEED_PRE_M4_TASK,
  M4_SEED_TASKS,
} from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m48-${Date.now()}`;
const ROOT = resolve(__dirname, "../../..");

type Agent = ReturnType<typeof request.agent>;

function seedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(
    20,
    32,
  )}`;
}

function key(label: string): string {
  return `${label}-${suffix}-${randomUUID()}`;
}

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

  projectA = (await ownerA.post(`/api/v1/organizations/${orgA}/projects`).send({ name: `Tower ${suffix}` })).body.project
    .id;
  projectB = (await ownerB.post(`/api/v1/organizations/${orgB}/projects`).send({ name: `Plant ${suffix}` })).body.project
    .id;

  coordinator = await inviteToProject("coordinator", "PROJECT_COORDINATOR");
  viewer = await inviteToProject("viewer", "VIEWER");
  const contributor = await inviteToProject("contributor", "CONTRIBUTOR_DESIGNER");
  contributorUserId = (await contributor.get("/api/v1/auth/session")).body.userId;

  issueId = (
    await coordinator
      .post(`/api/v1/projects/${projectA}/issues`)
      .set("Idempotency-Key", key("iss"))
      .send({ title: "Grid clash", severity: "HIGH", priority: "NORMAL" })
  ).body.id;
  milestoneId = (
    await coordinator
      .post(`/api/v1/projects/${projectA}/milestones`)
      .set("Idempotency-Key", key("ms"))
      .send({ title: "Concept freeze", targetDate: "2099-03-01T00:00:00.000Z" })
  ).body.id;
  const phase = await coordinator
    .post(`/api/v1/projects/${projectA}/phases`)
    .set("Idempotency-Key", key("ph"))
    .send({ name: "Concept", sequence: 1 });
  phaseId = phase.body.id;
  const discipline = await ownerA
    .post(`/api/v1/organizations/${orgA}/disciplines`)
    .set("Idempotency-Key", key("disc"))
    .send({ code: `AR${suffix.slice(-4)}`, name: "Architecture" });
  const deliverable = await coordinator
    .post(`/api/v1/projects/${projectA}/deliverables`)
    .set("Idempotency-Key", key("del"))
    .send({
      code: `D${suffix.slice(-6)}`,
      title: "Pack",
      phaseId,
      disciplineId: discipline.body.id,
    });
  deliverableId = deliverable.body.id;
  workPackageId = (
    await coordinator
      .post(`/api/v1/projects/${projectA}/work-packages`)
      .set("Idempotency-Key", key("wp"))
      .send({ title: "Outline", phaseId, deliverableId })
  ).body.id;
  gateId =
    (
      await ownerA
        .post(`/api/v1/projects/${projectA}/gates`)
        .set("Idempotency-Key", key("gate"))
        .send({ name: "Concept gate" })
    ).body?.id ?? "";
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

async function snapshotSiblings() {
  return {
    issue: (await coordinator.get(`/api/v1/projects/${projectA}/issues/${issueId}`)).body.status,
    milestone: (await coordinator.get(`/api/v1/projects/${projectA}/milestones/${milestoneId}`)).body.recordedStatus,
    phase: (await coordinator.get(`/api/v1/projects/${projectA}/phases/${phaseId}`)).body.status,
    deliverable: (await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${deliverableId}`)).body.status,
    workPackage: (await coordinator.get(`/api/v1/projects/${projectA}/work-packages/${workPackageId}`)).body.status,
    gate: gateId ? (await ownerA.get(`/api/v1/projects/${projectA}/gates/${gateId}`)).body.status : null,
  };
}

function taskIds(body: { tasks: Array<{ id: string }> }): string[] {
  return body.tasks.map((row) => row.id).sort();
}

describe("M4.8 Local RC integration", () => {
  it("M4.8-R01/R02 upgrade chain + additive seed preserve pre-M4 and M3 ids", async () => {
    execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: db.url, AMBER_SEED_M3: "1" },
      stdio: "inherit",
    });
    const projectA1 = seedUuid("project:project-a1");
    const orgASeed = seedUuid("org:org-a");
    expect((await prisma.organization.findUnique({ where: { id: orgASeed } }))?.slug).toBe("amber-demo-alpha");
    const seedTask = await prisma.task.findUnique({ where: { id: seedUuid("task:task-a1-todo") } });
    expect(seedTask?.title).toBe(M4_SEED_TASKS[0]?.title);
    expect(await prisma.task.count({ where: { title: { in: M4_SEED_TASKS.map((row) => row.title) } } })).toBe(
      M4_SEED_TASKS.length,
    );
    expect(await prisma.milestone.count({ where: { title: { in: M4_SEED_MILESTONES.map((row) => row.title) } } })).toBe(
      M4_SEED_MILESTONES.length,
    );

    const preId = seedUuid(`task:${M4_SEED_PRE_M4_TASK.key}`);
    await prisma.task.upsert({
      where: { id: preId },
      create: {
        id: preId,
        organizationId: orgASeed,
        projectId: projectA1,
        title: M4_SEED_PRE_M4_TASK.title,
        status: "TODO",
        createdByUserId: seedUuid("user:coord-a"),
      },
      update: { title: M4_SEED_PRE_M4_TASK.title },
    });
    execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: db.url, AMBER_SEED_M3: "1" },
      stdio: "inherit",
    });
    const preserved = await prisma.task.findUnique({ where: { id: preId } });
    expect(preserved?.title).toBe(M4_SEED_PRE_M4_TASK.title);
    expect(preserved?.status).toBe("TODO");
    expect((await prisma.organization.findUnique({ where: { id: orgASeed } }))?.slug).toBe("amber-demo-alpha");
    const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at
    `;
    const names = applied.map((row) => row.migration_name);
    expect(names[0]).toBe("20260922000000_init");
    expect(names).toContain("20260922220000_pf_1_5_planning_tasks_milestones");
    expect(names.at(-1)).toBe("20261001200000_m3_7_cross_domain_traceability");
  });

  it("M4.8-HTTP-02/03 golden path + cross-view identity + no sibling cascade", async () => {
    const before = await snapshotSiblings();
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("create"))
      .send({
        title: `RC golden ${suffix}`,
        issueId,
        milestoneId,
        phaseId,
        deliverableId,
        workPackageId,
        plannedStartAt: "2026-10-02T00:00:00.000Z",
        dueDate: "2026-10-09T00:00:00.000Z",
      });
    expect(created.status).toBeLessThan(400);
    const taskId = created.body.id as string;

    const assigned = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/assign`)
      .set("Idempotency-Key", key("assign"))
      .send({ assigneeUserId: contributorUserId, expectedVersion: created.body.version });
    expect(assigned.status).toBeLessThan(400);

    const pred = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("pred"))
      .send({ title: `RC pred ${suffix}` });
    const linked = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/dependencies`)
      .set("Idempotency-Key", key("dep"))
      .send({ predecessorTaskId: pred.body.id, type: "FINISH_TO_START" });
    expect(linked.status).toBeLessThan(400);

    const blockedStart = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/start`)
      .set("Idempotency-Key", key("start-blocked"))
      .send({ expectedVersion: assigned.body.version });
    expect(blockedStart.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(blockedStart.body)).toMatch(/predecessor|DEPENDENCY|término-início|finish-to-start/i);

    const predStarted = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${pred.body.id}/start`)
      .set("Idempotency-Key", key("pred-start"))
      .send({ expectedVersion: pred.body.version });
    const predDone = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${pred.body.id}/complete`)
      .set("Idempotency-Key", key("pred-done"))
      .send({ expectedVersion: predStarted.body.version });
    expect(predDone.status).toBeLessThan(400);

    const started = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks/${taskId}/start`)
      .set("Idempotency-Key", key("start"))
      .send({ expectedVersion: assigned.body.version });
    expect(started.status).toBeLessThan(400);
    expect(started.body.status).toBe("IN_PROGRESS");

    const dated = await coordinator
      .patch(`/api/v1/projects/${projectA}/tasks/${taskId}`)
      .set("Idempotency-Key", key("date"))
      .send({
        plannedStartAt: "2026-10-05T00:00:00.000Z",
        dueDate: "2026-10-15T00:00:00.000Z",
        expectedVersion: started.body.version,
      });
    expect(dated.status).toBe(200);
    expect(dated.body.status).toBe("IN_PROGRESS");

    const late = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", key("late"))
      .send({ title: `RC late ${suffix}`, milestoneId, dueDate: "2000-01-01T00:00:00.000Z" });
    expect(late.status).toBeLessThan(400);

    const views = ["list", "kanban", "gantt", "milestones"] as const;
    const payloads = [];
    for (const view of views) {
      const res = await coordinator.get(`/api/v1/projects/${projectA}/planning?view=${view}&q=${encodeURIComponent(`RC golden ${suffix}`)}`);
      expect(res.status).toBe(200);
      payloads.push(res.body);
    }
    const [list, kanban, gantt, marcos] = payloads;
    expect(taskIds(list)).toEqual(taskIds(kanban));
    expect(taskIds(list)).toEqual(taskIds(gantt));
    expect(taskIds(list)).toEqual(taskIds(marcos));
    const listed = list.tasks.find((row: { id: string }) => row.id === taskId);
    expect(listed.status).toBe("IN_PROGRESS");
    expect(listed.plannedStartAt.slice(0, 10)).toBe("2026-10-05");
    expect(kanban.tasks.find((row: { id: string }) => row.id === taskId).status).toBe("IN_PROGRESS");
    expect(gantt.schedule.lanes.some((row: { id: string; kind: string }) => row.kind === "TASK" && row.id === taskId)).toBe(
      true,
    );
    const entity = await coordinator.get(`/api/v1/projects/${projectA}/milestones/${milestoneId}`);
    expect(entity.body.status).toBe("AT_RISK");
    expect(entity.body.recordedStatus).toBe("PLANNED");
    expect(entity.body.risk.explanation).toMatch(/late|atras/i);
    const listedMs = list.milestones.find((row: { id: string }) => row.id === milestoneId);
    const marcosMs = marcos.milestones.find((row: { id: string }) => row.id === milestoneId);
    expect(listedMs.status).toBe(entity.body.status);
    expect(marcosMs.status).toBe(entity.body.status);
    expect(listedMs.risk.explanation).toBe(entity.body.risk.explanation);

    const after = await snapshotSiblings();
    expect(after).toEqual(before);
    expect(after.issue).toBe("OPEN");
    expect(after.milestone).toBe("PLANNED");
    expect(after.phase).not.toBe("COMPLETED");
    expect(after.deliverable).not.toBe("DELIVERED");
    expect(after.workPackage).not.toBe("DONE");
    if (after.gate) {
      expect(after.gate).not.toMatch(/RELEASED/);
    }
  });

  it("M4.8-HTTP-01/ADV-01 omit-not-leak across tenant, inspect, search, and linked preview", async () => {
    const hidden = await ownerB
      .post(`/api/v1/projects/${projectB}/tasks`)
      .set("Idempotency-Key", key("hidden"))
      .send({ title: `Hidden B ${suffix}` });
    expect(hidden.status).toBeLessThan(400);

    const cross = await coordinator.get(`/api/v1/projects/${projectB}/planning`);
    expect(cross.status).toBe(403);
    expect(JSON.stringify(cross.body)).not.toContain(`Hidden B ${suffix}`);
    expect(JSON.stringify(cross.body)).not.toMatch(/"total":\s*[1-9]/);

    const search = await coordinator.get(`/api/v1/projects/${projectA}/planning?q=${encodeURIComponent(`Hidden B ${suffix}`)}`);
    expect(search.status).toBe(200);
    expect(search.body.tasks).toEqual([]);
    expect(JSON.stringify(search.body)).not.toContain(`Hidden B ${suffix}`);

    const inspect = await coordinator.get(`/api/v1/projects/${projectA}/planning?inspect=${hidden.body.id}`);
    expect(inspect.body.inspected).toBeNull();
    expect(JSON.stringify(inspect.body)).not.toContain(`Hidden B ${suffix}`);

    const viewerRead = await viewer.get(`/api/v1/projects/${projectA}/planning`);
    expect(viewerRead.status).toBe(200);
    expect(JSON.stringify(viewerRead.body)).not.toContain("1 item oculto");
    expect(JSON.stringify(viewerRead.body)).not.toContain(`Hidden B ${suffix}`);

    const context = await coordinator.get(`/api/v1/projects/${projectA}/deliverables/${deliverableId}/context`);
    expect([200, 403].includes(context.status)).toBe(true);
    if (context.status === 200) {
      expect(JSON.stringify(context.body)).not.toContain(`Hidden B ${suffix}`);
      expect(JSON.stringify(context.body)).not.toMatch(/item oculto/i);
    }
  });

  it("M4.8-PERF-01 representative planning views stay bounded", async () => {
    const volume = 40;
    await prisma.task.createMany({
      data: Array.from({ length: volume }, (_, index) => ({
        organizationId: orgA,
        projectId: projectA,
        title: `Perf ${suffix} ${index}`,
        status: index % 5 === 0 ? "IN_PROGRESS" : "TODO",
        dueDate: index % 7 === 0 ? new Date("2001-01-01T00:00:00.000Z") : new Date("2099-01-01T00:00:00.000Z"),
        createdByUserId: contributorUserId,
      })),
    });
    const observations: Record<string, number> = {};
    for (const view of ["list", "kanban", "gantt", "milestones"] as const) {
      const started = Date.now();
      const res = await coordinator.get(`/api/v1/projects/${projectA}/planning?view=${view}&pageSize=50`);
      expect(res.status).toBe(200);
      observations[view] = Date.now() - started;
      expect(res.body.tasks.length).toBeLessThanOrEqual(50);
      expect(res.body.page.total).toBeGreaterThan(volume);
    }
    expect(Math.max(...Object.values(observations))).toBeLessThan(8_000);
    process.stdout.write(`M4.8-PERF-01 observations_ms=${JSON.stringify(observations)}\n`);
  });
});
