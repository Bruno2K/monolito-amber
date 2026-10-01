import { createHash } from "node:crypto";
import { hash as argon2Hash, argon2id } from "argon2";
import type { PrismaClient } from "@prisma/client";
import {
  AUTH_PROVIDER_EMAIL_PASSWORD,
  M3_SEED_DISCIPLINES,
  M3_SEED_ORGANIZATIONS,
  M3_SEED_ORG_MEMBERSHIPS,
  M3_SEED_PHASES,
  M3_SEED_PROJECT_MEMBERSHIPS,
  M3_SEED_PROJECTS,
  M3_SEED_TEAMS,
  M3_SEED_USERS,
  PASSWORD_ALGORITHM,
  ROLE_TEMPLATES,
} from "../packages/shared/src/index.ts";

export const M3_SEED_PASSWORD = "correct-horse-12";

const ARGON2_PARAMETERS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function seedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function instantiateOrgRoles(prisma: PrismaClient, organizationId: string): Promise<void> {
  const templates = await prisma.roleDefinition.findMany({
    where: { organizationId: null, isSystemTemplate: true },
    include: { rolePermissions: true },
  });
  if (templates.length !== ROLE_TEMPLATES.length) {
    throw new Error("Amber Role Templates are not fully seeded before M3 dataset");
  }
  for (const template of templates) {
    const existing = await prisma.roleDefinition.findFirst({
      where: { organizationId, templateKey: template.templateKey },
    });
    if (existing) {
      continue;
    }
    await prisma.roleDefinition.create({
      data: {
        id: seedUuid(`role:${organizationId}:${template.templateKey}`),
        organizationId,
        templateKey: template.templateKey,
        sourceTemplateKey: template.sourceTemplateKey || template.templateKey,
        name: template.name,
        description: template.description,
        isSystemTemplate: false,
        rolePermissions: {
          create: template.rolePermissions.map((row) => ({ permissionId: row.permissionId })),
        },
      },
    });
  }
}

export async function seedM3Dataset(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2Hash(M3_SEED_PASSWORD, ARGON2_PARAMETERS);
  const orgIds = new Map<string, string>();
  const userIds = new Map<string, string>();
  const orgMembershipIds = new Map<string, string>();
  const projectIds = new Map<string, string>();
  const teamIds = new Map<string, string>();
  const disciplineIds = new Map<string, string>();

  for (const org of M3_SEED_ORGANIZATIONS) {
    const id = seedUuid(`org:${org.key}`);
    await prisma.organization.upsert({
      where: { slug: org.slug },
      create: { id, name: org.name, slug: org.slug },
      update: { name: org.name },
    });
    const stored = await prisma.organization.findUnique({ where: { slug: org.slug } });
    if (!stored) {
      throw new Error(`Failed to upsert Organization ${org.key}`);
    }
    orgIds.set(org.key, stored.id);
    await instantiateOrgRoles(prisma, stored.id);
  }

  for (const user of M3_SEED_USERS) {
    const id = seedUuid(`user:${user.key}`);
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    const row =
      existing ??
      (await prisma.user.create({
        data: { id, email: user.email, displayName: user.displayName },
      }));
    if (existing && existing.displayName !== user.displayName) {
      await prisma.user.update({ where: { id: existing.id }, data: { displayName: user.displayName } });
    }
    userIds.set(user.key, row.id);
    const identity = await prisma.authenticationIdentity.findFirst({
      where: { userId: row.id, provider: AUTH_PROVIDER_EMAIL_PASSWORD },
    });
    const identityRow =
      identity ??
      (await prisma.authenticationIdentity.create({
        data: {
          id: seedUuid(`auth:${user.key}`),
          userId: row.id,
          provider: AUTH_PROVIDER_EMAIL_PASSWORD,
          identifier: user.email,
        },
      }));
    const credential = await prisma.passwordCredential.findUnique({
      where: { authenticationIdentityId: identityRow.id },
    });
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

  for (const membership of M3_SEED_ORG_MEMBERSHIPS) {
    const organizationId = orgIds.get(membership.orgKey);
    const userId = userIds.get(membership.userKey);
    if (!organizationId || !userId) {
      throw new Error(`Missing org/user for membership ${membership.userKey}@${membership.orgKey}`);
    }
    const existing = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    const row =
      existing ??
      (await prisma.organizationMembership.create({
        data: {
          id: seedUuid(`orgmem:${membership.orgKey}:${membership.userKey}`),
          organizationId,
          userId,
          type: membership.type,
          status: membership.status,
        },
      }));
    if (existing && (existing.status !== membership.status || existing.type !== membership.type)) {
      await prisma.organizationMembership.update({
        where: { id: existing.id },
        data: { status: membership.status, type: membership.type },
      });
    }
    orgMembershipIds.set(`${membership.orgKey}:${membership.userKey}`, row.id);
  }

  for (const project of M3_SEED_PROJECTS) {
    const organizationId = orgIds.get(project.orgKey);
    if (!organizationId) {
      throw new Error(`Missing org for project ${project.key}`);
    }
    const existing = await prisma.project.findFirst({
      where: { organizationId, name: project.name },
    });
    const row =
      existing ??
      (await prisma.project.create({
        data: {
          id: seedUuid(`project:${project.key}`),
          organizationId,
          name: project.name,
        },
      }));
    projectIds.set(project.key, row.id);
  }

  for (const membership of M3_SEED_PROJECT_MEMBERSHIPS) {
    const project = M3_SEED_PROJECTS.find((row) => row.key === membership.projectKey);
    if (!project) {
      throw new Error(`Unknown project ${membership.projectKey}`);
    }
    const projectId = projectIds.get(membership.projectKey);
    const organizationMembershipId = orgMembershipIds.get(`${project.orgKey}:${membership.userKey}`);
    if (!projectId || !organizationMembershipId) {
      throw new Error(`Missing project membership endpoints for ${membership.userKey}@${membership.projectKey}`);
    }
    const existing = await prisma.projectMembership.findUnique({
      where: { projectId_organizationMembershipId: { projectId, organizationMembershipId } },
    });
    const row =
      existing ??
      (await prisma.projectMembership.create({
        data: {
          id: seedUuid(`pm:${membership.projectKey}:${membership.userKey}`),
          projectId,
          organizationMembershipId,
          status: membership.status,
        },
      }));
    if (existing && existing.status !== membership.status) {
      await prisma.projectMembership.update({ where: { id: existing.id }, data: { status: membership.status } });
    }
    const role = await prisma.roleDefinition.findFirst({
      where: {
        organizationId: orgIds.get(project.orgKey),
        templateKey: membership.templateKey,
        isSystemTemplate: false,
      },
    });
    if (!role) {
      throw new Error(`Missing org-owned role ${membership.templateKey}`);
    }
    const assigned = await prisma.projectRoleAssignment.findUnique({
      where: { projectMembershipId_roleId: { projectMembershipId: row.id, roleId: role.id } },
    });
    if (!assigned) {
      await prisma.projectRoleAssignment.create({
        data: { projectMembershipId: row.id, roleId: role.id },
      });
    }
  }

  for (const team of M3_SEED_TEAMS) {
    const organizationId = orgIds.get(team.orgKey);
    if (!organizationId) {
      throw new Error(`Missing org for team ${team.key}`);
    }
    const existing = await prisma.team.findFirst({
      where: { organizationId, name: team.name, archivedAt: null },
    });
    const row =
      existing ??
      (await prisma.team.create({
        data: { id: seedUuid(`team:${team.key}`), organizationId, name: team.name },
      }));
    teamIds.set(team.key, row.id);
  }

  for (const discipline of M3_SEED_DISCIPLINES) {
    const organizationId = orgIds.get(discipline.orgKey);
    if (!organizationId) {
      throw new Error(`Missing org for discipline ${discipline.key}`);
    }
    const existing = await prisma.discipline.findFirst({
      where: { organizationId, code: discipline.code },
    });
    const row =
      existing ??
      (await prisma.discipline.create({
        data: {
          id: seedUuid(`disc:${discipline.key}`),
          organizationId,
          code: discipline.code,
          name: discipline.name,
          active: true,
          sortOrder: M3_SEED_DISCIPLINES.filter((item) => item.orgKey === discipline.orgKey).indexOf(discipline) + 1,
        },
      }));
    if (existing && existing.name !== discipline.name) {
      await prisma.discipline.update({ where: { id: existing.id }, data: { name: discipline.name } });
    }
    disciplineIds.set(discipline.key, row.id);
    void discipline.historicalIdentifier;
  }

  const actualByStatus: Record<string, { start: Date | null; end: Date | null }> = {
    PLANNED: { start: null, end: null },
    ACTIVE: { start: new Date("2026-03-01T00:00:00.000Z"), end: null },
    COMPLETED: { start: new Date("2025-01-01T00:00:00.000Z"), end: new Date("2025-06-01T00:00:00.000Z") },
    CANCELLED: { start: null, end: new Date("2026-01-01T00:00:00.000Z") },
  };

  for (const phase of M3_SEED_PHASES) {
    const project = M3_SEED_PROJECTS.find((row) => row.key === phase.projectKey);
    const projectId = projectIds.get(phase.projectKey);
    const organizationId = project ? orgIds.get(project.orgKey) : undefined;
    const creatorKey = project?.orgKey === "org-b" ? "coord-b" : "coord-a";
    const createdBy = userIds.get(creatorKey);
    if (!projectId || !organizationId || !createdBy) {
      throw new Error(`Missing endpoints for phase ${phase.key}`);
    }
    const existing = await prisma.phase.findFirst({
      where: { projectId, name: phase.name, archivedAt: null },
    });
    const actual = actualByStatus[phase.status] ?? actualByStatus.PLANNED;
    if (!existing) {
      await prisma.phase.create({
        data: {
          id: seedUuid(`phase:${phase.key}`),
          organizationId,
          projectId,
          name: phase.name,
          description: "",
          sequence: phase.sequence,
          status: phase.status,
          createdBy,
          actualStartAt: actual.start,
          actualEndAt: actual.end,
        },
      });
    } else if (existing.status !== phase.status || existing.sequence !== phase.sequence) {
      await prisma.phase.update({
        where: { id: existing.id },
        data: { status: phase.status, sequence: phase.sequence },
      });
    }
  }

  void teamIds;
  void disciplineIds;
}
