import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLE_TEMPLATES } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { putObjectBytes } from "../../src/files/object-storage";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `pf14-${Date.now()}`;

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
let publisher: Agent;
let reviewer: Agent;
let coordinator: Agent;
let viewer: Agent;
let documentId: string;
let revisionR1: string;
let impactId: string;
let impactIssueId: string;
let manualIssueId: string;

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

  const roles = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
  const reviewerRole = roles.body.find((role: { templateKey: string }) => role.templateKey === "REVIEWER_REVISION_APPROVER");
  const reviewerTemplate = ROLE_TEMPLATES.find((role) => role.key === "REVIEWER_REVISION_APPROVER");
  await ownerA.patch(`/api/v1/organizations/${orgA}/roles/${reviewerRole.id}`).send({
    permissions: [...(reviewerTemplate?.permissions ?? []), "revision.make_current"],
  });

  publisher = await inviteToProject("publisher", "DISCIPLINE_COORDINATOR");
  reviewer = await inviteToProject("reviewer", "REVIEWER_REVISION_APPROVER");
  coordinator = await inviteToProject("coordinator", "PROJECT_COORDINATOR");
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

async function uploadPublishApprove(revCode: string, contents: string) {
  const draft = await publisher.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions`).send({
    revisionCode: revCode,
    fileName: "model.pdf",
  });
  expect(draft.status).toBeLessThan(400);
  const bytes = Buffer.from(contents);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const url = await publisher.post(
    `/api/v1/projects/${projectA}/documents/${documentId}/revisions/${draft.body.id}/upload-url`,
  );
  await putObjectBytes(url.body.storageKey, bytes);
  const completed = await publisher
    .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${draft.body.id}/complete-upload`)
    .send({ checksumSha256: checksum, mimeType: "application/pdf" });
  expect(completed.status).toBeLessThan(400);
  await prisma.storedObject.update({
    where: { id: completed.body.storedObjectId },
    data: { scanStatus: "CLEAN" },
  });
  await publisher
    .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${draft.body.id}/publish`)
    .set("Idempotency-Key", `pub-${revCode}-${suffix}`)
    .send({});
  await reviewer.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${draft.body.id}/review`);
  await reviewer
    .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${draft.body.id}/approve`)
    .set("Idempotency-Key", `apr-${revCode}-${suffix}`)
    .send({});
  return draft.body.id as string;
}

describe("PF-1.4 Coordination / Impact Analysis Foundation", () => {
  it("creates a document and makes a revision current", async () => {
    const created = await publisher.post(`/api/v1/projects/${projectA}/documents`).send({
      title: "Structural model",
      code: `STR-200-${suffix}`,
      disciplineId: "structure",
    });
    expect(created.status).toBeLessThan(400);
    documentId = created.body.id;
    revisionR1 = await uploadPublishApprove("R01", `pf14-r1-${suffix}`);
    const current = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `cur-r1-${suffix}`)
      .send({ expectedVersion: 1 });
    expect(current.status).toBeLessThan(400);
  });

  it("creates exactly one PENDING_ANALYSIS case and never auto-IMPACTED or auto-Issues", async () => {
    const listed = await coordinator.get(`/api/v1/projects/${projectA}/impacts`);
    expect(listed.status).toBe(200);
    const forDoc = listed.body.filter((row: { documentId: string }) => row.documentId === documentId);
    expect(forDoc).toHaveLength(1);
    expect(forDoc[0].status).toBe("PENDING_ANALYSIS");
    expect(forDoc[0].assessmentResult).toBeNull();
    expect(forDoc[0].assessedByUserId).toBeNull();
    impactId = forDoc[0].id;

    const replayCurrent = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `cur-r1-${suffix}`)
      .send({ expectedVersion: 1 });
    expect(replayCurrent.status).toBeLessThan(400);
    const again = await coordinator.get(`/api/v1/projects/${projectA}/impacts`);
    expect(again.body.filter((row: { documentId: string }) => row.documentId === documentId)).toHaveLength(1);

    const issues = await coordinator.get(`/api/v1/projects/${projectA}/issues`);
    expect(issues.status).toBe(200);
    expect(issues.body).toEqual([]);

    const events = await prisma.outboxMessage.findMany({
      where: { eventType: { in: ["CurrentRevisionChanged", "NewBaseEstablished"] } },
    });
    expect(events.filter((row) => (row.payload as { documentId?: string }).documentId === documentId).length).toBe(2);
    expect(events.every((row) => row.processedAt != null)).toBe(true);

    const createdAudit = await prisma.auditEvent.findFirst({
      where: { eventType: "IMPACT_CREATED", resourceId: impactId },
    });
    expect(createdAudit).toBeTruthy();
  });

  it("denies Issue-from-Impact before assessment and ignores client org/project spoofing", async () => {
    const premature = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/issues`)
      .set("Idempotency-Key", `iss-early-${suffix}`)
      .send({ title: "too early" });
    expect(premature.status).toBe(409);

    const spoof = await ownerB.get(`/api/v1/projects/${projectA}/impacts`);
    expect(spoof.status).toBe(403);
    const forged = await coordinator.get(`/api/v1/projects/${projectA}/impacts/${randomUUID()}`);
    expect(forged.status).toBe(403);
    const cross = await coordinator.get(`/api/v1/projects/${projectB}/impacts`);
    expect(cross.status).toBe(403);
  });

  it("requires explicit assessment with actor, time, and rationale", async () => {
    const viewerAssess = await viewer
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/assess`)
      .set("Idempotency-Key", `assess-viewer-${suffix}`)
      .send({ result: "IMPACTED", rationale: "viewer cannot assess" });
    expect(viewerAssess.status).toBe(403);

    const assessed = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/assess`)
      .set("Idempotency-Key", `assess-1-${suffix}`)
      .send({ result: "IMPACTED", rationale: "clash with architecture grid", affectedContext: "structure" });
    expect(assessed.status).toBeLessThan(400);
    expect(assessed.body.status).toBe("IMPACTED");
    expect(assessed.body.assessmentResult).toBe("IMPACTED");
    expect(assessed.body.assessmentRationale).toBe("clash with architecture grid");
    expect(assessed.body.assessedByUserId).toBeTruthy();
    expect(assessed.body.assessedAt).toBeTruthy();

    const replay = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/assess`)
      .set("Idempotency-Key", `assess-1-${suffix}`)
      .send({ result: "IMPACTED", rationale: "clash with architecture grid", affectedContext: "structure" });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(impactId);

    const stillNoIssues = await prisma.issue.count({ where: { impactAnalysisId: impactId } });
    expect(stillNoIssues).toBe(0);
  });

  it("opens an explicit Issue from Impact and a separate manual Issue", async () => {
    const spoofFromImpact = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/issues`)
      .set("Idempotency-Key", `iss-spoof-${suffix}`)
      .send({
        title: "spoof",
        organizationId: orgB,
        projectId: projectB,
        origin: "MANUAL",
      });
    expect(spoofFromImpact.status).toBe(403);

    const fromImpact = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/issues`)
      .set("Idempotency-Key", `iss-impact-${suffix}`)
      .send({
        title: "Update grid alignment",
        description: "Beam clashes with architectural grid",
        severity: "HIGH",
        priority: "NORMAL",
        responsibleDisciplineId: "structure",
      });
    expect(fromImpact.status).toBeLessThan(400);
    expect(fromImpact.body.origin).toBe("IMPACT");
    expect(fromImpact.body.impactAnalysisId).toBe(impactId);
    expect(fromImpact.body.status).toBe("OPEN");
    expect(fromImpact.body.severity).toBe("HIGH");
    expect(fromImpact.body.priority).toBe("NORMAL");
    expect(fromImpact.body.responsibleDisciplineId).toBe("structure");
    expect(fromImpact.body.assigneeUserId).toBeNull();
    expect(fromImpact.body.organizationId).toBe(orgA);
    expect(fromImpact.body.projectId).toBe(projectA);
    impactIssueId = fromImpact.body.id;

    const manual = await coordinator
      .post(`/api/v1/projects/${projectA}/issues`)
      .set("Idempotency-Key", `iss-manual-${suffix}`)
      .send({
        title: "Site access decision",
        severity: "MEDIUM",
        priority: "URGENT",
      });
    expect(manual.status).toBeLessThan(400);
    expect(manual.body.origin).toBe("MANUAL");
    expect(manual.body.impactAnalysisId).toBeNull();
    expect(manual.body.severity).toBe("MEDIUM");
    expect(manual.body.priority).toBe("URGENT");
    manualIssueId = manual.body.id;

    const viewerCreate = await viewer
      .post(`/api/v1/projects/${projectA}/issues`)
      .set("Idempotency-Key", `iss-viewer-${suffix}`)
      .send({ title: "nope" });
    expect(viewerCreate.status).toBe(403);
  });

  it("denies Impact resolve while linked Issues are open/active, including RESOLVED", async () => {
    const blocked = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/resolve`)
      .set("Idempotency-Key", `imp-res-1-${suffix}`)
      .send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("COORDINATION_STATE");

    for (const [from, to] of [
      ["OPEN", "IN_ANALYSIS"],
      ["IN_ANALYSIS", "IN_PROGRESS"],
      ["IN_PROGRESS", "READY_FOR_REVIEW"],
      ["READY_FOR_REVIEW", "RESOLVED"],
    ] as const) {
      const moved = await coordinator
        .post(`/api/v1/projects/${projectA}/issues/${impactIssueId}/status`)
        .set("Idempotency-Key", `st-${from}-${to}-${suffix}`)
        .send({ status: to });
      expect(moved.status).toBeLessThan(400);
      expect(moved.body.status).toBe(to);
    }

    const stillBlocked = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/resolve`)
      .set("Idempotency-Key", `imp-res-2-${suffix}`)
      .send({});
    expect(stillBlocked.status).toBe(409);

    const closed = await coordinator
      .post(`/api/v1/projects/${projectA}/issues/${impactIssueId}/status`)
      .set("Idempotency-Key", `st-closed-${suffix}`)
      .send({ status: "CLOSED" });
    expect(closed.status).toBeLessThan(400);
    expect(closed.body.status).toBe("CLOSED");
    expect(closed.body.closedByUserId).toBeTruthy();

    const resolved = await coordinator
      .post(`/api/v1/projects/${projectA}/impacts/${impactId}/resolve`)
      .set("Idempotency-Key", `imp-res-3-${suffix}`)
      .send({});
    expect(resolved.status).toBeLessThan(400);
    expect(resolved.body.status).toBe("RESOLVED");
    expect(resolved.body.resolvedByUserId).toBeTruthy();
  });

  it("keeps RESOLVED ≠ CLOSED, reopen history, comments, and evidence", async () => {
    const reopen = await coordinator
      .post(`/api/v1/projects/${projectA}/issues/${impactIssueId}/reopen`)
      .set("Idempotency-Key", `reopen-${suffix}`)
      .send({ rationale: "new clash found" });
    expect(reopen.status).toBeLessThan(400);
    expect(reopen.body.status).toBe("REOPENED");

    const history = await coordinator.get(`/api/v1/projects/${projectA}/issues/${impactIssueId}/history`);
    expect(history.status).toBe(200);
    expect(history.body.some((row: { toStatus: string }) => row.toStatus === "CLOSED")).toBe(true);
    expect(history.body.some((row: { toStatus: string }) => row.toStatus === "REOPENED")).toBe(true);

    const comment = await coordinator
      .post(`/api/v1/projects/${projectA}/issues/${impactIssueId}/comments`)
      .send({ body: "Need updated section cut" });
    expect(comment.status).toBeLessThan(400);
    const comments = await coordinator.get(`/api/v1/projects/${projectA}/issues/${impactIssueId}/comments`);
    expect(comments.body).toHaveLength(1);

    const evidence = await coordinator
      .post(`/api/v1/projects/${projectA}/issues/${impactIssueId}/evidence`)
      .send({ kind: "NOTE", note: "Marked on sheet A-101" });
    expect(evidence.status).toBeLessThan(400);
    const listed = await coordinator.get(`/api/v1/projects/${projectA}/issues/${impactIssueId}/evidence`);
    expect(listed.body).toHaveLength(1);

    const assigned = await coordinator
      .post(`/api/v1/projects/${projectA}/issues/${manualIssueId}/assign`)
      .send({ assigneeUserId: randomUUID() });
    expect(assigned.status).toBeLessThan(400);
    expect(assigned.body.assigneeUserId).toBeTruthy();
    expect(assigned.body.responsibleDisciplineId).toBeNull();

    const patched = await coordinator.patch(`/api/v1/projects/${projectA}/issues/${manualIssueId}`).send({
      priority: "HIGH",
      responsibleDisciplineId: "architecture",
    });
    expect(patched.status).toBeLessThan(400);
    expect(patched.body.priority).toBe("HIGH");
    expect(patched.body.severity).toBe("MEDIUM");
    expect(patched.body.responsibleDisciplineId).toBe("architecture");
    expect(patched.body.assigneeUserId).toBeTruthy();
  });

  it("isolates tenants and keeps Gates out of Coordination while Planning tables live in planning", async () => {
    const crossIssue = await ownerB.get(`/api/v1/projects/${projectA}/issues/${impactIssueId}`);
    expect(crossIssue.status).toBe(403);
    const spoofCreate = await ownerB
      .post(`/api/v1/projects/${projectB}/issues`)
      .set("Idempotency-Key", `spoof-${suffix}`)
      .send({ title: "steal", organizationId: orgA, projectId: projectA, origin: "IMPACT", impactAnalysisId: impactId });
    expect(spoofCreate.status).toBeGreaterThanOrEqual(400);
    if (spoofCreate.status < 400) {
      expect(spoofCreate.body.organizationId).toBe(orgB);
      expect(spoofCreate.body.origin).toBe("MANUAL");
    }

    const tables = await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('coordination', 'planning', 'governance')
        AND table_name IN ('tasks', 'milestones', 'gates', 'formal_exceptions', 'task_dependencies')
    `;
    expect(
      tables.filter(
        (row) =>
          row.table_name === "gates" ||
          row.table_name === "formal_exceptions" ||
          row.table_schema === "coordination" ||
          row.table_schema === "governance",
      ),
    ).toEqual([]);
    expect(tables.filter((row) => row.table_schema === "planning").map((row) => row.table_name).sort()).toEqual([
      "milestones",
      "task_dependencies",
      "tasks",
    ]);

    const document = await reviewer.get(`/api/v1/projects/${projectA}/documents/${documentId}`);
    expect(document.body.currentRevisionId).toBe(revisionR1);
  });
});
