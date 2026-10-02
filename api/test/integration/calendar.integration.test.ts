import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailAdapter } from "../../src/auth/email.adapter";
import { createTestApp } from "./app";
import { enrollTotp } from "./mfa";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

const PASSWORD = "correct-horse-12";
const suffix = `m52-${Date.now()}`;

type Agent = ReturnType<typeof request.agent>;

let db: TestDb;
let app: INestApplication;
let prisma: PrismaClient;
let emails: EmailAdapter;
let orgA: string;
let orgB: string;
let projectA: string;
let ownerA: Agent;
let ownerB: Agent;
let coordinator: Agent;
let contributor: Agent;
let viewer: Agent;
let external: Agent;
let orgAdminMembershipId: string;
let coordinatorMembershipId: string;
let contributorMembershipId: string;
let viewerMembershipId: string;
let externalMembershipId: string;
let teamId: string;
let calendarId: string;
let editorGrantId: string;
let viewerGrantId: string;
let timedEventId: string;
let allDayEventId: string;
let referencedEventId: string;
let taskId: string;
let taskTitle = "Calendar source task";

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
  const sessionA = await ownerA.get("/api/v1/auth/session");
  orgAdminMembershipId = sessionA.body.membership.id;

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

  coordinator = await invite("coordinator", "PROJECT_COORDINATOR");
  contributor = await invite("contributor", "CONTRIBUTOR_DESIGNER");
  viewer = await invite("viewer", "VIEWER");
  external = await invite("external", "EXTERNAL_CONTRIBUTOR", "EXTERNAL");

  const members = await ownerA.get(`/api/v1/organizations/${orgA}/members`);
  coordinatorMembershipId = members.body.find((row: { email: string }) => row.email === `coordinator-${suffix}@example.com`).id;
  contributorMembershipId = members.body.find((row: { email: string }) => row.email === `contributor-${suffix}@example.com`).id;
  viewerMembershipId = members.body.find((row: { email: string }) => row.email === `viewer-${suffix}@example.com`).id;
  externalMembershipId = members.body.find((row: { email: string }) => row.email === `external-${suffix}@example.com`).id;

  const team = await prisma.team.create({
    data: { organizationId: orgA, name: `Structure ${suffix}` },
  });
  teamId = team.id;
  await prisma.teamMembership.create({
    data: { teamId, organizationMembershipId: viewerMembershipId, status: "ACTIVE" },
  });

  const task = await coordinator
    .post(`/api/v1/projects/${projectA}/tasks`)
    .set("Idempotency-Key", `task-${suffix}`)
    .send({ title: taskTitle, dueDate: "2026-10-20T00:00:00.000Z" });
  expect(task.status).toBeLessThan(400);
  taskId = task.body.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

async function invite(label: string, templateKey: string, membershipType = "INTERNAL"): Promise<Agent> {
  const email = `${label}-${suffix}@example.com`;
  await ownerA.post(`/api/v1/organizations/${orgA}/invitations`).send({
    email,
    roleTemplateKey: membershipType === "EXTERNAL" ? "EXTERNAL_CONTRIBUTOR" : "VIEWER",
    membershipType,
  });
  const inviteRow = emails.sent.filter((message) => message.to === email).at(-1);
  const agent = request.agent(app.getHttpServer());
  await agent.post("/api/v1/invitations/accept").send({
    token: inviteRow?.token,
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

describe("M5.2 Calendar domain / API / access grants", () => {
  it("R01/R11 creates private calendars and suppresses inaccessible lists/counts", async () => {
    const first = await coordinator
      .post("/api/v1/calendars")
      .set("Idempotency-Key", `cal-1-${suffix}`)
      .send({ name: "Coord private", timeZone: "America/Sao_Paulo" });
    expect(first.status).toBeLessThan(400);
    calendarId = first.body.id;
    expect(first.body.effectiveRole).toBe("OWNER");
    expect(first.body.status).toBe("ACTIVE");

    const replay = await coordinator
      .post("/api/v1/calendars")
      .set("Idempotency-Key", `cal-1-${suffix}`)
      .send({ name: "Coord private", timeZone: "America/Sao_Paulo" });
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(calendarId);

    const second = await coordinator
      .post("/api/v1/calendars")
      .set("Idempotency-Key", `cal-2-${suffix}`)
      .send({ name: "Coord second", timeZone: "UTC", organizationId: orgB });
    expect(second.status).toBe(403);

    const unlimited = await coordinator
      .post("/api/v1/calendars")
      .set("Idempotency-Key", `cal-3-${suffix}`)
      .send({ name: "Coord extra", timeZone: "UTC" });
    expect(unlimited.status).toBeLessThan(400);

    const stranger = await contributor.get("/api/v1/calendars");
    expect(stranger.status).toBe(200);
    expect(stranger.body.items.find((row: { id: string }) => row.id === calendarId)).toBeUndefined();
    expect(stranger.body.total).toBe(0);

    const hidden = await contributor.get(`/api/v1/calendars/${calendarId}`);
    expect(hidden.status).toBe(403);

    const cross = await ownerB.get(`/api/v1/calendars/${calendarId}`);
    expect(cross.status).toBe(403);

    const adminList = await ownerA.get("/api/v1/calendars");
    expect(adminList.body.items.find((row: { id: string }) => row.id === calendarId)).toBeUndefined();
  });

  it("R05/R06/R08 owner-only grants, XOR, duplicates, and overlapping EDITOR>VIEWER", async () => {
    const spoof = await contributor
      .post(`/api/v1/calendars/${calendarId}/grants`)
      .set("Idempotency-Key", `grant-nope-${suffix}`)
      .send({ principalKind: "USER", organizationMembershipId: contributorMembershipId, role: "EDITOR" });
    expect(spoof.status).toBe(403);

    const ownerGrant = await coordinator
      .post(`/api/v1/calendars/${calendarId}/grants`)
      .set("Idempotency-Key", `grant-owner-${suffix}`)
      .send({ principalKind: "USER", organizationMembershipId: coordinatorMembershipId, role: "VIEWER" });
    expect(ownerGrant.status).toBe(409);

    const xor = await coordinator
      .post(`/api/v1/calendars/${calendarId}/grants`)
      .set("Idempotency-Key", `grant-xor-${suffix}`)
      .send({
        principalKind: "USER",
        organizationMembershipId: contributorMembershipId,
        teamId,
        role: "EDITOR",
      });
    expect(xor.status).toBe(409);

    const editor = await coordinator
      .post(`/api/v1/calendars/${calendarId}/grants`)
      .set("Idempotency-Key", `grant-editor-${suffix}`)
      .send({ principalKind: "USER", organizationMembershipId: contributorMembershipId, role: "EDITOR" });
    expect(editor.status).toBeLessThan(400);
    editorGrantId = editor.body.id;

    const duplicate = await coordinator
      .post(`/api/v1/calendars/${calendarId}/grants`)
      .set("Idempotency-Key", `grant-dup-${suffix}`)
      .send({ principalKind: "USER", organizationMembershipId: contributorMembershipId, role: "VIEWER" });
    expect(duplicate.status).toBe(409);

    const team = await coordinator
      .post(`/api/v1/calendars/${calendarId}/grants`)
      .set("Idempotency-Key", `grant-team-${suffix}`)
      .send({ principalKind: "TEAM", teamId, role: "VIEWER" });
    expect(team.status).toBeLessThan(400);

    const userViewer = await coordinator
      .post(`/api/v1/calendars/${calendarId}/grants`)
      .set("Idempotency-Key", `grant-viewer-${suffix}`)
      .send({ principalKind: "USER", organizationMembershipId: viewerMembershipId, role: "VIEWER" });
    expect(userViewer.status).toBeLessThan(400);
    viewerGrantId = userViewer.body.id;

    const granted = await contributor.get(`/api/v1/calendars/${calendarId}`);
    expect(granted.status).toBe(200);
    expect(granted.body.effectiveRole).toBe("EDITOR");
  });

  it("R03/R04/R07 timed, all-day, DST, and EDITOR vs VIEWER event rights", async () => {
    const inverted = await contributor
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-inv-${suffix}`)
      .send({
        title: "bad",
        allDay: false,
        startsAt: "2026-10-02T18:00:00.000Z",
        endsAt: "2026-10-02T17:00:00.000Z",
        timeZone: "America/Sao_Paulo",
      });
    expect(inverted.status).toBe(409);

    const dst = await contributor
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-dst-${suffix}`)
      .send({
        title: "gap",
        allDay: false,
        localStartsAt: "2026-03-08T02:30:00",
        timeZone: "America/New_York",
      });
    expect(dst.status).toBe(409);

    const ambiguous = await contributor
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-amb-${suffix}`)
      .send({
        title: "fold",
        allDay: false,
        localStartsAt: "2026-11-01T01:30:00",
        timeZone: "America/New_York",
      });
    expect(ambiguous.status).toBe(409);

    const timed = await contributor
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-timed-${suffix}`)
      .send({
        title: "Manual timed",
        description: "private body",
        allDay: false,
        localStartsAt: "2026-10-02T15:00:00",
        localEndsAt: "2026-10-02T16:00:00",
        timeZone: "America/Sao_Paulo",
      });
    expect(timed.status).toBeLessThan(400);
    timedEventId = timed.body.id;
    expect(timed.body.startsAt).toBe("2026-10-02T18:00:00.000Z");
    expect(timed.body.timeZone).toBe("America/Sao_Paulo");

    const allDay = await contributor
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-allday-${suffix}`)
      .send({
        title: "Manual all-day",
        allDay: true,
        allDayStartDate: "2026-10-03",
        allDayEndDate: "2026-10-03",
      });
    expect(allDay.status).toBeLessThan(400);
    allDayEventId = allDay.body.id;
    expect(allDay.body.startsAt).toBeNull();
    expect(allDay.body.allDayStartDate).toBe("2026-10-03");

    const viewerCreate = await viewer
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-viewer-${suffix}`)
      .send({
        title: "nope",
        allDay: true,
        allDayStartDate: "2026-10-04",
      });
    expect(viewerCreate.status).toBe(403);

    const viewerRead = await viewer.get(`/api/v1/calendars/${calendarId}/events`);
    expect(viewerRead.status).toBe(200);
    expect(viewerRead.body.items.some((row: { id: string }) => row.id === timedEventId)).toBe(true);

    const editorRename = await contributor
      .patch(`/api/v1/calendars/${calendarId}`)
      .send({ name: "Hijack", expectedVersion: 1 });
    expect(editorRename.status).toBe(403);

    const editorArchive = await contributor
      .post(`/api/v1/calendars/${calendarId}/archive`)
      .set("Idempotency-Key", `arch-nope-${suffix}`)
      .send({ expectedVersion: 1 });
    expect(editorArchive.status).toBe(403);
  });

  it("R03/R10/R15 referenced projections re-auth and never mutate or cascade source", async () => {
    const created = await coordinator
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-ref-${suffix}`)
      .send({
        kind: "REFERENCED",
        title: "must-not-be-source-of-truth",
        allDay: false,
        startsAt: "2026-10-20T00:00:00.000Z",
        timeZone: "UTC",
        referenceType: "TASK",
        referenceId: taskId,
        linkedProjectId: projectA,
      });
    expect(created.status).toBeLessThan(400);
    referencedEventId = created.body.id;
    expect(created.body.title).toBe(taskTitle);

    const renamed = await coordinator
      .patch(`/api/v1/projects/${projectA}/tasks/${taskId}`)
      .send({ title: "Live task title", expectedVersion: 1 });
    expect(renamed.status).toBeLessThan(400);
    taskTitle = "Live task title";

    const listed = await coordinator.get(`/api/v1/calendars/${calendarId}/events`);
    const projected = listed.body.items.find((row: { id: string }) => row.id === referencedEventId);
    expect(projected.title).toBe("Live task title");
    expect(projected.title).not.toBe("must-not-be-source-of-truth");

    const noProject = await prisma.projectMembership.updateMany({
      where: { organizationMembershipId: viewerMembershipId, projectId: projectA },
      data: { status: "REMOVED" },
    });
    expect(noProject.count).toBeGreaterThan(0);
    const omitted = await viewer.get(`/api/v1/calendars/${calendarId}/events`);
    expect(omitted.body.items.find((row: { id: string }) => row.id === referencedEventId)).toBeUndefined();
    const projectDenied = await viewer.get(`/api/v1/projects/${projectA}`);
    expect(projectDenied.status).toBe(403);

    const deleteRef = await contributor
      .delete(`/api/v1/calendars/${calendarId}/events/${referencedEventId}`)
      .set("Idempotency-Key", `del-ref-${suffix}`)
      .send({ expectedVersion: created.body.version });
    expect(deleteRef.status).toBe(409);

    const ownerDelete = await coordinator
      .delete(`/api/v1/calendars/${calendarId}/events/${referencedEventId}`)
      .set("Idempotency-Key", `del-ref-owner-${suffix}`)
      .send({ expectedVersion: created.body.version });
    expect(ownerDelete.status).toBeLessThan(400);
    const taskStill = await coordinator.get(`/api/v1/projects/${projectA}/tasks/${taskId}`);
    expect(taskStill.status).toBe(200);
    expect(taskStill.body.title).toBe("Live task title");
  });

  it("R11 share-targets follow EXTERNAL directory policy and hide inaccessible principals", async () => {
    const internal = await coordinator.get(`/api/v1/calendars/${calendarId}/share-targets?q=contrib`);
    expect(internal.status).toBe(200);
    expect(internal.body.items.some((row: { organizationMembershipId: string }) => row.organizationMembershipId === contributorMembershipId)).toBe(true);
    expect(internal.body.items.some((row: { organizationMembershipId: string }) => row.organizationMembershipId === orgAdminMembershipId)).toBe(false);

    const extCal = await external
      .post("/api/v1/calendars")
      .set("Idempotency-Key", `cal-ext-${suffix}`)
      .send({ name: "External private", timeZone: "UTC" });
    expect(extCal.status).toBeLessThan(400);
    const extTargets = await external.get(`/api/v1/calendars/${extCal.body.id}/share-targets`);
    expect(extTargets.status).toBe(200);
    const emailsFound = extTargets.body.items.map((row: { email: string | null }) => row.email).filter(Boolean);
    expect(emailsFound.length).toBeGreaterThan(0);
    expect(extTargets.body.items.some((row: { organizationMembershipId: string | null }) => row.organizationMembershipId === externalMembershipId)).toBe(false);
    expect(extTargets.body.items.length).toBeLessThan(20);
  });

  it("R09/R12/R14 revoke is immediate, CAS conflicts, and leftover TEAM path remains", async () => {
    const stale = await contributor
      .patch(`/api/v1/calendars/${calendarId}/events/${timedEventId}`)
      .send({ title: "stale", expectedVersion: 99 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("OPTIMISTIC_LOCK");

    const current = await contributor.get(`/api/v1/calendars/${calendarId}/events`);
    const timed = current.body.items.find((row: { id: string }) => row.id === timedEventId);
    const updated = await contributor
      .patch(`/api/v1/calendars/${calendarId}/events/${timedEventId}`)
      .send({ title: "Updated timed", expectedVersion: timed.version });
    expect(updated.status).toBeLessThan(400);

    const revoke = await coordinator
      .delete(`/api/v1/calendars/${calendarId}/grants/${editorGrantId}`)
      .set("Idempotency-Key", `revoke-editor-${suffix}`);
    expect(revoke.status).toBeLessThan(400);
    expect(revoke.body.revokedAt).toBeTruthy();

    const replay = await coordinator
      .delete(`/api/v1/calendars/${calendarId}/grants/${editorGrantId}`)
      .set("Idempotency-Key", `revoke-editor-${suffix}`);
    expect(replay.status).toBeLessThan(400);
    expect(replay.body.id).toBe(editorGrantId);

    const denied = await contributor
      .patch(`/api/v1/calendars/${calendarId}/events/${timedEventId}`)
      .send({ title: "after revoke", expectedVersion: updated.body.version });
    expect(denied.status).toBe(403);
    const stillRead = await contributor.get(`/api/v1/calendars/${calendarId}`);
    expect(stillRead.status).toBe(403);

    const viewerStill = await viewer.get(`/api/v1/calendars/${calendarId}`);
    expect(viewerStill.status).toBe(200);
    expect(viewerStill.body.effectiveRole).toBe("VIEWER");

    await prisma.teamMembership.updateMany({
      where: { teamId, organizationMembershipId: viewerMembershipId },
      data: { status: "REMOVED" },
    });
    const afterTeam = await viewer.get(`/api/v1/calendars/${calendarId}`);
    expect(afterTeam.status).toBe(200);
    await coordinator
      .delete(`/api/v1/calendars/${calendarId}/grants/${viewerGrantId}`)
      .set("Idempotency-Key", `revoke-viewer-${suffix}`);
    const teamOnlyGone = await viewer.get(`/api/v1/calendars/${calendarId}`);
    expect(teamOnlyGone.status).toBe(403);
  });

  it("R02/R13 archive preserves events and audit omits private bodies", async () => {
    const meta = await coordinator.get(`/api/v1/calendars/${calendarId}`);
    const archived = await coordinator
      .post(`/api/v1/calendars/${calendarId}/archive`)
      .set("Idempotency-Key", `arch-${suffix}`)
      .send({ expectedVersion: meta.body.version });
    expect(archived.status).toBeLessThan(400);
    expect(archived.body.status).toBe("ARCHIVED");

    const mutate = await coordinator
      .post(`/api/v1/calendars/${calendarId}/events`)
      .set("Idempotency-Key", `evt-arch-${suffix}`)
      .send({ title: "nope", allDay: true, allDayStartDate: "2026-10-09" });
    expect(mutate.status).toBe(409);

    const events = await coordinator.get(`/api/v1/calendars/${calendarId}/events`);
    expect(events.body.items.some((row: { id: string }) => row.id === allDayEventId)).toBe(true);

    const audits = await prisma.auditEvent.findMany({
      where: { organizationId: orgA, eventType: { startsWith: "CALENDAR_" } },
    });
    expect(audits.some((row) => row.eventType === "CALENDAR_CREATED")).toBe(true);
    expect(audits.some((row) => row.eventType === "CALENDAR_SHARED")).toBe(true);
    expect(audits.some((row) => row.eventType === "CALENDAR_ACCESS_REVOKED")).toBe(true);
    const blob = JSON.stringify(audits.map((row) => row.payload));
    expect(blob).not.toContain("private body");
    expect(blob).not.toContain("Manual timed");
  });

  it("R15 concurrent duplicate grants resolve without stacked authority", async () => {
    const fresh = await coordinator
      .post("/api/v1/calendars")
      .set("Idempotency-Key", `cal-conc-${suffix}`)
      .send({ name: "Concurrent", timeZone: "UTC" });
    const [a, b] = await Promise.all([
      coordinator
        .post(`/api/v1/calendars/${fresh.body.id}/grants`)
        .set("Idempotency-Key", `g-a-${suffix}`)
        .send({ principalKind: "USER", organizationMembershipId: contributorMembershipId, role: "VIEWER" }),
      coordinator
        .post(`/api/v1/calendars/${fresh.body.id}/grants`)
        .set("Idempotency-Key", `g-b-${suffix}`)
        .send({ principalKind: "USER", organizationMembershipId: contributorMembershipId, role: "EDITOR" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBeLessThan(400);
    expect(statuses[1]).toBe(409);
    const grants = await coordinator.get(`/api/v1/calendars/${fresh.body.id}/grants`);
    const active = grants.body.items.filter((row: { revokedAt: string | null }) => !row.revokedAt);
    expect(active).toHaveLength(1);
  });

  it("R01/R15 inactive owner freeze keeps history and blocks mutations for remaining grantees", async () => {
    const owned = await contributor
      .post("/api/v1/calendars")
      .set("Idempotency-Key", `cal-freeze-${suffix}`)
      .send({ name: "Freeze me", timeZone: "UTC" });
    const grant = await contributor
      .post(`/api/v1/calendars/${owned.body.id}/grants`)
      .set("Idempotency-Key", `grant-freeze-${suffix}`)
      .send({ principalKind: "USER", organizationMembershipId: coordinatorMembershipId, role: "EDITOR" });
    expect(grant.status).toBeLessThan(400);

    const suspended = await ownerA
      .patch(`/api/v1/organizations/${orgA}/members/${contributorMembershipId}`)
      .send({ status: "SUSPENDED" });
    expect(suspended.status).toBeLessThan(400);

    const read = await coordinator.get(`/api/v1/calendars/${owned.body.id}`);
    expect(read.status).toBe(200);
    const mutate = await coordinator
      .post(`/api/v1/calendars/${owned.body.id}/events`)
      .set("Idempotency-Key", `evt-freeze-${suffix}`)
      .send({ title: "frozen", allDay: true, allDayStartDate: "2026-10-10" });
    expect(mutate.status).toBe(403);
    const share = await coordinator
      .post(`/api/v1/calendars/${owned.body.id}/grants`)
      .set("Idempotency-Key", `grant-frozen-${suffix}`)
      .send({ principalKind: "USER", organizationMembershipId: viewerMembershipId, role: "VIEWER" });
    expect(share.status).toBe(403);
  });

  it("R14 My Schedule re-auths sources and ignores unauthorized project dates", async () => {
    const schedule = await coordinator.get(
      `/api/v1/schedule?from=2026-10-01T00:00:00.000Z&to=2026-10-31T00:00:00.000Z`,
    );
    expect(schedule.status).toBe(200);
    expect(schedule.body.items.some((row: { sourceKind: string }) => row.sourceKind === "OWNED_CALENDAR")).toBe(true);
    expect(schedule.body.items.some((row: { referenceId: string | null }) => row.referenceId === taskId)).toBe(true);

    const other = await ownerB.get("/api/v1/schedule");
    expect(other.status).toBe(200);
    expect(other.body.items.find((row: { calendarId: string | null }) => row.calendarId === calendarId)).toBeUndefined();
  });
});
