import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  M3_SEED_PROJECTS,
  M4_SEED_DEPENDENCIES,
  M4_SEED_ISSUES,
  M4_SEED_MILESTONES,
  M4_SEED_TASKS,
} from "../packages/shared/src/index.ts";

function seedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(
    20,
    32,
  )}`;
}

function requireId(map: Map<string, string>, key: string, label: string): string {
  const id = map.get(key);
  if (!id) {
    throw new Error(`M4 seed missing ${label} ${key}`);
  }
  return id;
}

export async function seedM4PlanningDataset(prisma: PrismaClient): Promise<void> {
  const orgIds = new Map<string, string>();
  const projectIds = new Map<string, string>();
  const userIds = new Map<string, string>();
  const issueIds = new Map<string, string>();
  const milestoneIds = new Map<string, string>();

  for (const project of M3_SEED_PROJECTS) {
    const projectId = seedUuid(`project:${project.key}`);
    const stored = await prisma.project.findUnique({ where: { id: projectId } });
    if (!stored) {
      throw new Error(`M4 seed requires M3 project ${project.key}`);
    }
    projectIds.set(project.key, stored.id);
    orgIds.set(project.key, stored.organizationId);
  }

  for (const key of ["coord-a", "coord-b", "contributor-a", "discipline-a"] as const) {
    const id = seedUuid(`user:${key}`);
    const stored = await prisma.user.findUnique({ where: { id } });
    if (!stored) {
      throw new Error(`M4 seed requires M3 user ${key}`);
    }
    userIds.set(key, stored.id);
  }

  for (const issue of M4_SEED_ISSUES) {
    const projectId = requireId(projectIds, issue.projectKey, "project");
    const organizationId = requireId(orgIds, issue.projectKey, "org");
    const createdByUserId = requireId(userIds, issue.projectKey === "project-b1" ? "coord-b" : "coord-a", "user");
    const id = seedUuid(`issue:${issue.key}`);
    await prisma.issue.upsert({
      where: { id },
      create: {
        id,
        organizationId,
        projectId,
        origin: issue.origin,
        title: issue.title,
        status: issue.status,
        severity: issue.severity,
        priority: issue.priority,
        createdByUserId,
      },
      update: { title: issue.title, status: issue.status },
    });
    issueIds.set(issue.key, id);
  }

  for (const milestone of M4_SEED_MILESTONES) {
    const projectId = requireId(projectIds, milestone.projectKey, "project");
    const organizationId = requireId(orgIds, milestone.projectKey, "org");
    const id = seedUuid(`ms:${milestone.key}`);
    const phaseId = milestone.phaseKey ? seedUuid(`phase:${milestone.phaseKey}`) : null;
    const deliverableId = milestone.deliverableKey ? seedUuid(`del:${milestone.deliverableKey}`) : null;
    const actor = requireId(userIds, milestone.projectKey === "project-b1" ? "coord-b" : "coord-a", "user");
    await prisma.milestone.upsert({
      where: { id },
      create: {
        id,
        organizationId,
        projectId,
        title: milestone.title,
        status: milestone.status,
        targetDate: milestone.targetDate ? new Date(milestone.targetDate) : null,
        phaseId,
        deliverableId,
        achievedAt: milestone.status === "ACHIEVED" ? new Date("2025-06-02T00:00:00.000Z") : null,
        achievedByUserId: milestone.status === "ACHIEVED" ? actor : null,
        cancelledAt: milestone.status === "CANCELLED" ? new Date("2026-01-15T00:00:00.000Z") : null,
        cancelledByUserId: milestone.status === "CANCELLED" ? actor : null,
      },
      update: {
        title: milestone.title,
        status: milestone.status,
        targetDate: milestone.targetDate ? new Date(milestone.targetDate) : null,
        phaseId,
        deliverableId,
      },
    });
    milestoneIds.set(milestone.key, id);
  }

  for (const task of M4_SEED_TASKS) {
    const projectId = requireId(projectIds, task.projectKey, "project");
    const organizationId = requireId(orgIds, task.projectKey, "org");
    const createdByUserId = requireId(userIds, task.projectKey === "project-b1" ? "coord-b" : "coord-a", "user");
    const id = seedUuid(`task:${task.key}`);
    const assigneeUserId = task.assigneeUserKey ? requireId(userIds, task.assigneeUserKey, "assignee") : null;
    const now = new Date("2026-09-15T00:00:00.000Z");
    await prisma.task.upsert({
      where: { id },
      create: {
        id,
        organizationId,
        projectId,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        plannedStartAt: task.plannedStartAt ? new Date(task.plannedStartAt) : null,
        progressPercent: task.progressPercent ?? null,
        blockedReason: task.blockedReason ?? null,
        assigneeUserId,
        createdByUserId,
        issueId: task.issueKey ? requireId(issueIds, task.issueKey, "issue") : null,
        milestoneId: task.milestoneKey ? requireId(milestoneIds, task.milestoneKey, "milestone") : null,
        phaseId: task.phaseKey ? seedUuid(`phase:${task.phaseKey}`) : null,
        deliverableId: task.deliverableKey ? seedUuid(`del:${task.deliverableKey}`) : null,
        workPackageId: task.workPackageKey ? seedUuid(`wp:${task.workPackageKey}`) : null,
        startedAt: task.status === "IN_PROGRESS" || task.status === "DONE" ? now : null,
        completedAt: task.status === "DONE" ? new Date("2026-09-16T00:00:00.000Z") : null,
      },
      update: {
        title: task.title,
        status: task.status,
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        plannedStartAt: task.plannedStartAt ? new Date(task.plannedStartAt) : null,
        progressPercent: task.progressPercent ?? null,
        blockedReason: task.blockedReason ?? null,
        assigneeUserId,
        issueId: task.issueKey ? requireId(issueIds, task.issueKey, "issue") : null,
        milestoneId: task.milestoneKey ? requireId(milestoneIds, task.milestoneKey, "milestone") : null,
        phaseId: task.phaseKey ? seedUuid(`phase:${task.phaseKey}`) : null,
        deliverableId: task.deliverableKey ? seedUuid(`del:${task.deliverableKey}`) : null,
        workPackageId: task.workPackageKey ? seedUuid(`wp:${task.workPackageKey}`) : null,
      },
    });
  }

  for (const edge of M4_SEED_DEPENDENCIES) {
    const predecessorTaskId = seedUuid(`task:${edge.predecessorKey}`);
    const successorTaskId = seedUuid(`task:${edge.successorKey}`);
    const successor = await prisma.task.findUnique({ where: { id: successorTaskId } });
    if (!successor) {
      throw new Error(`M4 seed missing successor ${edge.successorKey}`);
    }
    const existing = await prisma.taskDependency.findFirst({
      where: { predecessorTaskId, successorTaskId },
    });
    if (existing) {
      continue;
    }
    await prisma.taskDependency.create({
      data: {
        id: seedUuid(`dep:${edge.key}`),
        organizationId: successor.organizationId,
        projectId: successor.projectId,
        predecessorTaskId,
        successorTaskId,
        type: edge.type,
        createdByUserId: successor.createdByUserId,
      },
    });
  }
}
