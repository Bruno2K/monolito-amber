import { Injectable } from "@nestjs/common";
import {
  PLANNING_SCHEDULE_TAKE,
  authorizedScheduleLinks,
  buildScheduleLanes,
  clampPlanningPageSize,
  countTasksByKanbanColumn,
  deriveKanbanColumn,
  hasPermission,
  incompletePredecessorBlockers,
  isTaskLate,
  isPlanningListSort,
  isPlanningView,
  isTaskStatus,
  planningScheduleDateRange,
  prerequisitesBlockStart,
  type PlanningListSort,
  type PlanningView,
  type ScheduleSourceRow,
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

    const [
      total,
      lateCount,
      statusGroups,
      rows,
      milestoneRows,
      contributingTasks,
      dependencyRows,
      countSource,
      phaseRows,
      deliverableRows,
      workPackageRows,
      scheduleTaskRows,
    ] = await Promise.all([
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
      this.milestones.loadContributingTasks(bound.organizationId, bound.project.id),
      this.prisma.taskDependency.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId },
        orderBy: { createdAt: "asc" },
        take: SUPPORTING_TAKE,
      }),
      this.prisma.task.findMany({
        where,
        select: { status: true, dueDate: true },
      }),
      this.prisma.phase.findMany({
        where: { organizationId: bound.organizationId, projectId: bound.project.id, archivedAt: null },
        orderBy: [{ sequence: "asc" }, { name: "asc" }],
        take: PLANNING_SCHEDULE_TAKE,
        select: {
          id: true,
          name: true,
          sequence: true,
          plannedStartAt: true,
          plannedEndAt: true,
          status: true,
          version: true,
        },
      }),
      this.prisma.deliverable.findMany({
        where: { organizationId: bound.organizationId, projectId: bound.project.id, archivedAt: null },
        orderBy: { code: "asc" },
        take: PLANNING_SCHEDULE_TAKE,
        select: {
          id: true,
          code: true,
          title: true,
          phaseId: true,
          plannedStartAt: true,
          dueAt: true,
          status: true,
          version: true,
        },
      }),
      this.prisma.workPackage.findMany({
        where: { organizationId: bound.organizationId, projectId: bound.project.id, archivedAt: null },
        orderBy: { title: "asc" },
        take: PLANNING_SCHEDULE_TAKE,
        select: {
          id: true,
          code: true,
          title: true,
          phaseId: true,
          deliverableId: true,
          plannedStartAt: true,
          dueAt: true,
          status: true,
          version: true,
          blockedReason: true,
        },
      }),
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: PLANNING_SCHEDULE_TAKE,
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          plannedStartAt: true,
          version: true,
          phaseId: true,
          deliverableId: true,
          workPackageId: true,
          milestoneId: true,
          blockedReason: true,
        },
      }),
    ]);

    const inspectedRow = await this.loadInspected(
      bound.organizationId,
      bound.project.id,
      query.inspect,
    );
    const inspectedHistory = inspectedRow
      ? await this.tasks.historyFor(bound.organizationId, bound.project.id, inspectedRow.id)
      : [];

    const milestoneDtos = milestoneRows.map((row) => this.milestones.toDto(row, contributingTasks));
    const previewSource = inspectedRow && !rows.some((row) => row.id === inspectedRow.id) ? [...rows, inspectedRow] : rows;
    const previews = await this.loadPreviews(bound.organizationId, bound.project.id, previewSource, milestoneDtos);
    const graph = await this.loadDependencyProjection(
      bound.organizationId,
      bound.project.id,
      previewSource.map((row) => row.id),
      dependencyRows,
    );

    const byStatus: Record<string, number> = {};
    for (const group of statusGroups) {
      byStatus[group.status] = group._count._all ?? 0;
    }
    const byKanbanColumn = countTasksByKanbanColumn(
      countSource.map((row) => ({
        status: row.status as TaskStatus,
        late: isTaskLate({ dueDate: row.dueDate, status: row.status as TaskStatus, now }),
      })),
    );
    const scheduleGraph = await this.loadDependencyProjection(
      bound.organizationId,
      bound.project.id,
      scheduleTaskRows.map((row) => row.id),
      dependencyRows,
    );
    const filtered = Boolean(
      q ||
        statuses.length ||
        query.late ||
        query.phaseId ||
        query.deliverableId ||
        query.workPackageId ||
        query.milestoneId ||
        query.assigneeUserId,
    );
    const schedule = this.toSchedule({
      now,
      filtered,
      archived: Boolean(bound.project.archivedAt),
      canEditTaskDates: !bound.project.archivedAt && hasPermission(bound.context, "task.update"),
      phases: phaseRows,
      deliverables: deliverableRows,
      workPackages: workPackageRows,
      tasks: scheduleTaskRows,
      milestones: milestoneDtos,
      dependencies: dependencyRows,
      graph: scheduleGraph,
    });

    return {
      projectId: bound.project.id,
      organizationId: bound.organizationId,
      generatedAt: now.toISOString(),
      view,
      project: {
        archivedAt: bound.project.archivedAt,
        readOnly: Boolean(bound.project.archivedAt),
      },
      tasks: rows.map((row) => this.toPlanningTask(row, previews, graph)),
      milestones: milestoneDtos,
      dependencies: dependencyRows.map((row) => this.tasks.toDependencyDto(row)),
      schedule,
      page: { page, pageSize, total, sort, order },
      counts: { total, late: lateCount, byStatus, byKanbanColumn },
      inspected: inspectedRow
        ? { ...this.toPlanningTask(inspectedRow, previews, graph), history: inspectedHistory }
        : null,
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

  private async loadDependencyProjection(
    organizationId: string,
    projectId: string,
    taskIds: string[],
    dependencyRows: Array<{
      id: string;
      predecessorTaskId: string;
      successorTaskId: string;
    }>,
  ) {
    const relevant = dependencyRows.filter(
      (row) => taskIds.includes(row.predecessorTaskId) || taskIds.includes(row.successorTaskId),
    );
    const neighborIds = [
      ...new Set(relevant.flatMap((row) => [row.predecessorTaskId, row.successorTaskId])),
    ];
    const neighbors = neighborIds.length
      ? await this.prisma.task.findMany({
          where: { id: { in: neighborIds }, organizationId, projectId },
          select: { id: true, title: true, status: true },
        })
      : [];
    const neighborMap = new Map(neighbors.map((row) => [row.id, row]));
    const byTask = new Map<
      string,
      {
        predecessors: Array<{ dependencyId: string; taskId: string; title?: string; status: string }>;
        successors: Array<{ dependencyId: string; taskId: string; title?: string; status: string }>;
      }
    >();
    const ensure = (id: string) => {
      const current = byTask.get(id) ?? { predecessors: [], successors: [] };
      byTask.set(id, current);
      return current;
    };
    const neighborView = (id: string) => {
      const row = neighborMap.get(id);
      if (!row) {
        return null;
      }
      return { taskId: row.id, title: row.title, status: row.status };
    };
    for (const edge of relevant) {
      const predecessor = neighborView(edge.predecessorTaskId);
      const successor = neighborView(edge.successorTaskId);
      if (predecessor) {
        ensure(edge.successorTaskId).predecessors.push({
          dependencyId: edge.id,
          ...predecessor,
        });
      }
      if (successor) {
        ensure(edge.predecessorTaskId).successors.push({
          dependencyId: edge.id,
          ...successor,
        });
      }
    }
    return byTask;
  }

  private toPlanningTask(
    row: TaskRow,
    previews: PreviewMap,
    graph?: Map<
      string,
      {
        predecessors: Array<{ dependencyId: string; taskId: string; title?: string; status: string }>;
        successors: Array<{ dependencyId: string; taskId: string; title?: string; status: string }>;
      }
    >,
  ) {
    const dto = this.tasks.toDto(row);
    const late = Boolean(dto.late);
    const links = graph?.get(row.id) ?? { predecessors: [], successors: [] };
    const startBlockers = incompletePredecessorBlockers(
      links.predecessors.map((item) => ({ id: item.taskId, status: item.status, title: item.title })),
    );
    return {
      ...dto,
      kanbanColumn: deriveKanbanColumn({ status: dto.status as TaskStatus, late }),
      dependencyStartBlocked: prerequisitesBlockStart(
        links.predecessors.map((item) => ({ status: item.status })),
      ),
      startBlockers,
      predecessors: links.predecessors,
      successors: links.successors,
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

  private toSchedule(input: {
    now: Date;
    filtered: boolean;
    archived: boolean;
    canEditTaskDates: boolean;
    phases: Array<{
      id: string;
      name: string;
      sequence: number;
      plannedStartAt: Date | null;
      plannedEndAt: Date | null;
      status: string;
      version: number;
    }>;
    deliverables: Array<{
      id: string;
      code: string;
      title: string;
      phaseId: string;
      plannedStartAt: Date | null;
      dueAt: Date | null;
      status: string;
      version: number;
    }>;
    workPackages: Array<{
      id: string;
      code: string | null;
      title: string;
      phaseId: string;
      deliverableId: string | null;
      plannedStartAt: Date | null;
      dueAt: Date | null;
      status: string;
      version: number;
      blockedReason: string | null;
    }>;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      dueDate: Date | null;
      plannedStartAt: Date | null;
      version: number;
      phaseId: string | null;
      deliverableId: string | null;
      workPackageId: string | null;
      milestoneId: string | null;
      blockedReason: string | null;
    }>;
    milestones: Array<{
      id: string;
      title: string;
      recordedStatus: string;
      status: string;
      targetDate: Date | string | null;
      phaseId: string | null;
      deliverableId: string | null;
      risk?: { reasons?: Array<{ code: string; text: string }>; explanation?: string } | null;
    }>;
    dependencies: Array<{ id: string; predecessorTaskId: string; successorTaskId: string; type?: string }>;
    graph: Map<
      string,
      {
        predecessors: Array<{ dependencyId: string; taskId: string; title?: string; status: string }>;
        successors: Array<{ dependencyId: string; taskId: string; title?: string; status: string }>;
      }
    >;
  }) {
    const taskSources: ScheduleSourceRow[] = input.tasks.map((row) => {
      const late = isTaskLate({ dueDate: row.dueDate, status: row.status as TaskStatus, now: input.now });
      const predecessors = input.graph.get(row.id)?.predecessors ?? [];
      return {
        id: row.id,
        title: row.title,
        start: row.plannedStartAt,
        end: row.dueDate,
        status: row.status,
        late,
        version: row.version,
        phaseId: row.phaseId,
        deliverableId: row.deliverableId,
        workPackageId: row.workPackageId,
        risk: scheduleTaskRisk({
          status: row.status,
          late,
          blockedReason: row.blockedReason,
          predecessors,
        }),
      };
    });
    let phaseSources: ScheduleSourceRow[] = input.phases.map((row) => ({
      id: row.id,
      title: row.name,
      start: row.plannedStartAt,
      end: row.plannedEndAt,
      status: row.status,
      version: row.version,
      sequence: row.sequence,
    }));
    let deliverableSources: ScheduleSourceRow[] = input.deliverables.map((row) => ({
      id: row.id,
      title: row.title,
      code: row.code,
      start: row.plannedStartAt,
      end: row.dueAt,
      status: row.status,
      version: row.version,
      phaseId: row.phaseId,
    }));
    let workPackageSources: ScheduleSourceRow[] = input.workPackages.map((row) => ({
      id: row.id,
      title: row.title,
      code: row.code,
      start: row.plannedStartAt,
      end: row.dueAt,
      status: row.status,
      version: row.version,
      phaseId: row.phaseId,
      deliverableId: row.deliverableId,
      risk: row.status === "BLOCKED" && row.blockedReason
        ? { code: "WORK_PACKAGE_BLOCKED", text: row.blockedReason }
        : null,
    }));
    let milestoneSources: ScheduleSourceRow[] = input.milestones.map((row) => ({
      id: row.id,
      title: row.title,
      start: row.targetDate,
      end: row.targetDate,
      status: row.status,
      recordedStatus: row.recordedStatus,
      phaseId: row.phaseId,
      deliverableId: row.deliverableId,
      risk: milestoneScheduleRisk(row),
    }));

    if (input.filtered) {
      if (taskSources.length === 0) {
        phaseSources = [];
        deliverableSources = [];
        workPackageSources = [];
        milestoneSources = [];
      } else {
        const neededWp = new Set(taskSources.map((row) => row.workPackageId).filter((id): id is string => Boolean(id)));
        const neededDel = new Set(
          [
            ...taskSources.map((row) => row.deliverableId),
            ...workPackageSources.filter((row) => neededWp.has(row.id)).map((row) => row.deliverableId),
          ].filter((id): id is string => Boolean(id)),
        );
        const neededPhase = new Set(
          [
            ...taskSources.map((row) => row.phaseId),
            ...deliverableSources.filter((row) => neededDel.has(row.id)).map((row) => row.phaseId),
            ...workPackageSources.filter((row) => neededWp.has(row.id)).map((row) => row.phaseId),
          ].filter((id): id is string => Boolean(id)),
        );
        const neededMs = new Set(input.tasks.map((row) => row.milestoneId).filter((id): id is string => Boolean(id)));
        phaseSources = phaseSources.filter((row) => neededPhase.has(row.id));
        deliverableSources = deliverableSources.filter((row) => neededDel.has(row.id));
        workPackageSources = workPackageSources.filter((row) => neededWp.has(row.id));
        milestoneSources = milestoneSources.filter(
          (row) =>
            neededMs.has(row.id) ||
            (row.phaseId && neededPhase.has(row.phaseId)) ||
            (row.deliverableId && neededDel.has(row.deliverableId)),
        );
      }
    }

    const lanes = buildScheduleLanes({
      phases: phaseSources,
      deliverables: deliverableSources,
      workPackages: workPackageSources,
      tasks: taskSources,
      milestones: milestoneSources,
    });
    const range = planningScheduleDateRange(lanes, input.now);
    const authorizedTaskIds = new Set(taskSources.map((row) => row.id));
    return {
      dateRange: { start: range.start.toISOString(), end: range.end.toISOString() },
      take: PLANNING_SCHEDULE_TAKE,
      truncated:
        input.phases.length >= PLANNING_SCHEDULE_TAKE ||
        input.deliverables.length >= PLANNING_SCHEDULE_TAKE ||
        input.workPackages.length >= PLANNING_SCHEDULE_TAKE ||
        input.tasks.length >= PLANNING_SCHEDULE_TAKE,
      canEditTaskDates: input.canEditTaskDates && !input.archived,
      lanes,
      links: authorizedScheduleLinks(input.dependencies, authorizedTaskIds),
    };
  }
}

function scheduleTaskRisk(input: {
  status: string;
  late: boolean;
  blockedReason: string | null;
  predecessors: Array<{ status: string }>;
}): { code: string; text: string } | null {
  if (input.status === "BLOCKED") {
    return {
      code: "TASK_BLOCKED",
      text: input.blockedReason
        ? `Stored BLOCKED: ${input.blockedReason}. This is not a dependency start gate.`
        : "Stored BLOCKED. This is not a dependency start gate.",
    };
  }
  if (prerequisitesBlockStart(input.predecessors)) {
    return {
      code: "DEPENDENCY_START",
      text: "Finish-to-start predecessor is not DONE. This is not Task BLOCKED.",
    };
  }
  if (input.late) {
    return {
      code: "LATE",
      text: "Due date is in the past. Lateness is derived and is not a stored status.",
    };
  }
  return null;
}

function milestoneScheduleRisk(row: {
  status: string;
  risk?: { reasons?: Array<{ code: string; text: string }>; explanation?: string } | null;
}): { code: string; text: string } | null {
  if (row.risk?.explanation) {
    return {
      code: row.risk.reasons?.[0]?.code ?? row.status,
      text: row.risk.explanation,
    };
  }
  if (row.status === "AT_RISK") {
    return {
      code: "AT_RISK",
      text: "At least one authorized linked Task is late, stored BLOCKED, or dependency-blocked. Stored milestone status remains PLANNED.",
    };
  }
  if (row.status === "MISSED") {
    return {
      code: "MISSED",
      text: "Target date is in the past. Stored milestone status remains PLANNED.",
    };
  }
  return null;
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
