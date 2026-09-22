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
const suffix = `pf13-${Date.now()}`;

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
let documentId: string;
let revisionR1: string;
let revisionR2: string;
let storedObjectId: string;

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
  expect(project.status).toBeLessThan(400);
  projectA = project.body.project.id;

  const other = await ownerB.post(`/api/v1/organizations/${orgB}/projects`).send({ name: `Plant ${suffix}` });
  projectB = other.body.project.id;

  const roles = await ownerA.get(`/api/v1/organizations/${orgA}/roles`);
  const reviewerRole = roles.body.find((role: { templateKey: string }) => role.templateKey === "REVIEWER_REVISION_APPROVER");
  const publisherRole = roles.body.find((role: { templateKey: string }) => role.templateKey === "DISCIPLINE_COORDINATOR");
  const reviewerTemplate = ROLE_TEMPLATES.find((role) => role.key === "REVIEWER_REVISION_APPROVER");
  const publisherTemplate = ROLE_TEMPLATES.find((role) => role.key === "DISCIPLINE_COORDINATOR");
  const patchedReviewer = await ownerA.patch(`/api/v1/organizations/${orgA}/roles/${reviewerRole.id}`).send({
    permissions: [...(reviewerTemplate?.permissions ?? []), "revision.make_current"],
  });
  expect(patchedReviewer.status).toBeLessThan(400);
  const patchedPublisher = await ownerA.patch(`/api/v1/organizations/${orgA}/roles/${publisherRole.id}`).send({
    permissions: [
      ...(publisherTemplate?.permissions ?? []),
      "revision.approve",
      "revision.reject",
      "revision.make_current",
    ],
  });
  expect(patchedPublisher.status).toBeLessThan(400);

  publisher = await inviteToProject("publisher", "DISCIPLINE_COORDINATOR");
  reviewer = await inviteToProject("reviewer", "REVIEWER_REVISION_APPROVER");
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

async function uploadAndComplete(agent: Agent, docId: string, revId: string, contents: string) {
  const bytes = Buffer.from(contents);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const url = await agent.post(`/api/v1/projects/${projectA}/documents/${docId}/revisions/${revId}/upload-url`);
  expect(url.status).toBeLessThan(400);
  await putObjectBytes(url.body.storageKey, bytes);
  const complete = await agent
    .post(`/api/v1/projects/${projectA}/documents/${docId}/revisions/${revId}/complete-upload`)
    .send({ checksumSha256: checksum, mimeType: "application/pdf" });
  expect(complete.status).toBeLessThan(400);
  return complete.body as { storedObjectId: string; scanStatus: string; duplicateWarning: boolean };
}

describe("PF-1.3 Documents & Revisions Foundation", () => {
  it("creates a stable Document whose identity is not a filename or storage key", async () => {
    const created = await publisher.post(`/api/v1/projects/${projectA}/documents`).send({
      title: "Architectural floor plan",
      code: `ARC-100-${suffix}`,
      disciplineId: "architecture",
      documentType: "drawing",
    });
    expect(created.status).toBeLessThan(400);
    documentId = created.body.id;
    expect(created.body.code).toBe(`ARC-100-${suffix}`);
    expect(created.body.currentRevisionId).toBeNull();
    expect(created.body.status).toBe("ACTIVE");
    expect(created.body.id).not.toContain("model.pdf");

    const audit = await prisma.auditEvent.findFirst({
      where: { eventType: "DOCUMENT_CREATED", resourceId: documentId },
    });
    expect(audit).toBeTruthy();
  });

  it("fails closed on PENDING scan and publishes only after CLEAN + naming", async () => {
    const draft = await publisher.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions`).send({
      revisionCode: "R01",
      fileName: "model.pdf",
    });
    expect(draft.status).toBeLessThan(400);
    revisionR1 = draft.body.id;
    expect(draft.body.status).toBe("DRAFT");

    const uploaded = await uploadAndComplete(publisher, documentId, revisionR1, `bytes-r1-${suffix}`);
    storedObjectId = uploaded.storedObjectId;
    expect(uploaded.scanStatus).toBe("PENDING");

    const pendingPublish = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/publish`)
      .set("Idempotency-Key", `pub-pending-${suffix}`)
      .send({});
    expect(pendingPublish.status).toBe(403);
    expect(pendingPublish.body.code).toBe("SCAN_FAIL_CLOSED");

    await prisma.storedObject.update({ where: { id: storedObjectId }, data: { scanStatus: "CLEAN" } });

    const missingKey = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/publish`)
      .send({});
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.code).toBe("IDEMPOTENCY_REQUIRED");

    const published = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/publish`)
      .set("Idempotency-Key", `pub-r1-${suffix}`)
      .send({});
    expect(published.status).toBeLessThan(400);
    expect(published.body.status).toBe("PUBLISHED");
    expect(published.body.publishedByUserId).toBeTruthy();
    expect(published.body.checksumSha256).toHaveLength(64);

    const replay = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/publish`)
      .set("Idempotency-Key", `pub-r1-${suffix}`)
      .send({});
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(revisionR1);

    const mutate = await publisher
      .patch(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}`)
      .send({ revisionCode: "R01-MUTATED" });
    expect(mutate.status).toBe(409);
    expect(mutate.body.code).toBe("REVISION_IMMUTABLE");
  });

  it("enforces SoD: publisher cannot approve/reject/make-current; REJECTED is preserved", async () => {
    const tooEarly = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/approve`)
      .set("Idempotency-Key", `early-approve-${suffix}`)
      .send({});
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.code).toBe("REVISION_STATE");

    const reviewed = await reviewer.post(
      `/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/review`,
    );
    expect(reviewed.status).toBeLessThan(400);
    expect(reviewed.body.status).toBe("UNDER_REVIEW");

    const publisherApprove = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/approve`)
      .set("Idempotency-Key", `pub-approve-${suffix}`)
      .send({});
    expect(publisherApprove.status).toBe(403);
    expect(publisherApprove.body.code).toBe("SOD_VIOLATION");

    const approved = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/approve`)
      .set("Idempotency-Key", `apr-r1-${suffix}`)
      .send({ comment: "ok" });
    expect(approved.status).toBeLessThan(400);
    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body.approvedByUserId).toBeTruthy();

    const publisherCurrent = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `pub-current-${suffix}`)
      .send({ expectedVersion: 1 });
    expect(publisherCurrent.status).toBe(403);
    expect(publisherCurrent.body.code).toBe("SOD_VIOLATION");
  });

  it("makes current with CAS, rolls back an older APPROVED, and emits events without Impact/Issue", async () => {
    const current = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `cur-r1-${suffix}`)
      .send({ expectedVersion: 1 });
    expect(current.status).toBeLessThan(400);
    expect(current.body.currentRevisionId).toBe(revisionR1);
    expect(current.body.version).toBe(2);

    const stale = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `cur-stale-${suffix}`)
      .send({ expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("OPTIMISTIC_LOCK");

    const replay = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `cur-r1-${suffix}`)
      .send({ expectedVersion: 1 });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.currentRevisionId).toBe(revisionR1);

    const r2 = await publisher.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions`).send({
      revisionCode: "R02",
      fileName: "model.pdf",
    });
    revisionR2 = r2.body.id;
    const uploaded = await uploadAndComplete(publisher, documentId, revisionR2, `bytes-r2-${suffix}`);
    await prisma.storedObject.update({ where: { id: uploaded.storedObjectId }, data: { scanStatus: "CLEAN" } });
    await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR2}/publish`)
      .set("Idempotency-Key", `pub-r2-${suffix}`)
      .send({});
    await reviewer.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR2}/review`);
    await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR2}/approve`)
      .set("Idempotency-Key", `apr-r2-${suffix}`)
      .send({});

    const advance = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR2}/make-current`)
      .set("Idempotency-Key", `cur-r2-${suffix}`)
      .send({ expectedVersion: 2 });
    expect(advance.status).toBeLessThan(400);
    expect(advance.body.currentRevisionId).toBe(revisionR2);
    expect(advance.body.isRollback).toBe(false);

    const stillApproved = await prisma.revision.findUnique({ where: { id: revisionR1 } });
    expect(stillApproved?.status).toBe("APPROVED");

    const rollbackNoReason = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `rb-noreason-${suffix}`)
      .send({ expectedVersion: 3 });
    expect(rollbackNoReason.status).toBe(409);

    const rollback = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/make-current`)
      .set("Idempotency-Key", `rb-r1-${suffix}`)
      .send({ expectedVersion: 3, reason: "restore approved base after coordination review" });
    expect(rollback.status).toBeLessThan(400);
    expect(rollback.body.currentRevisionId).toBe(revisionR1);
    expect(rollback.body.isRollback).toBe(true);

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    expect(doc?.currentRevisionId).toBe(revisionR1);

    const events = await prisma.outboxMessage.findMany({
      where: {
        eventType: { in: ["CurrentRevisionChanged", "NewBaseEstablished"] },
      },
    });
    expect(events.some((row) => row.eventType === "CurrentRevisionChanged")).toBe(true);
    expect(events.some((row) => row.eventType === "NewBaseEstablished")).toBe(true);
    for (const event of events) {
      const payload = event.payload as { documentId?: string; newRevisionId?: string };
      expect(payload.documentId).toBeTruthy();
      expect(payload.newRevisionId).toBeTruthy();
    }

    const tables = await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name IN ('impacts', 'issues', 'impact_analyses')
    `;
    expect(tables).toEqual([]);

    const download = await reviewer.get(
      `/api/v1/projects/${projectA}/documents/${documentId}/revisions/${revisionR1}/download-url`,
    );
    expect(download.status).toBeLessThan(400);
    expect(download.body.downloadUrl).toMatch(/^\/api\/v1\/files\/objects\//);
    const auditHasUrl = await prisma.auditEvent.findMany({
      where: { resourceId: documentId },
    });
    expect(JSON.stringify(auditHasUrl)).not.toContain(download.body.downloadUrl);
  });

  it("preserves a REJECTED revision and isolates tenants/projects", async () => {
    const rejectedDraft = await publisher.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions`).send({
      revisionCode: "R03",
      fileName: "model.pdf",
    });
    const uploaded = await uploadAndComplete(publisher, documentId, rejectedDraft.body.id, `bytes-r3-${suffix}`);
    await prisma.storedObject.update({ where: { id: uploaded.storedObjectId }, data: { scanStatus: "CLEAN" } });
    await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${rejectedDraft.body.id}/publish`)
      .set("Idempotency-Key", `pub-r3-${suffix}`)
      .send({});
    await reviewer.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${rejectedDraft.body.id}/review`);
    const rejected = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${rejectedDraft.body.id}/reject`)
      .set("Idempotency-Key", `rej-r3-${suffix}`)
      .send({ reason: "incorrect sheet set" });
    expect(rejected.status).toBeLessThan(400);
    expect(rejected.body.status).toBe("REJECTED");
    expect(rejected.body.rejectionReason).toBe("incorrect sheet set");

    const stillThere = await reviewer.get(
      `/api/v1/projects/${projectA}/documents/${documentId}/revisions/${rejectedDraft.body.id}`,
    );
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.status).toBe("REJECTED");

    const makeRejectedCurrent = await reviewer
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${rejectedDraft.body.id}/make-current`)
      .set("Idempotency-Key", `cur-rej-${suffix}`)
      .send({ expectedVersion: 4 });
    expect(makeRejectedCurrent.status).toBeGreaterThanOrEqual(400);

    const forged = randomUUID();
    const forgedDoc = await ownerA.get(`/api/v1/projects/${projectA}/documents/${forged}`);
    expect(forgedDoc.status).toBe(403);
    const crossOrg = await ownerB.get(`/api/v1/projects/${projectA}/documents/${documentId}`);
    expect(crossOrg.status).toBe(403);
    const crossProject = await publisher.get(`/api/v1/projects/${projectB}/documents/${documentId}`);
    expect(crossProject.status).toBe(403);
    const spoof = await ownerB
      .post(`/api/v1/projects/${projectB}/documents`)
      .send({ title: "steal", code: "X", organizationId: orgA, projectId: projectA });
    expect(spoof.status).toBeGreaterThanOrEqual(400);
  });

  it("fails closed when the scanner is unavailable and when the object is BLOCKED", async () => {
    process.env.AMBER_SCANNER_AVAILABLE = "0";
    const draft = await publisher.post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions`).send({
      revisionCode: "R04",
      fileName: "blocked.pdf",
    });
    const denied = await publisher.post(
      `/api/v1/projects/${projectA}/documents/${documentId}/revisions/${draft.body.id}/upload-url`,
    );
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("SCAN_FAIL_CLOSED");
    process.env.AMBER_SCANNER_AVAILABLE = "1";

    const uploaded = await uploadAndComplete(publisher, documentId, draft.body.id, `blocked-${suffix}`);
    await prisma.storedObject.update({ where: { id: uploaded.storedObjectId }, data: { scanStatus: "BLOCKED" } });
    const access = await ownerA.get(`/api/v1/files/${uploaded.storedObjectId}/access`);
    expect(access.status).toBe(403);
    const blockedPublish = await publisher
      .post(`/api/v1/projects/${projectA}/documents/${documentId}/revisions/${draft.body.id}/publish`)
      .set("Idempotency-Key", `pub-block-${suffix}`)
      .send({});
    expect(blockedPublish.status).toBe(403);
    delete process.env.AMBER_SCANNER_AVAILABLE;
  });
});
