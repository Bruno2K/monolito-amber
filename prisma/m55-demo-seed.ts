import { createHash } from "node:crypto";
import { hash as argon2Hash, argon2id } from "argon2";
import type { PrismaClient } from "@prisma/client";
import {
  AUTH_PROVIDER_EMAIL_PASSWORD,
  M3_SEED_ORGANIZATIONS,
  M3_SEED_PASSWORD,
  M3_SEED_USERS,
  M55_DEMO_CALENDARS,
  M55_DEMO_CONVERSATIONS,
  M55_DEMO_DELIVERABLES,
  M55_DEMO_DEPENDENCIES,
  M55_DEMO_DOCUMENTS,
  M55_DEMO_EVENTS,
  M55_DEMO_GATES,
  M55_DEMO_MESSAGES,
  M55_DEMO_MILESTONES,
  M55_DEMO_ORG_MEMBERSHIPS,
  M55_DEMO_PHASES,
  M55_DEMO_PROJECT_MEMBERS,
  M55_DEMO_PROJECTS,
  M55_DEMO_TASKS,
  M55_DEMO_TEAM_MEMBERS,
  M55_DEMO_TEAMS,
  M55_DEMO_TIME_ZONE,
  M55_DEMO_USERS,
  PASSWORD_ALGORITHM,
  assertConversationShape,
  demoSeedUuid,
  directConversationPairKey,
  encodeDemoMessageBody,
} from "../packages/shared/src/index.ts";

const ARGON2_PARAMETERS = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

function m3Id(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function day(offset: number): Date {
  const date = new Date("2026-10-02T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}


export async function seedM55DemoDataset(prisma: PrismaClient): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { slug: M3_SEED_ORGANIZATIONS[0].slug } });
  if (!org) {
    throw new Error("Amber Demo Alpha is not seeded");
  }
  const passwordHash = await argon2Hash(M3_SEED_PASSWORD, ARGON2_PARAMETERS);
  const userIds = new Map<string, string>();

  for (const known of M3_SEED_USERS) {
    const row = await prisma.user.findUnique({ where: { email: known.email } });
    if (row) {
      userIds.set(known.key, row.id);
    }
  }
  for (const user of M55_DEMO_USERS) {
    const id = demoSeedUuid(`user:${user.key}`);
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    const row = existing ?? (await prisma.user.create({ data: { id, email: user.email, displayName: user.displayName } }));
    if (existing && existing.id !== id) {
      throw new Error(`Demo user ${user.email} already exists with a different id`);
    }
    userIds.set(user.key, row.id);
    const identity = await prisma.authenticationIdentity.findFirst({
      where: { userId: row.id, provider: AUTH_PROVIDER_EMAIL_PASSWORD },
    });
    const identityRow =
      identity ??
      (await prisma.authenticationIdentity.create({
        data: {
          id: demoSeedUuid(`auth:${user.key}`),
          userId: row.id,
          provider: AUTH_PROVIDER_EMAIL_PASSWORD,
          identifier: user.email,
        },
      }));
    const credential = await prisma.passwordCredential.findUnique({ where: { authenticationIdentityId: identityRow.id } });
    if (!credential) {
      await prisma.passwordCredential.create({
        data: {
          authenticationIdentityId: identityRow.id,
          algorithm: PASSWORD_ALGORITHM,
          hash: passwordHash,
          parameters: ARGON2_PARAMETERS,
        },
      });
    }
  }

  const membershipIds = new Map<string, string>();
  for (const userKey of [...M3_SEED_USERS.map((user) => user.key), ...M55_DEMO_USERS.map((user) => user.key)]) {
    const userId = userIds.get(userKey);
    if (!userId) {
      continue;
    }
    const existing = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId } },
    });
    if (existing) {
      membershipIds.set(userKey, existing.id);
    }
  }
  for (const membership of M55_DEMO_ORG_MEMBERSHIPS) {
    const userId = userIds.get(membership.userKey);
    if (!userId) {
      throw new Error(`Missing demo user ${membership.userKey}`);
    }
    const id = demoSeedUuid(`orgmem:${membership.userKey}`);
    const existing = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId } },
    });
    const row =
      existing ??
      (await prisma.organizationMembership.create({
        data: { id, organizationId: org.id, userId, type: membership.membershipType, status: "ACTIVE" },
      }));
    if (existing && existing.id !== id) {
      throw new Error(`Demo membership ${membership.userKey} already exists with a different id`);
    }
    if (existing && existing.type !== membership.membershipType) {
      await prisma.organizationMembership.update({
        where: { id: existing.id },
        data: { type: membership.membershipType },
      });
    }
    membershipIds.set(membership.userKey, row.id);
    if (membership.templateKey) {
      const role = await prisma.roleDefinition.findFirst({
        where: { organizationId: org.id, templateKey: membership.templateKey, isSystemTemplate: false },
      });
      if (!role) {
        throw new Error(`Missing org role ${membership.templateKey}`);
      }
      const bound = await prisma.roleBinding.findUnique({
        where: { membershipId_roleId: { membershipId: row.id, roleId: role.id } },
      });
      if (!bound) {
        await prisma.roleBinding.create({ data: { id: demoSeedUuid(`binding:${membership.userKey}`), membershipId: row.id, roleId: role.id } });
      }
    }
  }

  const projectIds = new Map<string, string>();
  for (const project of M55_DEMO_PROJECTS) {
    const id = demoSeedUuid(`project:${project.key}`);
    const existing = await prisma.project.findUnique({ where: { id } });
    const archivedAt = project.archived ? new Date("2026-08-01T12:00:00.000Z") : null;
    if (!existing) {
      await prisma.project.create({ data: { id, organizationId: org.id, name: project.name, archivedAt } });
    } else if (existing.name !== project.name) {
      await prisma.project.update({ where: { id }, data: { name: project.name, archivedAt } });
    }
    projectIds.set(project.key, id);
  }

  const projectMembershipIds = new Map<string, string>();
  for (const member of M55_DEMO_PROJECT_MEMBERS) {
    const projectId = projectIds.get(member.projectKey);
    const organizationMembershipId = membershipIds.get(member.userKey);
    if (!projectId || !organizationMembershipId) {
      throw new Error(`Missing endpoints for ${member.userKey}@${member.projectKey}`);
    }
    const id = demoSeedUuid(`pm:${member.projectKey}:${member.userKey}`);
    const existing = await prisma.projectMembership.findUnique({
      where: { projectId_organizationMembershipId: { projectId, organizationMembershipId } },
    });
    const row =
      existing ??
      (await prisma.projectMembership.create({
        data: { id, projectId, organizationMembershipId, status: "ACTIVE" },
      }));
    projectMembershipIds.set(`${member.userKey}:${member.projectKey}`, row.id);
    const role = await prisma.roleDefinition.findFirst({
      where: { organizationId: org.id, templateKey: member.templateKey, isSystemTemplate: false },
    });
    if (!role) {
      throw new Error(`Missing project role ${member.templateKey}`);
    }
    const assigned = await prisma.projectRoleAssignment.findUnique({
      where: { projectMembershipId_roleId: { projectMembershipId: row.id, roleId: role.id } },
    });
    if (!assigned) {
      await prisma.projectRoleAssignment.create({ data: { projectMembershipId: row.id, roleId: role.id } });
    }
  }

  const teamIds = new Map<string, string>();
  for (const team of M55_DEMO_TEAMS) {
    const id = demoSeedUuid(`team:${team.key}`);
    const archivedAt = team.archived ? new Date("2026-09-01T12:00:00.000Z") : null;
    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) {
      await prisma.team.create({ data: { id, organizationId: org.id, name: team.name, archivedAt } });
    }
    teamIds.set(team.key, id);
    for (const member of M55_DEMO_TEAM_MEMBERS.filter((row) => row.teamKey === team.key)) {
      const organizationMembershipId = membershipIds.get(member.userKey);
      if (!organizationMembershipId) {
        throw new Error(`Missing team member ${member.userKey}`);
      }
      const membershipId = demoSeedUuid(`tm:${team.key}:${member.userKey}`);
      const current = await prisma.teamMembership.findUnique({
        where: { teamId_organizationMembershipId: { teamId: id, organizationMembershipId } },
      });
      if (!current) {
        await prisma.teamMembership.create({
          data: { id: membershipId, teamId: id, organizationMembershipId, status: "ACTIVE" },
        });
      }
    }
  }

  const phaseIds = new Map<string, string>();
  for (const phase of M55_DEMO_PHASES) {
    const id = demoSeedUuid(`phase:${phase.key}`);
    const projectId = projectIds.get(phase.projectKey);
    if (!projectId) {
      throw new Error(`Missing phase project ${phase.projectKey}`);
    }
    const existing = await prisma.phase.findUnique({ where: { id } });
    if (!existing) {
      await prisma.phase.create({
        data: {
          id,
          organizationId: org.id,
          projectId,
          name: phase.name,
          sequence: phase.sequence,
          status: phase.status,
          createdBy: userIds.get("coord-a") ?? userIds.get("admin-a")!,
        },
      });
    }
    phaseIds.set(phase.key, id);
  }

  const disciplines = await prisma.discipline.findMany({ where: { organizationId: org.id } });
  const disciplineByCode = new Map(disciplines.map((row) => [row.code, row.id]));
  const deliverableIds = new Map<string, string>();
  for (const deliverable of M55_DEMO_DELIVERABLES) {
    const id = demoSeedUuid(`deliverable:${deliverable.key}`);
    const disciplineId = disciplineByCode.get(deliverable.disciplineCode);
    const projectId = projectIds.get(deliverable.projectKey);
    const phaseId = phaseIds.get(deliverable.phaseKey);
    if (!disciplineId || !projectId || !phaseId) {
      throw new Error(`Missing deliverable endpoints ${deliverable.key}`);
    }
    const existing = await prisma.deliverable.findUnique({ where: { id } });
    if (!existing) {
      await prisma.deliverable.create({
        data: {
          id,
          organizationId: org.id,
          projectId,
          phaseId,
          disciplineId,
          code: deliverable.code,
          title: deliverable.title,
          status: deliverable.status,
          dueAt: day(10),
        },
      });
    }
    deliverableIds.set(deliverable.key, id);
  }

  const milestoneIds = new Map<string, string>();
  for (const milestone of M55_DEMO_MILESTONES) {
    const id = demoSeedUuid(`milestone:${milestone.key}`);
    const projectId = projectIds.get(milestone.projectKey);
    if (!projectId) {
      throw new Error(`Missing milestone project ${milestone.key}`);
    }
    const existing = await prisma.milestone.findUnique({ where: { id } });
    if (!existing) {
      await prisma.milestone.create({
        data: {
          id,
          organizationId: org.id,
          projectId,
          phaseId: phaseIds.get(milestone.phaseKey),
          title: milestone.title,
          status: milestone.status,
          targetDate: day(milestone.dayOffset),
          achievedAt: milestone.status === "ACHIEVED" ? day(milestone.dayOffset) : null,
          achievedByUserId: milestone.status === "ACHIEVED" ? userIds.get("coord-a") : null,
        },
      });
    }
    milestoneIds.set(milestone.key, id);
  }

  const taskIds = new Map<string, string>();
  for (const task of M55_DEMO_TASKS) {
    const id = demoSeedUuid(`task:${task.key}`);
    const projectId = projectIds.get(task.projectKey);
    const createdByUserId = userIds.get("coord-a");
    if (!projectId || !createdByUserId) {
      throw new Error(`Missing task endpoints ${task.key}`);
    }
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      await prisma.task.create({
        data: {
          id,
          organizationId: org.id,
          projectId,
          phaseId: phaseIds.get(task.phaseKey),
          milestoneId: task.milestoneKey ? milestoneIds.get(task.milestoneKey) : null,
          deliverableId: task.deliverableKey ? deliverableIds.get(task.deliverableKey) : null,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assigneeUserId: userIds.get(task.assignee),
          dueDate: day(task.dayOffset),
          blockedReason: "blockedReason" in task ? task.blockedReason : null,
          startedAt: task.status === "IN_PROGRESS" || task.status === "DONE" ? day(task.dayOffset - 2) : null,
          completedAt: task.status === "DONE" ? day(task.dayOffset) : null,
          createdByUserId,
        },
      });
    }
    taskIds.set(task.key, id);
  }
  for (const edge of M55_DEMO_DEPENDENCIES) {
    const predecessorTaskId = taskIds.get(edge.predecessor);
    const successorTaskId = taskIds.get(edge.successor);
    const projectId = projectIds.get("demo-hospital");
    if (!predecessorTaskId || !successorTaskId || !projectId) {
      throw new Error(`Missing dependency ${edge.predecessor}->${edge.successor}`);
    }
    const existing = await prisma.taskDependency.findUnique({
      where: { predecessorTaskId_successorTaskId: { predecessorTaskId, successorTaskId } },
    });
    if (!existing) {
      await prisma.taskDependency.create({
        data: {
          id: demoSeedUuid(`dep:${edge.predecessor}:${edge.successor}`),
          organizationId: org.id,
          projectId,
          predecessorTaskId,
          successorTaskId,
          createdByUserId: userIds.get("bim-a")!,
        },
      });
    }
  }

  for (const gate of M55_DEMO_GATES) {
    const id = demoSeedUuid(`gate:${gate.key}`);
    const projectId = projectIds.get(gate.projectKey);
    const createdByUserId = userIds.get("coord-a");
    if (!projectId || !createdByUserId) {
      throw new Error(`Missing gate ${gate.key}`);
    }
    const existing = await prisma.gate.findUnique({ where: { id } });
    if (!existing) {
      await prisma.gate.create({
        data: {
          id,
          organizationId: org.id,
          projectId,
          name: gate.name,
          status: gate.status,
          createdByUserId,
          releasedAt: gate.status === "RELEASED" ? new Date("2026-08-15T12:00:00.000Z") : null,
          releasedByUserId: gate.status === "RELEASED" ? createdByUserId : null,
          releaseKind: gate.status === "RELEASED" ? "NORMAL" : null,
        },
      });
    }
    const requirementId = demoSeedUuid(`req:${gate.key}`);
    const requirement = await prisma.gateRequirement.findUnique({ where: { id: requirementId } });
    if (!requirement) {
      const satisfied = gate.status !== "BLOCKED";
      await prisma.gateRequirement.create({
        data: {
          id: requirementId,
          organizationId: org.id,
          projectId,
          gateId: id,
          type: "MANUAL_APPROVAL",
          title: satisfied ? "Aprovação registrada" : "Aprovação ainda pendente",
          config: { type: "MANUAL_APPROVAL", approved: satisfied },
          checklist: { items: [] },
          lastSatisfaction: satisfied ? "SATISFIED" : "UNSATISFIED",
        },
      });
    }
  }
  const exceptionRequirementId = demoSeedUuid("req:hosp-coord-gate");
  const exceptionId = demoSeedUuid("exception:hosp-shaft");
  const exception = await prisma.formalException.findUnique({ where: { id: exceptionId } });
  if (!exception) {
    await prisma.formalException.create({
      data: {
        id: exceptionId,
        organizationId: org.id,
        projectId: projectIds.get("demo-hospital")!,
        gateId: demoSeedUuid("gate:hosp-coord-gate"),
        gateRequirementId: exceptionRequirementId,
        status: "REQUESTED",
        reason: "Pedido pontual para o shaft do centro cirúrgico. Não libera o gate.",
        requestedByUserId: userIds.get("bim-a")!,
      },
    });
  }

  for (const document of M55_DEMO_DOCUMENTS) {
    const id = demoSeedUuid(`document:${document.key}`);
    const projectId = projectIds.get(document.projectKey);
    if (!projectId) {
      throw new Error(`Missing document project ${document.key}`);
    }
    const existing = await prisma.document.findUnique({ where: { id } });
    if (!existing) {
      await prisma.document.create({
        data: { id, organizationId: org.id, projectId, code: document.code, title: document.title, status: document.status },
      });
    }
  }

  for (const calendar of M55_DEMO_CALENDARS) {
    const id = demoSeedUuid(`calendar:${calendar.key}`);
    const ownerOrganizationMembershipId = membershipIds.get(calendar.ownerKey) ?? m3Id(`orgmem:org-a:${calendar.ownerKey}`);
    const existing = await prisma.calendar.findUnique({ where: { id } });
    if (!existing) {
      await prisma.calendar.create({
        data: {
          id,
          organizationId: org.id,
          ownerOrganizationMembershipId,
          name: calendar.name,
          description: calendar.description,
          timeZone: M55_DEMO_TIME_ZONE,
          status: calendar.status,
          archivedAt: calendar.status === "ARCHIVED" ? new Date("2026-07-01T12:00:00.000Z") : null,
        },
      });
    }
  }
  for (const event of M55_DEMO_EVENTS) {
    const id = demoSeedUuid(`event:${event.key}`);
    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (existing) {
      continue;
    }
    const createdBy = membershipIds.get("coord-a") ?? m3Id("orgmem:org-a:coord-a");
    if ("startDate" in event) {
      await prisma.calendarEvent.create({
        data: {
          id,
          organizationId: org.id,
          calendarId: demoSeedUuid(`calendar:${event.calendarKey}`),
          kind: "MANUAL",
          title: event.title,
          allDay: true,
          allDayStartDate: new Date(`${event.startDate}T00:00:00.000Z`),
          allDayEndDate: new Date(`${event.endDate}T00:00:00.000Z`),
          timeZone: null,
          createdByOrganizationMembershipId: createdBy,
        },
      });
      continue;
    }
    await prisma.calendarEvent.create({
      data: {
        id,
        organizationId: org.id,
        calendarId: demoSeedUuid(`calendar:${event.calendarKey}`),
        kind: "MANUAL",
        title: event.title,
        allDay: false,
        startsAt: new Date(event.start),
        endsAt: new Date(event.end),
        timeZone: M55_DEMO_TIME_ZONE,
        createdByOrganizationMembershipId: createdBy,
      },
    });
  }

  const conversationIds = new Map<string, string>();
  for (const conversation of M55_DEMO_CONVERSATIONS) {
    const id = demoSeedUuid(`conversation:${conversation.key}`);
    if (conversation.kind === "DIRECT") {
      const [leftKey, rightKey] = conversation.userKeys;
      const left = membershipIds.get(leftKey);
      const right = membershipIds.get(rightKey);
      if (!left || !right) {
        throw new Error(`Missing direct pair ${conversation.key}`);
      }
      const pair = directConversationPairKey(left, right);
      assertConversationShape({ kind: "DIRECT", participantLowId: pair.low, participantHighId: pair.high });
      const existing = await prisma.conversation.findFirst({
        where: { organizationId: org.id, kind: "DIRECT", participantLowId: pair.low, participantHighId: pair.high },
      });
      if (existing && existing.id !== id) {
        throw new Error(`Direct conversation ${conversation.key} already exists under another id`);
      }
      if (!existing) {
        await prisma.conversation.create({
          data: {
            id,
            organizationId: org.id,
            kind: "DIRECT",
            participantLowId: pair.low,
            participantHighId: pair.high,
          },
        });
      }
    } else {
      const teamId = teamIds.get(conversation.teamKey);
      if (!teamId) {
        throw new Error(`Missing team conversation ${conversation.key}`);
      }
      assertConversationShape({ kind: "TEAM", teamId });
      const existing = await prisma.conversation.findFirst({ where: { organizationId: org.id, kind: "TEAM", teamId } });
      if (existing && existing.id !== id) {
        throw new Error(`Team conversation ${conversation.key} already exists under another id`);
      }
      if (!existing) {
        await prisma.conversation.create({ data: { id, organizationId: org.id, kind: "TEAM", teamId } });
      }
    }
    conversationIds.set(conversation.key, id);
  }

  const messageIds = new Map<string, { id: string; createdAt: Date }>();
  for (const message of M55_DEMO_MESSAGES) {
    const id = demoSeedUuid(`message:${message.key}`);
    const conversationId = conversationIds.get(message.conversationKey);
    const authorOrganizationMembershipId = membershipIds.get(message.authorKey);
    if (!conversationId || !authorOrganizationMembershipId) {
      throw new Error(`Missing message endpoints ${message.key}`);
    }
    let link: { type: string; id: string } | null = null;
    if ("link" in message && message.link) {
      if (message.link.type === "PROJECT") {
        link = { type: "PROJECT", id: projectIds.get(message.link.projectKey)! };
      } else if (message.link.type === "TASK") {
        link = { type: "TASK", id: taskIds.get(message.link.taskKey)! };
      } else if (message.link.type === "DELIVERABLE") {
        link = { type: "DELIVERABLE", id: deliverableIds.get(message.link.deliverableKey)! };
      } else if (message.link.type === "MILESTONE") {
        link = { type: "MILESTONE", id: milestoneIds.get(message.link.milestoneKey)! };
      }
    }
    const createdAt = new Date(message.at);
    const existing = await prisma.message.findUnique({ where: { id } });
    if (!existing) {
      await prisma.message.create({
        data: {
          id,
          organizationId: org.id,
          conversationId,
          authorOrganizationMembershipId,
          body: encodeDemoMessageBody(message.body, link),
          editedAt: message.edited ? createdAt : null,
          deletedAt: message.tombstone ? createdAt : null,
          version: message.edited || message.tombstone ? 2 : 1,
          createdAt,
        },
      });
    }
    messageIds.set(message.key, { id, createdAt });
  }

  for (const conversation of M55_DEMO_CONVERSATIONS) {
    const conversationId = conversationIds.get(conversation.key);
    const last = M55_DEMO_MESSAGES.filter((message) => message.conversationKey === conversation.key).at(-1);
    if (!conversationId || !last) {
      continue;
    }
    const watermark = messageIds.get(last.key);
    if (!watermark) {
      continue;
    }
    for (const reader of conversation.readBy) {
      const organizationMembershipId = membershipIds.get(reader);
      if (!organizationMembershipId) {
        continue;
      }
      await prisma.messageReadState.upsert({
        where: { conversationId_organizationMembershipId: { conversationId, organizationMembershipId } },
        create: {
          conversationId,
          organizationMembershipId,
          lastReadMessageId: watermark.id,
          lastReadCreatedAt: watermark.createdAt,
        },
        update: {
          lastReadMessageId: watermark.id,
          lastReadCreatedAt: watermark.createdAt,
        },
      });
    }
    const keep = conversation.readBy
      .map((reader) => membershipIds.get(reader))
      .filter((id): id is string => Boolean(id));
    await prisma.messageReadState.deleteMany({
      where: { conversationId, organizationMembershipId: { notIn: keep } },
    });
  }
}
