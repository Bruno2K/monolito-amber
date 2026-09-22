import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FORBIDDEN_PERMISSIONS, ROLE_TEMPLATES } from "@amber/shared";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp, totpFromSecret } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `pf16-${Date.now()}`;

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
let approver: Agent;
let viewer: Agent;
let unenrolledApprover: Agent;
let coordinatorUserId: string;
let approverUserId: string;
let approverSecret: string;
let issueId: string;
let taskId: string;
let milestoneId: string;
let documentId: string;
let revisionId: string;
let readyGateId: string;
let readyGateVersion: number;
let blockedGateId: string;
let blockedRequirementId: string;
let exceptionId: string;
let releaseDecisionId: string;

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
  approver = await inviteToProject("approver", "GOVERNANCE_APPROVER");
  viewer = await inviteToProject("viewer", "VIEWER");
  unenrolledApprover = await inviteToProject("approver-open", "GOVERNANCE_APPROVER");

  coordinatorUserId = (await coordinator.get("/api/v1/auth/session")).body.userId;
  approverUserId = (await approver.get("/api/v1/auth/session")).body.userId;
  const enrolled = await enrollTotp(approver);
  approverSecret = enrolled.secret;
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

describe("PF-1.6 Governance / Gates / Formal Exceptions", () => {
  it("A — evaluates all seven requirement types without mutating upstream", async () => {
    const session = await coordinator.get(`/api/v1/auth/session?projectId=${projectA}`);
    expect(session.body.permissions).toContain("exception.request");
    expect(session.body.permissions).toContain("gate.evaluate");
    expect(session.body.permissions).not.toContain("gate.release");

    const roles = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
    const coordinatorRole = roles.body.find((role: { templateKey: string }) => role.templateKey === "PROJECT_COORDINATOR");
    expect(coordinatorRole.permissions).toContain("exception.request");

    const issue = await coordinator
      .post(`/api/v1/projects/${projectA}/issues`)
      .set("Idempotency-Key", `iss-${suffix}`)
      .send({ title: "Pending closeout" });
    expect(issue.status).toBeLessThan(400);
    issueId = issue.body.id;

    const task = await coordinator
      .post(`/api/v1/projects/${projectA}/tasks`)
      .set("Idempotency-Key", `task-${suffix}`)
      .send({ title: "Closeout task" });
    expect(task.status).toBeLessThan(400);
    taskId = task.body.id;

    const milestone = await coordinator
      .post(`/api/v1/projects/${projectA}/milestones`)
      .set("Idempotency-Key", `ms-${suffix}`)
      .send({ title: "IFC gate" });
    expect(milestone.status).toBeLessThan(400);
    milestoneId = milestone.body.id;

    const document = await prisma.document.create({
      data: {
        organizationId: orgA,
        projectId: projectA,
        code: `GOV-${suffix}`,
        title: "Governance packet",
        status: "ACTIVE",
      },
    });
    documentId = document.id;
    const revision = await prisma.revision.create({
      data: {
        organizationId: orgA,
        projectId: projectA,
        documentId,
        revisionCode: "R01",
        status: "APPROVED",
        createdByUserId: coordinatorUserId,
        approvedByUserId: coordinatorUserId,
        approvedAt: new Date(),
      },
    });
    revisionId = revision.id;
    await prisma.document.update({
      where: { id: documentId },
      data: { currentRevisionId: revisionId },
    });

    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/gates`)
      .set("Idempotency-Key", `gate-ready-${suffix}`)
      .send({ name: "IFC package", organizationId: orgA });
    expect(created.status).toBeLessThan(400);
    expect(created.body.status).toBe("NOT_READY");
    readyGateId = created.body.id;

    const types = [
      {
        type: "DOCUMENT_REQUIRED",
        title: "Packet exists",
        config: { documentId },
      },
      {
        type: "REVISION_APPROVED",
        title: "Packet approved",
        config: { documentId, revisionId },
      },
      {
        type: "ISSUE_STATE",
        title: "Issue open",
        config: { issueId, allowedStates: ["OPEN"] },
      },
      {
        type: "TASK_STATE",
        title: "Task todo",
        config: { taskId, allowedStates: ["TODO"] },
      },
      {
        type: "MILESTONE_STATE",
        title: "Milestone planned",
        config: { milestoneId, allowedStates: ["PLANNED"] },
      },
      {
        type: "MANUAL_APPROVAL",
        title: "Coordinator sign-off",
        config: { approved: true },
      },
      {
        type: "CHECKLIST_COMPLETE",
        title: "Closeout list",
        config: {},
        checklist: { items: [{ id: "c1", label: "Signed", complete: true }] },
      },
    ];
    for (const requirement of types) {
      const added = await coordinator
        .post(`/api/v1/projects/${projectA}/gates/${readyGateId}/requirements`)
        .send(requirement);
      expect(added.status).toBeLessThan(400);
    }

    const beforeIssue = await prisma.issue.findUnique({ where: { id: issueId } });
    const beforeTask = await prisma.task.findUnique({ where: { id: taskId } });
    const beforeDocument = await prisma.document.findUnique({ where: { id: documentId } });
    const beforeRevision = await prisma.revision.findUnique({ where: { id: revisionId } });

    const evaluated = await coordinator.post(`/api/v1/projects/${projectA}/gates/${readyGateId}/evaluate`);
    expect(evaluated.status).toBeLessThan(400);
    expect(evaluated.body.status).toBe("READY");
    expect(evaluated.body.requirements).toHaveLength(7);
    for (const requirement of evaluated.body.requirements) {
      expect(requirement.satisfaction).toBe("SATISFIED");
      expect(requirement.coveredByException).toBe(false);
    }
    readyGateVersion = evaluated.body.version;

    const afterIssue = await prisma.issue.findUnique({ where: { id: issueId } });
    const afterTask = await prisma.task.findUnique({ where: { id: taskId } });
    const afterDocument = await prisma.document.findUnique({ where: { id: documentId } });
    const afterRevision = await prisma.revision.findUnique({ where: { id: revisionId } });
    expect(afterIssue?.updatedAt.toISOString()).toBe(beforeIssue?.updatedAt.toISOString());
    expect(afterIssue?.status).toBe(beforeIssue?.status);
    expect(afterTask?.updatedAt.toISOString()).toBe(beforeTask?.updatedAt.toISOString());
    expect(afterTask?.status).toBe(beforeTask?.status);
    expect(afterDocument?.updatedAt.toISOString()).toBe(beforeDocument?.updatedAt.toISOString());
    expect(afterRevision?.status).toBe("APPROVED");
    expect(afterRevision?.updatedAt.toISOString()).toBe(beforeRevision?.updatedAt.toISOString());
  });

  it("B — READY ≠ RELEASED; evaluation never auto-releases", async () => {
    const again = await coordinator.post(`/api/v1/projects/${projectA}/gates/${readyGateId}/evaluate`);
    expect(again.status).toBeLessThan(400);
    expect(again.body.status).toBe("READY");
    expect(again.body.status).not.toBe("RELEASED");
    readyGateVersion = again.body.version;

    const got = await coordinator.get(`/api/v1/projects/${projectA}/gates/${readyGateId}`);
    expect(got.body.status).toBe("READY");
    expect(got.body.releasedAt).toBeNull();

    const denied = await coordinator
      .post(`/api/v1/projects/${projectA}/gates/${readyGateId}/release`)
      .set("Idempotency-Key", `rel-coord-${suffix}`)
      .send({ expectedVersion: readyGateVersion });
    expect(denied.status).toBe(403);

    const missingVersion = await approver
      .post(`/api/v1/projects/${projectA}/gates/${readyGateId}/release`)
      .set("Idempotency-Key", `rel-missing-${suffix}`)
      .send({});
    expect(missingVersion.status).toBeGreaterThanOrEqual(400);

    const released = await approver
      .post(`/api/v1/projects/${projectA}/gates/${readyGateId}/release`)
      .set("Idempotency-Key", `rel-ready-${suffix}`)
      .send({ expectedVersion: readyGateVersion });
    expect(released.status).toBeLessThan(400);
    expect(released.body.status).toBe("RELEASED");
    expect(released.body.releaseKind).toBe("NORMAL");
    expect(released.body.status).not.toBe("RELEASED_WITH_EXCEPTION");

    const replay = await approver
      .post(`/api/v1/projects/${projectA}/gates/${readyGateId}/release`)
      .set("Idempotency-Key", `rel-ready-${suffix}`)
      .send({ expectedVersion: readyGateVersion });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(readyGateId);
  });

  it("C/D — SoD and RELEASED_WITH_EXCEPTION keep UNSATISFIED visible", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/gates`)
      .set("Idempotency-Key", `gate-block-${suffix}`)
      .send({ name: "Blocked package" });
    expect(created.status).toBeLessThan(400);
    blockedGateId = created.body.id;

    const added = await coordinator.post(`/api/v1/projects/${projectA}/gates/${blockedGateId}/requirements`).send({
      type: "MANUAL_APPROVAL",
      title: "Missing sign-off",
      config: { approved: false },
    });
    expect(added.status).toBeLessThan(400);
    blockedRequirementId = added.body.requirements[0].id;

    const evaluated = await coordinator.post(`/api/v1/projects/${projectA}/gates/${blockedGateId}/evaluate`);
    expect(evaluated.status).toBeLessThan(400);
    expect(evaluated.body.status).toBe("BLOCKED");
    expect(evaluated.body.requirements[0].satisfaction).toBe("UNSATISFIED");
    expect(evaluated.body.requirements[0].coveredByException).toBe(false);

    const cannotRelease = await approver
      .post(`/api/v1/projects/${projectA}/gates/${blockedGateId}/release`)
      .set("Idempotency-Key", `rel-block-${suffix}`)
      .send({ expectedVersion: evaluated.body.version });
    expect(cannotRelease.status).toBe(409);

    const requested = await coordinator
      .post(`/api/v1/projects/${projectA}/exceptions`)
      .set("Idempotency-Key", `ex-req-${suffix}`)
      .send({
        gateId: blockedGateId,
        gateRequirementId: blockedRequirementId,
        reason: "Permit delay accepted by sponsor",
      });
    expect(requested.status).toBeLessThan(400);
    expect(requested.body.status).toBe("REQUESTED");
    expect(requested.body.satisfiesRequirement).toBe(false);
    exceptionId = requested.body.id;

    const selfApprove = await coordinator
      .post(`/api/v1/projects/${projectA}/exceptions/${exceptionId}/approve`)
      .set("Idempotency-Key", `ex-self-${suffix}`)
      .send({});
    expect(selfApprove.status).toBe(403);

    const approved = await approver
      .post(`/api/v1/projects/${projectA}/exceptions/${exceptionId}/approve`)
      .set("Idempotency-Key", `ex-apr-${suffix}`)
      .send({});
    expect(approved.status).toBeLessThan(400);
    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body.satisfiesRequirement).toBe(false);

    const afterApprove = await coordinator.get(`/api/v1/projects/${projectA}/gates/${blockedGateId}`);
    expect(afterApprove.body.requirements[0].satisfaction).toBe("UNSATISFIED");
    expect(afterApprove.body.requirements[0].coveredByException).toBe(true);
    expect(afterApprove.body.status).not.toBe("READY");

    const selfRelease = await coordinator
      .post(`/api/v1/projects/${projectA}/gates/${blockedGateId}/release`)
      .set("Idempotency-Key", `rel-self-${suffix}`)
      .send({ expectedVersion: afterApprove.body.version });
    expect(selfRelease.status).toBe(403);
    expect(selfRelease.body.code).toBe("SOD_VIOLATION");

    const released = await approver
      .post(`/api/v1/projects/${projectA}/gates/${blockedGateId}/release`)
      .set("Idempotency-Key", `rel-ex-${suffix}`)
      .send({ expectedVersion: afterApprove.body.version });
    expect(released.status).toBeLessThan(400);
    expect(released.body.status).toBe("RELEASED_WITH_EXCEPTION");
    expect(released.body.status).not.toBe("RELEASED");
    expect(released.body.releaseKind).toBe("WITH_EXCEPTION");
    expect(released.body.requirements[0].satisfaction).toBe("UNSATISFIED");
    expect(released.body.releaseDecision.usedExceptionIds).toContain(exceptionId);
    releaseDecisionId = released.body.releaseDecision.id;
  });

  it("E — revoke covering Exception after RELEASED_WITH_EXCEPTION re-evals to BLOCKED", async () => {
    const revoked = await approver.post(`/api/v1/projects/${projectA}/exceptions/${exceptionId}/revoke`).send({});
    expect(revoked.status).toBeLessThan(400);
    expect(revoked.body.status).toBe("REVOKED");

    const gate = await coordinator.get(`/api/v1/projects/${projectA}/gates/${blockedGateId}`);
    expect(gate.body.status).toBe("BLOCKED");
    expect(gate.body.requirements[0].satisfaction).toBe("UNSATISFIED");
    expect(gate.body.requirements[0].coveredByException).toBe(false);

    const releases = await coordinator.get(`/api/v1/projects/${projectA}/gates/${blockedGateId}/releases`);
    expect(releases.status).toBe(200);
    expect(releases.body).toHaveLength(1);
    expect(releases.body[0].id).toBe(releaseDecisionId);
    expect(releases.body[0].kind).toBe("WITH_EXCEPTION");
    expect(releases.body[0].usedExceptionIds).toContain(exceptionId);

    const persisted = await prisma.gateReleaseDecision.findUnique({ where: { id: releaseDecisionId } });
    expect(persisted?.kind).toBe("WITH_EXCEPTION");
  });

  it("F — isolates tenants and rejects client authority / forged ids", async () => {
    const cross = await ownerB.get(`/api/v1/projects/${projectA}/gates/${readyGateId}`);
    expect(cross.status).toBe(403);
    const crossEx = await ownerB.get(`/api/v1/projects/${projectA}/exceptions/${exceptionId}`);
    expect(crossEx.status).toBe(403);
    const forged = await coordinator.get(`/api/v1/projects/${projectA}/gates/${randomUUID()}`);
    expect(forged.status).toBe(403);
    const spoof = await coordinator
      .post(`/api/v1/projects/${projectA}/gates`)
      .set("Idempotency-Key", `gate-spoof-${suffix}`)
      .send({ name: "spoof", organizationId: orgB, projectId: projectB });
    expect(spoof.status).toBe(403);
    const otherProject = await coordinator.get(`/api/v1/projects/${projectB}/gates`);
    expect(otherProject.status).toBe(403);
  });

  it("G — MFA enrollment and recent-auth are required for approve/release", async () => {
    const created = await coordinator
      .post(`/api/v1/projects/${projectA}/gates`)
      .set("Idempotency-Key", `gate-mfa-${suffix}`)
      .send({ name: "MFA package" });
    const added = await coordinator.post(`/api/v1/projects/${projectA}/gates/${created.body.id}/requirements`).send({
      type: "MANUAL_APPROVAL",
      title: "Sign-off",
      config: { approved: false },
    });
    const requested = await coordinator
      .post(`/api/v1/projects/${projectA}/exceptions`)
      .set("Idempotency-Key", `ex-mfa-${suffix}`)
      .send({
        gateId: created.body.id,
        gateRequirementId: added.body.requirements[0].id,
        reason: "MFA evidence",
      });
    expect(requested.status).toBeLessThan(400);

    const unenrolled = await unenrolledApprover
      .post(`/api/v1/projects/${projectA}/exceptions/${requested.body.id}/approve`)
      .set("Idempotency-Key", `ex-unenrolled-${suffix}`)
      .send({});
    expect(unenrolled.status).toBe(401);
    expect(unenrolled.body.code).toBe("MFA_REQUIRED");

    await prisma.session.updateMany({
      where: { userId: approverUserId },
      data: { lastReauthAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    const stale = await approver
      .post(`/api/v1/projects/${projectA}/exceptions/${requested.body.id}/approve`)
      .set("Idempotency-Key", `ex-stale-${suffix}`)
      .send({});
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe("REAUTH_REQUIRED");

    const reauth = await approver.post("/api/v1/auth/reauthenticate").send({
      password: PASSWORD,
      totp: totpFromSecret(approverSecret),
    });
    expect(reauth.status).toBeLessThan(400);
  });

  it("H/I — closed catalog, no gate.override, and audit/outbox evidence", async () => {
    const catalog = await ownerA.get("/api/v1/catalog/permissions");
    expect(catalog.status).toBe(200);
    expect(catalog.body.permissions).toContain("exception.request");
    expect(catalog.body.permissions).not.toContain("gate.override");
    expect(FORBIDDEN_PERMISSIONS).toContain("gate.override");
    expect(ROLE_TEMPLATES.find((row) => row.key === "PROJECT_COORDINATOR")?.permissions).toContain(
      "exception.request",
    );

    const viewerCreate = await viewer
      .post(`/api/v1/projects/${projectA}/gates`)
      .set("Idempotency-Key", `gate-viewer-${suffix}`)
      .send({ name: "nope" });
    expect(viewerCreate.status).toBe(403);

    const audits = await prisma.auditEvent.findMany({
      where: {
        eventType: {
          in: [
            "GATE_CREATED",
            "GATE_EVALUATED",
            "GATE_RELEASED",
            "GATE_RELEASED_WITH_EXCEPTION",
            "EXCEPTION_REQUESTED",
            "EXCEPTION_APPROVED",
            "EXCEPTION_REVOKED",
          ],
        },
      },
    });
    expect(audits.some((row) => row.eventType === "GATE_EVALUATED")).toBe(true);
    expect(audits.some((row) => row.eventType === "GATE_RELEASED")).toBe(true);
    expect(audits.some((row) => row.eventType === "GATE_RELEASED_WITH_EXCEPTION")).toBe(true);
    expect(audits.some((row) => row.eventType === "EXCEPTION_APPROVED")).toBe(true);
    expect(audits.some((row) => row.eventType === "EXCEPTION_REVOKED")).toBe(true);
    const exceptionApproved = audits.find((row) => row.eventType === "EXCEPTION_APPROVED");
    expect(JSON.stringify(exceptionApproved?.payload)).toMatch(/UNSATISFIED/);

    const outbox = await prisma.outboxMessage.findMany({
      where: {
        eventType: { in: ["GateReleased", "GateReleasedWithException", "ExceptionApproved", "ExceptionRevoked"] },
      },
    });
    expect(outbox.some((row) => row.eventType === "GateReleased")).toBe(true);
    expect(outbox.some((row) => row.eventType === "GateReleasedWithException")).toBe(true);
  });
});
