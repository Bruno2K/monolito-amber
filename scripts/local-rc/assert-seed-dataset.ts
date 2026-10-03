import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { M3_SEED_ORGANIZATIONS, M3_SEED_PROJECTS, M3_SEED_USERS } from "../../packages/shared/src/m3-seed-design.ts";
import { M4_SEED_MILESTONES, M4_SEED_PRE_M4_TASK, M4_SEED_TASKS } from "../../packages/shared/src/m4-seed-design.ts";
import { M5_SEED_CALENDARS, M5_SEED_CONVERSATIONS } from "../../packages/shared/src/m5-seed-design.ts";
import { isUsableMembership } from "../../packages/shared/src/membership.ts";
import { countUnread, redactMessageProjection, teamConversationAccess } from "../../packages/shared/src/messaging.ts";
import {
  M55_DEMO_CALENDARS,
  M55_DEMO_CONVERSATIONS,
  M55_DEMO_DELIVERABLES,
  M55_DEMO_DEPENDENCIES,
  M55_DEMO_DOCUMENTS,
  M55_DEMO_EVENTS,
  M55_DEMO_GATES,
  M55_DEMO_MESSAGES,
  M55_DEMO_MILESTONES,
  M55_DEMO_PHASES,
  M55_DEMO_PROJECT_MEMBERS,
  M55_DEMO_PROJECTS,
  M55_DEMO_TASKS,
  M55_DEMO_TEAM_MEMBERS,
  M55_DEMO_TEAMS,
  M55_DEMO_USERS,
  demoDeclaredReadStates,
  demoMessageLifecycle,
  demoMessageResource,
  demoMessageVersion,
  demoSeedUuid,
  encodeDemoMessageBody,
} from "../../packages/shared/src/m55-demo-seed-design.ts";

function seedUuid(namespace: string, key: string): string {
  const digest = createHash("sha256").update(`${namespace}${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function m3Id(key: string): string {
  return seedUuid("amber.m3.seed.", key);
}

function m5Id(key: string): string {
  return seedUuid("amber.m5.seed.", key);
}

const prisma = new PrismaClient();

async function membershipFor(organizationId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`missing user ${email}`);
  }
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
  });
  if (!membership) {
    throw new Error(`missing membership for ${email}`);
  }
  return membership;
}

async function assertDemoPortfolio(orgAId: string, orgBId: string): Promise<void> {
  for (const project of M55_DEMO_PROJECTS) {
    const row = await prisma.project.findUnique({ where: { id: demoSeedUuid(`project:${project.key}`) } });
    if (!row || row.name !== project.name || row.organizationId !== orgAId) {
      throw new Error(`demo project ${project.key} missing`);
    }
    if (Boolean(row.archivedAt) !== project.archived) {
      throw new Error(`demo project ${project.key} archive state drifted`);
    }
  }
  for (const team of M55_DEMO_TEAMS) {
    const row = await prisma.team.findUnique({ where: { id: demoSeedUuid(`team:${team.key}`) } });
    if (!row || row.name !== team.name || row.organizationId !== orgAId || Boolean(row.archivedAt) !== team.archived) {
      throw new Error(`demo team ${team.key} drifted`);
    }
  }
  const emails = new Map<string, string>([
    ["coord-a", "coordinator.a@amber.test"],
    ["viewer-a", "viewer.a@amber.test"],
    ...M55_DEMO_USERS.map((user) => [user.key, user.email] as const),
  ]);
  const memberships = new Map<string, string>();
  for (const [key, email] of emails) {
    memberships.set(key, (await membershipFor(orgAId, email)).id);
  }
  const oto = await membershipFor(orgAId, emails.get("contractor-a")!);
  if (oto.type !== "EXTERNAL" || oto.status !== "ACTIVE") {
    throw new Error("Oto Obra must stay an active EXTERNAL membership");
  }
  const otoOrgRole = await prisma.roleBinding.findFirst({ where: { membershipId: oto.id } });
  if (otoOrgRole) {
    throw new Error("Oto Obra must not have an organization-wide role binding");
  }
  for (const member of M55_DEMO_PROJECT_MEMBERS) {
    const organizationMembershipId = memberships.get(member.userKey);
    const projectId = demoSeedUuid(`project:${member.projectKey}`);
    const row = await prisma.projectMembership.findUnique({
      where: { projectId_organizationMembershipId: { projectId, organizationMembershipId: organizationMembershipId! } },
    });
    if (!row || row.status !== "ACTIVE") {
      throw new Error(`missing project membership ${member.userKey} on ${member.projectKey}`);
    }
    const assignment = await prisma.projectRoleAssignment.findFirst({
      where: { projectMembershipId: row.id },
      include: { role: true },
    });
    if (assignment?.role.templateKey !== member.templateKey) {
      throw new Error(`project role drifted for ${member.userKey} on ${member.projectKey}`);
    }
  }
  for (const member of M55_DEMO_TEAM_MEMBERS) {
    const row = await prisma.teamMembership.findUnique({
      where: {
        teamId_organizationMembershipId: {
          teamId: demoSeedUuid(`team:${member.teamKey}`),
          organizationMembershipId: memberships.get(member.userKey)!,
        },
      },
    });
    if (!row) {
      throw new Error(`missing team membership ${member.userKey} on ${member.teamKey}`);
    }
  }
  for (const phase of M55_DEMO_PHASES) {
    const row = await prisma.phase.findUnique({ where: { id: demoSeedUuid(`phase:${phase.key}`) } });
    if (!row || row.status !== phase.status) {
      throw new Error(`phase ${phase.key} drifted`);
    }
  }
  for (const milestone of M55_DEMO_MILESTONES) {
    const row = await prisma.milestone.findUnique({ where: { id: demoSeedUuid(`milestone:${milestone.key}`) } });
    if (!row || row.status !== milestone.status) {
      throw new Error(`milestone ${milestone.key} drifted`);
    }
  }
  for (const task of M55_DEMO_TASKS) {
    const row = await prisma.task.findUnique({ where: { id: demoSeedUuid(`task:${task.key}`) } });
    if (!row || row.status !== task.status) {
      throw new Error(`task ${task.key} drifted`);
    }
  }
  for (const edge of M55_DEMO_DEPENDENCIES) {
    const row = await prisma.taskDependency.findFirst({
      where: {
        predecessorTaskId: demoSeedUuid(`task:${edge.predecessor}`),
        successorTaskId: demoSeedUuid(`task:${edge.successor}`),
      },
    });
    if (!row) {
      throw new Error(`dependency ${edge.predecessor} -> ${edge.successor} missing`);
    }
  }
  for (const deliverable of M55_DEMO_DELIVERABLES) {
    const row = await prisma.deliverable.findUnique({ where: { id: demoSeedUuid(`deliverable:${deliverable.key}`) } });
    if (!row || row.status !== deliverable.status) {
      throw new Error(`deliverable ${deliverable.key} drifted`);
    }
  }
  for (const gate of M55_DEMO_GATES) {
    const row = await prisma.gate.findUnique({ where: { id: demoSeedUuid(`gate:${gate.key}`) } });
    if (!row || row.status !== gate.status) {
      throw new Error(`gate ${gate.key} drifted`);
    }
  }
  if (M55_DEMO_GATES.find((gate) => gate.status === "READY")?.status === M55_DEMO_GATES.find((gate) => gate.status === "RELEASED")?.status) {
    throw new Error("READY and RELEASED gates must stay distinct");
  }
  const blocked = await prisma.gate.findUnique({ where: { id: demoSeedUuid("gate:hosp-coord-gate") } });
  const exception = await prisma.formalException.findUnique({ where: { id: demoSeedUuid("exception:hosp-shaft") } });
  if (!blocked || blocked.status !== "BLOCKED" || exception?.status !== "REQUESTED") {
    throw new Error("requested formal exception must not release the blocked gate");
  }
  for (const calendar of M55_DEMO_CALENDARS) {
    const row = await prisma.calendar.findUnique({ where: { id: demoSeedUuid(`calendar:${calendar.key}`) } });
    if (!row || row.name !== calendar.name || row.status !== calendar.status) {
      throw new Error(`calendar ${calendar.key} drifted`);
    }
  }
  for (const event of M55_DEMO_EVENTS) {
    const row = await prisma.calendarEvent.findUnique({ where: { id: demoSeedUuid(`event:${event.key}`) } });
    if (!row || row.title !== event.title) {
      throw new Error(`calendar event ${event.key} drifted`);
    }
  }
  const edited = await prisma.message.findUnique({ where: { id: demoSeedUuid("message:dm-arch-2") } });
  const tombstone = await prisma.message.findUnique({ where: { id: demoSeedUuid("message:dm-arch-3") } });
  if (!edited?.editedAt || edited.version !== 2) {
    throw new Error("edited demo message drifted");
  }
  if (!tombstone?.deletedAt || !tombstone.body.trim()) {
    throw new Error("tombstoned demo row must keep a non-empty stored body");
  }
  const projectedTombstone = redactMessageProjection({
    body: tombstone.body,
    editedAt: tombstone.editedAt,
    deletedAt: tombstone.deletedAt,
    authorOrganizationMembershipId: tombstone.authorOrganizationMembershipId,
    resourcePreviews: [{ type: "TASK", id: "protected", title: "protected preview", projectId: "secret-project" }],
  });
  if (
    projectedTombstone.body !== null ||
    projectedTombstone.lifecycle !== "TOMBSTONED" ||
    projectedTombstone.authorOrganizationMembershipId !== memberships.get("coord-a") ||
    projectedTombstone.resourcePreviews.length !== 0
  ) {
    throw new Error("tombstoned demo message projection leaked body or preview");
  }
  const projectedJson = JSON.stringify(projectedTombstone);
  if (projectedJson.includes(tombstone.body) || projectedJson.includes("protected preview")) {
    throw new Error("tombstoned demo message projection leaked stored text");
  }
  await assertDemoRecords(orgAId, memberships);
  const linkedTask = await prisma.task.findUnique({ where: { id: demoSeedUuid("task:hosp-clash") } });
  const linkedProject = await prisma.project.findUnique({ where: { id: demoSeedUuid("project:demo-hospital") } });
  const linkedDeliverable = await prisma.deliverable.findUnique({ where: { id: demoSeedUuid("deliverable:hosp-arch-model") } });
  const linkedMilestone = await prisma.milestone.findUnique({ where: { id: demoSeedUuid("milestone:hosp-coord") } });
  if (!linkedTask || !linkedProject || !linkedDeliverable || !linkedMilestone) {
    throw new Error("authorized message links must reference existing resources");
  }
  const directId = demoSeedUuid("conversation:dm-bim-structural");
  const directMessages = await prisma.message.findMany({ where: { conversationId: directId }, orderBy: { createdAt: "asc" } });
  if (directMessages.length !== 2) {
    throw new Error(`unread direct fixture duplicated or incomplete (${directMessages.length})`);
  }
  const latest = directMessages[1];
  if (!latest || latest.authorOrganizationMembershipId !== memberships.get("structural-a")) {
    throw new Error("inbox tail must be Rui's later message");
  }
  const bimId = memberships.get("bim-a")!;
  const ruiId = memberships.get("structural-a")!;
  const bimRead = await prisma.messageReadState.findUnique({
    where: { conversationId_organizationMembershipId: { conversationId: directId, organizationMembershipId: bimId } },
  });
  const ruiRead = await prisma.messageReadState.findUnique({
    where: { conversationId_organizationMembershipId: { conversationId: directId, organizationMembershipId: ruiId } },
  });
  const unreadRows = directMessages.map((message) => ({
    id: message.id,
    createdAt: message.createdAt.toISOString(),
    authorMembershipId: message.authorOrganizationMembershipId,
  }));
  const bimUnread = countUnread({
    readerMembershipId: bimId,
    messages: unreadRows,
    watermark: bimRead ? { id: bimRead.lastReadMessageId, createdAt: bimRead.lastReadCreatedAt.toISOString() } : null,
  });
  const ruiUnread = countUnread({
    readerMembershipId: ruiId,
    messages: unreadRows,
    watermark: ruiRead ? { id: ruiRead.lastReadMessageId, createdAt: ruiRead.lastReadCreatedAt.toISOString() } : null,
  });
  if (bimUnread < 1 || ruiUnread !== 0 || ruiRead?.lastReadMessageId !== latest.id) {
    throw new Error("Caio must have an unread direct message and Rui must not be unread on his own reply");
  }
  const read = countUnread({
    readerMembershipId: bimId,
    messages: unreadRows,
    watermark: { id: latest.id, createdAt: latest.createdAt.toISOString() },
  });
  if (read !== 0 || ruiRead?.lastReadMessageId !== latest.id) {
    throw new Error("reading as Caio must be able to clear unread without moving Rui's watermark");
  }
  const site = await prisma.team.findUnique({ where: { id: demoSeedUuid("team:demo-site") } });
  const siteConversation = await prisma.conversation.findUnique({ where: { id: demoSeedUuid("conversation:team-site") } });
  if (!site?.archivedAt || siteConversation?.kind !== "TEAM" || siteConversation.teamId !== site.id) {
    throw new Error("archived Obra team conversation must stay read-only");
  }
  const removed = await prisma.organizationMembership.findFirst({
    where: { id: m3Id("orgmem:org-a:removed-a"), status: "REMOVED" },
  });
  if (!removed) {
    throw new Error("removed-a must remain removed");
  }
  const beta = await prisma.organizationMembership.findUnique({ where: { id: m3Id("orgmem:org-b:coord-b") } });
  const betaOnHospital = beta
    ? await prisma.projectMembership.findUnique({
        where: {
          projectId_organizationMembershipId: {
            projectId: demoSeedUuid("project:demo-hospital"),
            organizationMembershipId: beta.id,
          },
        },
      })
    : null;
  if (!beta || beta.organizationId !== orgBId || betaOnHospital) {
    throw new Error("Alpha demo data must stay isolated from Beta");
  }
}


async function assertDemoRecords(orgAId: string, memberships: Map<string, string>): Promise<void> {
  for (const document of M55_DEMO_DOCUMENTS) {
    const row = await prisma.document.findUnique({ where: { id: demoSeedUuid(`document:${document.key}`) } });
    if (!row || row.code !== document.code || row.title !== document.title || row.status !== document.status) {
      throw new Error(`document ${document.key} drifted`);
    }
    if (row.projectId !== demoSeedUuid(`project:${document.projectKey}`) || row.organizationId !== orgAId) {
      throw new Error(`document ${document.key} project drifted`);
    }
  }
  for (const conversation of M55_DEMO_CONVERSATIONS) {
    const row = await prisma.conversation.findUnique({ where: { id: demoSeedUuid(`conversation:${conversation.key}`) } });
    if (!row || row.kind !== conversation.kind || row.organizationId !== orgAId) {
      throw new Error(`conversation ${conversation.key} drifted`);
    }
    if (conversation.kind === "TEAM" && row.teamId !== demoSeedUuid(`team:${conversation.teamKey}`)) {
      throw new Error(`conversation ${conversation.key} team drifted`);
    }
  }
  const messageIds = M55_DEMO_MESSAGES.map((message) => demoSeedUuid(`message:${message.key}`));
  const messageCount = await prisma.message.count({ where: { id: { in: messageIds } } });
  if (messageCount !== messageIds.length) {
    throw new Error(`expected ${messageIds.length} demo messages, found ${messageCount}`);
  }
  for (const message of M55_DEMO_MESSAGES) {
    const row = await prisma.message.findUnique({ where: { id: demoSeedUuid(`message:${message.key}`) } });
    const resource = demoMessageResource(message);
    const link = resource
      ? { type: resource.type, id: demoSeedUuid(`${resource.type.toLowerCase()}:${resource.resourceKey}`) }
      : null;
    if (
      !row ||
      row.organizationId !== orgAId ||
      row.conversationId !== demoSeedUuid(`conversation:${message.conversationKey}`) ||
      row.authorOrganizationMembershipId !== memberships.get(message.authorKey) ||
      row.createdAt.toISOString() !== message.at ||
      row.version !== demoMessageVersion(message) ||
      Boolean(row.editedAt) !== message.edited ||
      Boolean(row.deletedAt) !== message.tombstone ||
      row.body !== encodeDemoMessageBody(message.body, link)
    ) {
      throw new Error(`message ${message.key} drifted`);
    }
    const lifecycle = demoMessageLifecycle(message);
    const projected = redactMessageProjection({
      body: row.body,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
      authorOrganizationMembershipId: row.authorOrganizationMembershipId,
      resourcePreviews: resource ? [{ type: resource.type, id: link?.id, title: "protected preview" }] : [],
    });
    if (projected.lifecycle !== lifecycle || projected.authorOrganizationMembershipId !== row.authorOrganizationMembershipId) {
      throw new Error(`message ${message.key} projection drifted`);
    }
    if (message.tombstone) {
      if (projected.body !== null || projected.resourcePreviews.length !== 0 || JSON.stringify(projected).includes(message.body)) {
        throw new Error(`message ${message.key} tombstone projection leaked`);
      }
    }
    if (!resource || !link) {
      continue;
    }
    if (resource.type === "PROJECT") {
      const project = await prisma.project.findUnique({ where: { id: link.id } });
      if (!project || project.id !== demoSeedUuid(`project:${resource.projectKey}`)) {
        throw new Error(`message ${message.key} project link drifted`);
      }
      continue;
    }
    const table = resource.type === "TASK" ? prisma.task : resource.type === "DELIVERABLE" ? prisma.deliverable : prisma.milestone;
    const target = await table.findUnique({ where: { id: link.id } });
    if (!target || target.projectId !== demoSeedUuid(`project:${resource.projectKey}`)) {
      throw new Error(`message ${message.key} resource link drifted`);
    }
  }
  for (const read of demoDeclaredReadStates()) {
    const row = await prisma.messageReadState.findUnique({
      where: {
        conversationId_organizationMembershipId: {
          conversationId: demoSeedUuid(`conversation:${read.conversationKey}`),
          organizationMembershipId: memberships.get(read.readerKey)!,
        },
      },
    });
    if (!row || row.lastReadMessageId !== demoSeedUuid(`message:${read.messageKey}`)) {
      throw new Error(`read state ${read.readerKey} on ${read.conversationKey} drifted`);
    }
  }
  const otoId = memberships.get("contractor-a");
  if (!otoId) {
    throw new Error("Oto membership missing");
  }
  const otoProjects = await prisma.projectMembership.findMany({ where: { organizationMembershipId: otoId, status: "ACTIVE" } });
  const expectedProjects = M55_DEMO_PROJECT_MEMBERS.filter((row) => row.userKey === "contractor-a").map((row) => demoSeedUuid(`project:${row.projectKey}`)).sort();
  if (otoProjects.map((row) => row.projectId).sort().join() !== expectedProjects.join()) {
    throw new Error("Oto project access drifted");
  }
  const otoTeams = await prisma.teamMembership.findMany({ where: { organizationMembershipId: otoId } });
  const expectedTeams = M55_DEMO_TEAM_MEMBERS.filter((row) => row.userKey === "contractor-a").map((row) => demoSeedUuid(`team:${row.teamKey}`)).sort();
  if (otoTeams.map((row) => row.teamId).sort().join() !== expectedTeams.join()) {
    throw new Error("Oto team access drifted");
  }
  for (const [key, status] of [["suspended-a", "SUSPENDED"], ["removed-a", "REMOVED"]] as const) {
    const membership = await prisma.organizationMembership.findUnique({ where: { id: m3Id(`orgmem:org-a:${key}`) } });
    if (!membership || membership.status !== status || isUsableMembership(membership.status)) {
      throw new Error(`${key} membership is still effective`);
    }
    const active = await prisma.projectMembership.count({
      where: {
        organizationMembershipId: membership.id,
        status: "ACTIVE",
        projectId: { in: M55_DEMO_PROJECTS.map((project) => demoSeedUuid(`project:${project.key}`)) },
      },
    });
    if (active !== 0) {
      throw new Error(`${key} still has demo project access`);
    }
    if (teamConversationAccess({ actorMembershipStatus: membership.status, teamMembershipActive: true, teamArchived: false }) !== "none") {
      throw new Error(`${key} would still receive team conversation access`);
    }
  }
  const site = await prisma.team.findUnique({ where: { id: demoSeedUuid("team:demo-site") } });
  if (!site?.archivedAt || teamConversationAccess({ actorMembershipStatus: "ACTIVE", teamMembershipActive: true, teamArchived: Boolean(site.archivedAt) }) !== "read_only") {
    throw new Error("archived Obra team must be read-only");
  }
}

async function main(): Promise<void> {
  const expectedOrgA = m3Id("org:org-a");
  const expectedOrgB = m3Id("org:org-b");
  const expectedProjectA1 = m3Id("project:project-a1");
  const expectedCoord = m3Id("user:coord-a");

  const orgA = await prisma.organization.findUnique({ where: { id: expectedOrgA } });
  const orgB = await prisma.organization.findUnique({ where: { id: expectedOrgB } });
  const projectA1 = await prisma.project.findUnique({ where: { id: expectedProjectA1 } });
  const coord = await prisma.user.findUnique({ where: { id: expectedCoord } });

  if (!orgA || orgA.slug !== M3_SEED_ORGANIZATIONS[0].slug) {
    throw new Error(`org-a missing or slug mismatch (expected ${expectedOrgA})`);
  }
  if (!orgB || orgB.slug !== M3_SEED_ORGANIZATIONS[1].slug) {
    throw new Error(`org-b missing or slug mismatch (expected ${expectedOrgB})`);
  }
  if (!projectA1 || projectA1.name !== M3_SEED_PROJECTS[0].name) {
    throw new Error(`project-a1 missing or name mismatch (expected ${expectedProjectA1})`);
  }
  const coordEmail = M3_SEED_USERS.find((row) => row.key === "coord-a")?.email;
  if (!coord || coord.email !== coordEmail) {
    throw new Error(`coord-a missing or email mismatch (expected ${expectedCoord})`);
  }

  const orgCount = await prisma.organization.count({
    where: { slug: { in: M3_SEED_ORGANIZATIONS.map((row) => row.slug) } },
  });
  if (orgCount !== 2) {
    throw new Error(`expected 2 seed orgs, found ${orgCount}`);
  }

  const expectedTask = m3Id("task:task-a1-todo");
  const expectedMilestone = m3Id("ms:ms-a1-planned");
  const expectedIssue = m3Id("issue:iss-a1-grid");
  const task = await prisma.task.findUnique({ where: { id: expectedTask } });
  const milestone = await prisma.milestone.findUnique({ where: { id: expectedMilestone } });
  const issue = await prisma.issue.findUnique({ where: { id: expectedIssue } });
  if (!task || task.title !== M4_SEED_TASKS[0]?.title) {
    throw new Error(`M4 task-a1-todo missing or title mismatch (expected ${expectedTask})`);
  }
  if (!milestone || milestone.title !== M4_SEED_MILESTONES[0]?.title) {
    throw new Error(`M4 ms-a1-planned missing or title mismatch (expected ${expectedMilestone})`);
  }
  if (!issue) {
    throw new Error(`M4 iss-a1-grid missing (expected ${expectedIssue})`);
  }
  const taskCount = await prisma.task.count({
    where: { title: { in: M4_SEED_TASKS.map((row) => row.title) } },
  });
  if (taskCount !== M4_SEED_TASKS.length) {
    throw new Error(`expected ${M4_SEED_TASKS.length} M4 seed tasks, found ${taskCount}`);
  }
  const depCount = await prisma.taskDependency.count({
    where: { projectId: expectedProjectA1 },
  });
  if (depCount < 2) {
    throw new Error(`expected at least 2 FS seed dependencies on project-a1, found ${depCount}`);
  }
  const preM4 = await prisma.task.findFirst({
    where: { projectId: expectedProjectA1, title: M4_SEED_PRE_M4_TASK.title },
  });
  if (process.env.AMBER_REQUIRE_PRE_M4 === "1" && !preM4) {
    throw new Error("pre-M4 activation Task missing after upgrade re-seed");
  }
  const expectedCalendar = m5Id("cal:cal-owner-private");
  const calendar = await prisma.calendar.findUnique({ where: { id: expectedCalendar } });
  if (!calendar || calendar.name !== M5_SEED_CALENDARS[0]?.name) {
    throw new Error(`M5 cal-owner-private missing or name mismatch (expected ${expectedCalendar})`);
  }
  const calendarCount = await prisma.calendar.count({
    where: { name: { in: M5_SEED_CALENDARS.map((row) => row.name) } },
  });
  if (calendarCount !== M5_SEED_CALENDARS.length) {
    throw new Error(`expected ${M5_SEED_CALENDARS.length} M5 seed calendars, found ${calendarCount}`);
  }
  const expectedConversation = m5Id("conversation:dm-coord-contributor");
  const conversation = await prisma.conversation.findUnique({ where: { id: expectedConversation } });
  if (!conversation || conversation.kind !== "DIRECT") {
    throw new Error(`M5 dm-coord-contributor missing or kind mismatch (expected ${expectedConversation})`);
  }
  const expectedDemoProject = demoSeedUuid("project:demo-hospital");
  const demoProject = await prisma.project.findUnique({ where: { id: expectedDemoProject } });
  if (!demoProject || demoProject.name !== M55_DEMO_PROJECTS[0].name) {
    throw new Error(`demo hospital missing or name mismatch (expected ${expectedDemoProject})`);
  }
  const suspended = await prisma.organizationMembership.findFirst({
    where: { id: m3Id("orgmem:org-a:suspended-a"), status: "SUSPENDED" },
  });
  if (!suspended) {
    throw new Error("suspended-a must remain suspended");
  }
  const seedConversationIds = [
    ...M5_SEED_CONVERSATIONS.map((row) => m5Id(`conversation:${row.key}`)),
    ...M55_DEMO_CONVERSATIONS.map((row) => demoSeedUuid(`conversation:${row.key}`)),
  ];
  const conversationCount = await prisma.conversation.count({ where: { id: { in: seedConversationIds } } });
  if (conversationCount !== seedConversationIds.length) {
    throw new Error(`expected ${seedConversationIds.length} seeded conversations, found ${conversationCount}`);
  }
  await assertDemoPortfolio(expectedOrgA, expectedOrgB);
  console.log(`seed_org_a=${expectedOrgA}`);
  console.log(`seed_org_b=${expectedOrgB}`);
  console.log(`seed_project_a1=${expectedProjectA1}`);
  console.log(`seed_user_coord_a=${expectedCoord}`);
  console.log(`seed_task_a1_todo=${expectedTask}`);
  console.log(`seed_ms_a1_planned=${expectedMilestone}`);
  console.log(`seed_issue_a1_grid=${expectedIssue}`);
  console.log(`pre_m4_activation_present=${preM4 ? "yes" : "no"}`);
  console.log(`seed_cal_owner_private=${expectedCalendar}`);
  console.log(`seed_dm_coord_contributor=${expectedConversation}`);
  console.log("deterministic_seed=ok");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
