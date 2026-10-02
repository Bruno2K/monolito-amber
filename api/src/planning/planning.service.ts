import { Injectable } from "@nestjs/common";
import {
  clampPlanningPageSize,
  deriveKanbanColumn,
  isPlanningListSort,
  isPlanningView,
  isTaskStatus,
  type PlanningListSort,
  type PlanningView,
  type TaskStatus,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import type { RequestSession } from "../auth/session.types";
import { PrismaService } from "../prisma/prisma.service";
import { MilestonesService } from "./milestones.service";
import { PlanningAccess, UUID_RE } from "./planning.access";
import { TasksService } from "./tasks.service";

export interface PlanningQuery {
  view?: string;
  q?: string;
  status?: string;
  late?: string;
  phaseId?: string;
  deliverableId?: string;
  workPackageId?: string;
  milestoneId?: string;
  assigneeUserId?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  order?: string;
  inspect?: string;
}

const SUPPORTING_TAKE = 500;

type TaskRow = Parameters<TasksService["toDto"]>[0];

type PreviewMap = {
  issues: Map<string, { id: string; title: string; status: string }>;
  phases: Map<string, { id: string; name: string }>;
  deliverables: Map<string, { id: string; code: string; title: string }>;
  workPackages: Map<string, { id: string; title: string; code: string | null }>;
  milestones: Map<string, { id: string; title: string; recordedStatus: string; status: string }>;
  assignees: Map<string, { userId: string; displayName: string }>;
};

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlanningAccess,
    private readonly tasks: TasksService,
    private readonly milestones: MilestonesService,
  ) {}

  async getReadModel(session: RequestSession, projectId: string, query: PlanningQuery) {
    const bound = await this.access.requireProject(session, "project.read", projectId);
    const now = new Date();
    const view: PlanningView = isPlanningView(query.view) ? query.view : "list";
    const sort: PlanningListSort = isPlanningListSort(query.sort) ? query.sort : "createdAt";
    const order = query.order === "desc" ? "desc" : "asc";
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = clampPlanningPageSize(Number.parseInt(query.pageSize ?? "", 10));
    const q = query.q?.trim() ?? "";

    const closed = await this.failClosedFilters(bound.organizationId, bound.project.id, query);
    const statuses = this.parseStatuses(query.status);

    const where = closed
      ? { id: { in: [] as string[] }, projectId: bound.project.id, organizationId: bound.organizationId }
      : this.taskWhere({
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          q,
          statuses,
          late: query.late,
          phaseId: query.phaseId,
          deliverableId: query.deliverableId,
          workPackageId: query.workPackageId,
          milestoneId: query.milestoneId,
          assigneeUserId: query.assigneeUserId,
          now,
        });

    const [total, lateCount, statusGroups, rows, milestoneRows, linkedTaskSignals, dependencyRows] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.count({
        where: {
          ...where,
          dueDate: { lt: now },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
      }),
      this.prisma.task.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.milestone.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId },
        orderBy: { createdAt: "asc" },
        take: SUPPORTING_TAKE,
      }),
      this.prisma.task.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId, milestoneId: { not: null } },
        select: { milestoneId: true, dueDate: true, status: true },
        take: SUPPORTING_TAKE,
      }),
      this.prisma.taskDependency.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId },
        orderBy: { createdAt: "asc" },
        take: SUPPORTING_TAKE,
      }),
    ]);

    const inspectedRow = await this.loadInspected(
      bound.organizationId,
      bound.project.id,
      query.inspect,
    );

    const milestoneDtos = milestoneRows.map((row) => this.milestones.toDto(row, linkedTaskSignals));
    const previewSource = inspectedRow && !rows.some((row) => row.id === inspectedRow.id) ? [...rows, inspectedRow] : rows;
    const previews = await this.loadPreviews(bound.organizationId, bound.project.id, previewSource, milestoneDtos);

    const byStatus: Record<string, number> = {};
    for (const group of statusGroups) {
      byStatus[group.status] = group._count._all ?? 0;
    }

    return {
      projectId: bound.project.id,
      organizationId: bound.organizationId,
      generatedAt: now.toISOString(),
      view,
      project: {
        archivedAt: bound.project.archivedAt,
        readOnly: Boolean(bound.project.archivedAt),
      },
      tasks: rows.map((row) => this.toPlanningTask(row, previews)),
      milestones: milestoneDtos,
      dependencies: dependencyRows.map((row) => this.tasks.toDependencyDto(row)),
      page: { page, pageSize, total, sort, order },
      counts: { total, late: lateCount, byStatus },
      inspected: inspectedRow ? this.toPlanningTask(inspectedRow, previews) : null,
    };
  }

  private parseStatuses(raw: string | undefined): TaskStatus[] {
    if (!raw?.trim()) {
      return [];
    }
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(isTaskStatus);
  }

  private async failClosedFilters(
    organizationId: string,
    projectId: string,
    query: PlanningQuery,
  ): Promise<boolean> {
    const checks: Array<{ id?: string; load: (id: string) => Promise<{ organizationId: string; projectId: string } | null> }> = [
      {
        id: query.phaseId,
        load: (id) => this.prisma.phase.findUnique({ where: { id }, select: { organizationId: true, projectId: true } }),
      },
      {
        id: query.deliverableId,
        load: (id) => this.prisma.deliverable.findUnique({ where: { id }, select: { organizationId: true, projectId: true } }),
      },
      {
        id: query.workPackageId,
        load: (id) => this.prisma.workPackage.findUnique({ where: { id }, select: { organizationId: true, projectId: true } }),
      },
      {
        id: query.milestoneId,
        load: (id) => this.prisma.milestone.findUnique({ where: { id }, select: { organizationId: true, projectId: true } }),
      },
    ];
    for (const check of checks) {
      if (!check.id) {
        continue;
      }
      if (!UUID_RE.test(check.id)) {
        return true;
      }
      const row = await check.load(check.id);
      if (!row || row.organizationId !== organizationId || row.projectId !== projectId) {
        return true;
      }
    }
    if (query.assigneeUserId) {
      if (!UUID_RE.test(query.assigneeUserId)) {
        return true;
      }
      const membership = await this.prisma.projectMembership.findFirst({
        where: {
          projectId,
          status: "ACTIVE",
          organizationMembership: {
            userId: query.assigneeUserId,
            organizationId,
            status: "ACTIVE",
          },
        },
        select: { id: true },
      });
      if (!membership) {
        return true;
      }
    }
    return false;
  }

  private taskWhere(input: {
    organizationId: string;
    projectId: string;
    q: string;
    statuses: TaskStatus[];
    late?: string;
    phaseId?: string;
    deliverableId?: string;
    workPackageId?: string;
    milestoneId?: string;
    assigneeUserId?: string;
    now: Date;
  }) {
    const where: Prisma.TaskWhereInput = {
      organizationId: input.organizationId,
      projectId: input.projectId,
    };
    if (input.q) {
      where.title = { contains: input.q, mode: "insensitive" };
    }
    if (input.statuses.length > 0) {
      where.status = { in: input.statuses };
    }
    if (input.late === "true") {
      where.dueDate = { lt: input.now };
      where.status = input.statuses.length > 0
        ? { in: input.statuses.filter((status) => status !== "DONE" && status !== "CANCELLED") }
        : { notIn: ["DONE", "CANCELLED"] };
    } else if (input.late === "false") {
      where.AND = [
        {
          OR: [
            { dueDate: null },
            { dueDate: { gte: input.now } },
            { status: { in: ["DONE", "CANCELLED"] } },
          ],
        },
      ];
    }
    if (input.phaseId) {
      where.phaseId = input.phaseId;
    }
    if (input.deliverableId) {
      where.deliverableId = input.deliverableId;
    }
    if (input.workPackageId) {
      where.workPackageId = input.workPackageId;
    }
    if (input.milestoneId) {
      where.milestoneId = input.milestoneId;
    }
    if (input.assigneeUserId) {
      where.assigneeUserId = input.assigneeUserId;
    }
    return where;
  }

  private async loadInspected(organizationId: string, projectId: string, inspect?: string) {
    if (!inspect || !UUID_RE.test(inspect)) {
      return null;
    }
    const task = await this.prisma.task.findUnique({ where: { id: inspect } });
    if (!task || task.organizationId !== organizationId || task.projectId !== projectId) {
      return null;
    }
    return task;
  }

  private async loadPreviews(
    organizationId: string,
    projectId: string,
    rows: TaskRow[],
    milestoneDtos: Array<{ id: string; title: string; recordedStatus: string; status: string }>,
  ): Promise<PreviewMap> {
    const issueIds = uniqueIds(rows.map((row) => row.issueId));
    const phaseIds = uniqueIds(rows.map((row) => row.phaseId));
    const deliverableIds = uniqueIds(rows.map((row) => row.deliverableId));
    const workPackageIds = uniqueIds(rows.map((row) => row.workPackageId));
    const assigneeIds = uniqueIds(rows.map((row) => row.assigneeUserId));

    const [issues, phases, deliverables, workPackages, memberships] = await Promise.all([
      issueIds.length
        ? this.prisma.issue.findMany({
            where: { id: { in: issueIds }, organizationId, projectId },
            select: { id: true, title: true, status: true },
          })
        : [],
      phaseIds.length
        ? this.prisma.phase.findMany({
            where: { id: { in: phaseIds }, organizationId, projectId },
            select: { id: true, name: true },
          })
        : [],
      deliverableIds.length
        ? this.prisma.deliverable.findMany({
            where: { id: { in: deliverableIds }, organizationId, projectId },
            select: { id: true, code: true, title: true },
          })
        : [],
      workPackageIds.length
        ? this.prisma.workPackage.findMany({
            where: { id: { in: workPackageIds }, organizationId, projectId },
            select: { id: true, title: true, code: true },
          })
        : [],
      assigneeIds.length
        ? this.prisma.projectMembership.findMany({
            where: {
              projectId,
              status: "ACTIVE",
              organizationMembership: {
                organizationId,
                status: "ACTIVE",
                userId: { in: assigneeIds },
              },
            },
            include: { organizationMembership: { include: { user: true } } },
          })
        : [],
    ]);

    return {
      issues: new Map(issues.map((row) => [row.id, row])),
      phases: new Map(phases.map((row) => [row.id, row])),
      deliverables: new Map(deliverables.map((row) => [row.id, row])),
      workPackages: new Map(workPackages.map((row) => [row.id, row])),
      milestones: new Map(
        milestoneDtos.map((row) => [
          row.id,
          { id: row.id, title: row.title, recordedStatus: row.recordedStatus, status: row.status },
        ]),
      ),
      assignees: new Map(
        memberships.map((row) => [
          row.organizationMembership.userId,
          { userId: row.organizationMembership.userId, displayName: row.organizationMembership.user.displayName },
        ]),
      ),
    };
  }

  private toPlanningTask(row: TaskRow, previews: PreviewMap) {
    const dto = this.tasks.toDto(row);
    const late = Boolean(dto.late);
    return {
      ...dto,
      kanbanColumn: deriveKanbanColumn({ status: dto.status as TaskStatus, late }),
      previews: {
        ...(row.issueId && previews.issues.has(row.issueId)
          ? { issue: { ...previews.issues.get(row.issueId)!, relation: "issue" as const } }
          : {}),
        ...(row.phaseId && previews.phases.has(row.phaseId) ? { phase: previews.phases.get(row.phaseId) } : {}),
        ...(row.deliverableId && previews.deliverables.has(row.deliverableId)
          ? { deliverable: previews.deliverables.get(row.deliverableId) }
          : {}),
        ...(row.workPackageId && previews.workPackages.has(row.workPackageId)
          ? { workPackage: previews.workPackages.get(row.workPackageId) }
          : {}),
        ...(row.milestoneId && previews.milestones.has(row.milestoneId)
          ? { milestone: previews.milestones.get(row.milestoneId) }
          : {}),
        ...(row.assigneeUserId && previews.assignees.has(row.assigneeUserId)
          ? { assignee: previews.assignees.get(row.assigneeUserId) }
          : {}),
      },
    };
  }
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
