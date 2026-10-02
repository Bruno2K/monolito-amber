import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  PlanningStateError,
  assertAcyclicDependency,
  assertEstimatedMinutes,
  assertFinishToStartType,
  assertTaskProgressPercent,
  assertTaskTransition,
  isTaskLate,
  isTaskPriority,
  isTaskStatus,
  linkAuditPayload,
  prerequisitesBlockStart,
  redactSecrets,
  resolveTaskDeliveryRefs,
  taskCompleteCascadesToDeliverable,
  taskCompleteCascadesToIssue,
  taskCompleteCascadesToMilestone,
  taskCompleteCascadesToWorkPackage,
  taskStatusRequiresBlockedReason,
  taskStatusRequiresCompletePermission,
  type PermissionCode,
  type TaskPriority,
  type TaskStatus,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { PlanningAccess, UUID_RE } from "./planning.access";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlanningAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    session: RequestSession,
    projectId: string,
    query: { phaseId?: string; deliverableId?: string; workPackageId?: string } = {},
  ) {
    const bound = await this.access.requireProject(session, "project.read", projectId);
    const where: {
      projectId: string;
      organizationId: string;
      phaseId?: string;
      deliverableId?: string;
      workPackageId?: string;
    } = { projectId: bound.project.id, organizationId: bound.organizationId };
    if (query.phaseId && UUID_RE.test(query.phaseId)) {
      where.phaseId = query.phaseId;
    }
    if (query.deliverableId && UUID_RE.test(query.deliverableId)) {
      where.deliverableId = query.deliverableId;
    }
    if (query.workPackageId && UUID_RE.test(query.workPackageId)) {
      where.workPackageId = query.workPackageId;
    }
    const rows = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(session: RequestSession, projectId: string, taskId: string) {
    const bound = await this.requireTask(session, "project.read", projectId, taskId);
    return this.toDto(bound.task);
  }

  async create(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: {
      title: string;
      description?: string;
      priority?: string;
      responsibleDisciplineId?: string;
      dueDate?: string;
      issueId?: string;
      milestoneId?: string;
      phaseId?: string;
      deliverableId?: string;
      workPackageId?: string;
      plannedStartAt?: string;
      estimatedMinutes?: number;
      progressPercent?: number;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.access.requireProject(session, "task.create", projectId);
    this.access.rejectArchivedProject(bound.project);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      title: input.title,
      description: input.description ?? "",
      issueId: input.issueId ?? null,
      milestoneId: input.milestoneId ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const title = input.title.trim();
    if (!title) {
      throw new PlanningStateError("Task title is required");
    }
    const issueId = await this.resolveOptionalIssue(
      bound.organizationId,
      bound.project.id,
      input.issueId,
    );
    const milestoneId = await this.resolveOptionalMilestone(
      bound.organizationId,
      bound.project.id,
      input.milestoneId,
    );
    const refs = await this.resolveDeliveryRefs(bound.organizationId, bound.project.id, {
      phaseId: input.phaseId,
      deliverableId: input.deliverableId,
      workPackageId: input.workPackageId,
    });
    const responsibleDisciplineId = await this.resolveOptionalDiscipline(
      bound.organizationId,
      input.responsibleDisciplineId,
    );
    assertTaskProgressPercent(input.progressPercent);
    assertEstimatedMinutes(input.estimatedMinutes);
    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          issueId,
          milestoneId,
          phaseId: refs.phaseId,
          deliverableId: refs.deliverableId,
          workPackageId: refs.workPackageId,
          title,
          description: input.description?.trim() ?? "",
          status: "TODO",
          priority: this.parseOptionalPriority(input.priority),
          responsibleDisciplineId,
          dueDate: this.parseDate(input.dueDate, "Task due date"),
          plannedStartAt: this.parseDate(input.plannedStartAt, "Task planned start"),
          estimatedMinutes: input.estimatedMinutes ?? null,
          progressPercent: input.progressPercent ?? null,
          createdByUserId: session.userId,
        },
      });
      await this.audit.insert(
        {
          organizationId: task.organizationId,
          projectId: task.projectId,
          actorUserId: session.userId,
          eventType: "TASK_CREATED",
          resourceType: "task",
          resourceId: task.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            issueId: task.issueId,
            milestoneId: task.milestoneId,
            ...linkAuditPayload({
              phaseId: task.phaseId,
              deliverableId: task.deliverableId,
              workPackageId: task.workPackageId,
            }),
            priority: task.priority,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.TaskCreated,
        {
          organizationId: task.organizationId,
          projectId: task.projectId,
          taskId: task.id,
          issueId: task.issueId,
          milestoneId: task.milestoneId,
        },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(task);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: {
      title?: string;
      description?: string;
      priority?: string | null;
      responsibleDisciplineId?: string | null;
      dueDate?: string | null;
      issueId?: string | null;
      milestoneId?: string | null;
      phaseId?: string | null;
      deliverableId?: string | null;
      workPackageId?: string | null;
      plannedStartAt?: string | null;
      estimatedMinutes?: number | null;
      progressPercent?: number | null;
      assigneeUserId?: string;
      status?: string;
      organizationId?: string;
      projectId?: string;
      expectedVersion?: number;
    },
  ) {
    const bound = await this.requireTask(session, "task.update", projectId, taskId);
    this.access.rejectArchivedProject(bound.project);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    if (input.status !== undefined || input.assigneeUserId !== undefined) {
      throw new PlanningStateError("Status and assignee have dedicated endpoints and are not patchable");
    }
    this.requireExpectedVersion(bound.task.version, input.expectedVersion);
    const started = idempotencyKey
      ? await this.idempotency.begin(bound.organizationId, idempotencyKey, {
          taskId,
          expectedVersion: input.expectedVersion,
          title: input.title ?? null,
          progressPercent: input.progressPercent ?? null,
          dueDate: input.dueDate ?? null,
        })
      : null;
    if (started?.replay) {
      return started.replay.responseBody;
    }
    const issueId =
      input.issueId !== undefined
        ? await this.resolveOptionalIssue(bound.organizationId, bound.project.id, input.issueId)
        : bound.task.issueId;
    const milestoneId =
      input.milestoneId !== undefined
        ? await this.resolveOptionalMilestone(bound.organizationId, bound.project.id, input.milestoneId)
        : bound.task.milestoneId;
    const refs = await this.resolveDeliveryRefs(
      bound.organizationId,
      bound.project.id,
      {
        phaseId: input.phaseId !== undefined ? input.phaseId : bound.task.phaseId,
        deliverableId: input.deliverableId !== undefined ? input.deliverableId : bound.task.deliverableId,
        workPackageId: input.workPackageId !== undefined ? input.workPackageId : bound.task.workPackageId,
      },
    );
    const responsibleDisciplineId =
      input.responsibleDisciplineId !== undefined
        ? await this.resolveOptionalDiscipline(bound.organizationId, input.responsibleDisciplineId)
        : bound.task.responsibleDisciplineId;
    if (input.progressPercent !== undefined) {
      assertTaskProgressPercent(input.progressPercent);
    }
    if (input.estimatedMinutes !== undefined) {
      assertEstimatedMinutes(input.estimatedMinutes);
    }
    const refsChanged =
      refs.phaseId !== bound.task.phaseId ||
      refs.deliverableId !== bound.task.deliverableId ||
      refs.workPackageId !== bound.task.workPackageId;
    const next = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: bound.task.id },
        data: {
          title: input.title?.trim() || bound.task.title,
          description: input.description !== undefined ? input.description : bound.task.description,
          priority: input.priority !== undefined ? this.parseOptionalPriority(input.priority) : bound.task.priority,
          responsibleDisciplineId,
          dueDate: input.dueDate !== undefined ? this.parseDate(input.dueDate, "Task due date") : bound.task.dueDate,
          plannedStartAt:
            input.plannedStartAt !== undefined
              ? this.parseDate(input.plannedStartAt, "Task planned start")
              : bound.task.plannedStartAt,
          estimatedMinutes: input.estimatedMinutes !== undefined ? input.estimatedMinutes : bound.task.estimatedMinutes,
          progressPercent: input.progressPercent !== undefined ? input.progressPercent : bound.task.progressPercent,
          issueId,
          milestoneId,
          phaseId: refs.phaseId,
          deliverableId: refs.deliverableId,
          workPackageId: refs.workPackageId,
          version: bound.task.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "TASK_UPDATED",
          resourceType: "task",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            title: updated.title !== bound.task.title,
            description: updated.description !== bound.task.description,
            priority: updated.priority,
            plannedStartAt: updated.plannedStartAt,
            estimatedMinutes: updated.estimatedMinutes,
          }),
        },
        tx,
      );
      const dueChanged =
        input.dueDate !== undefined &&
        (updated.dueDate?.toISOString() ?? null) !== (bound.task.dueDate?.toISOString() ?? null);
      if (dueChanged || (input.plannedStartAt !== undefined &&
        (updated.plannedStartAt?.toISOString() ?? null) !== (bound.task.plannedStartAt?.toISOString() ?? null))) {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "TASK_DUE_DATE_CHANGED",
            resourceType: "task",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({
              from: bound.task.dueDate,
              to: updated.dueDate,
              plannedStartFrom: bound.task.plannedStartAt,
              plannedStartTo: updated.plannedStartAt,
            }),
          },
          tx,
        );
      }
      if (input.progressPercent !== undefined && updated.progressPercent !== bound.task.progressPercent) {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "TASK_PROGRESS_CHANGED",
            resourceType: "task",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({
              from: bound.task.progressPercent,
              to: updated.progressPercent,
              statusUnchanged: updated.status,
            }),
          },
          tx,
        );
      }
      if (refsChanged) {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "TASK_DELIVERY_REFS_UPDATED",
            resourceType: "task",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets(
              linkAuditPayload({
                taskId: updated.id,
                phaseId: updated.phaseId,
                deliverableId: updated.deliverableId,
                workPackageId: updated.workPackageId,
              }),
            ),
          },
          tx,
        );
      }
      const body = this.toDto(updated);
      if (started) {
        await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, body, tx);
      }
      return body;
    });
    return next;
  }

  async assign(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { assigneeUserId: string | null; expectedVersion?: number },
  ) {
    const bound = await this.requireTask(session, "task.assign", projectId, taskId);
    this.access.rejectArchivedProject(bound.project);
    this.requireExpectedVersion(bound.task.version, input.expectedVersion);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      taskId,
      assigneeUserId: input.assigneeUserId,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (input.assigneeUserId != null) {
      await this.assertActiveProjectAssignee(
        bound.organizationId,
        bound.project.id,
        input.assigneeUserId,
      );
    }
    const next = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: bound.task.id },
        data: {
          assigneeUserId: input.assigneeUserId,
          version: bound.task.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "TASK_ASSIGNED",
          resourceType: "task",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ assigneeUserId: updated.assigneeUserId }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.TaskAssigned,
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          taskId: updated.id,
          assigneeUserId: updated.assigneeUserId,
        },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return next;
  }

  async transition(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { status: string; blockedReason?: string; expectedVersion?: number },
  ) {
    if (!isTaskStatus(input.status)) {
      throw new PlanningStateError("Unknown Task status");
    }
    const permission: PermissionCode = taskStatusRequiresCompletePermission(input.status)
      ? "task.complete"
      : "task.update";
    const bound = await this.requireTask(session, permission, projectId, taskId);
    this.access.rejectArchivedProject(bound.project);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      taskId,
      status: input.status,
      blockedReason: input.blockedReason ?? null,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    assertTaskTransition(bound.task.status as TaskStatus, input.status);
    this.requireExpectedVersion(bound.task.version, input.expectedVersion);
    if (taskStatusRequiresBlockedReason(input.status)) {
      const reason = input.blockedReason?.trim() ?? "";
      if (!reason) {
        throw new PlanningStateError("BLOCKED requires a blocked reason");
      }
    }
    if (input.status === "IN_PROGRESS") {
      await this.assertPrerequisitesDone(bound.task.id, bound.organizationId, bound.project.id);
    }
    const sourceIssueId = bound.task.issueId;
    const sourceMilestoneId = bound.task.milestoneId;
    const body = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.task.update({
        where: { id: bound.task.id },
        data: {
          status: input.status,
          blockedReason: input.status === "BLOCKED" ? input.blockedReason!.trim() : null,
          startedAt:
            input.status === "IN_PROGRESS" ? (bound.task.startedAt ?? now) : bound.task.startedAt,
          completedAt: input.status === "DONE" ? now : bound.task.completedAt,
          version: bound.task.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "TASK_STATUS_CHANGED",
          resourceType: "task",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            from: bound.task.status,
            to: updated.status,
            blockedReason: updated.blockedReason,
            issueId: sourceIssueId,
            milestoneId: sourceMilestoneId,
          }),
        },
        tx,
      );
      if (bound.task.status === "BLOCKED" && updated.status === "IN_PROGRESS") {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "TASK_UNBLOCKED",
            resourceType: "task",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.task.blockedReason, to: updated.status }),
          },
          tx,
        );
      }
      if (updated.status === "BLOCKED") {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "TASK_BLOCKED",
            resourceType: "task",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ blockedReason: updated.blockedReason }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.TaskBlocked,
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            taskId: updated.id,
            blockedReason: updated.blockedReason,
          },
          currentCorrelationId(),
          tx,
        );
      }
      if (updated.status === "DONE") {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "TASK_COMPLETED",
            resourceType: "task",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({
              issueId: sourceIssueId,
              milestoneId: sourceMilestoneId,
              autoResolvedIssue: false,
              autoAchievedMilestone: false,
              autoCompletedWorkPackage: taskCompleteCascadesToWorkPackage(),
              autoCompletedDeliverable: taskCompleteCascadesToDeliverable(),
              autoCompletedMilestone: taskCompleteCascadesToMilestone(),
              autoResolvedIssueCascade: taskCompleteCascadesToIssue(),
            }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.TaskCompleted,
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            taskId: updated.id,
            issueId: sourceIssueId,
            milestoneId: sourceMilestoneId,
          },
          currentCorrelationId(),
          tx,
        );
      }
      if (updated.status === "CANCELLED") {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "TASK_CANCELLED",
            resourceType: "task",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.task.status }),
          },
          tx,
        );
      }
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async start(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number } = {},
  ) {
    return this.transition(session, projectId, taskId, idempotencyKey, {
      status: "IN_PROGRESS",
      expectedVersion: input.expectedVersion,
    });
  }

  async block(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { blockedReason?: string; expectedVersion?: number },
  ) {
    return this.transition(session, projectId, taskId, idempotencyKey, {
      status: "BLOCKED",
      blockedReason: input.blockedReason,
      expectedVersion: input.expectedVersion,
    });
  }

  async unblock(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number } = {},
  ) {
    return this.transition(session, projectId, taskId, idempotencyKey, {
      status: "IN_PROGRESS",
      expectedVersion: input.expectedVersion,
    });
  }

  async complete(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number } = {},
  ) {
    return this.transition(session, projectId, taskId, idempotencyKey, {
      status: "DONE",
      expectedVersion: input.expectedVersion,
    });
  }

  async cancel(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number } = {},
  ) {
    return this.transition(session, projectId, taskId, idempotencyKey, {
      status: "CANCELLED",
      expectedVersion: input.expectedVersion,
    });
  }

  async listHistory(session: RequestSession, projectId: string, taskId: string) {
    const bound = await this.requireTask(session, "project.read", projectId, taskId);
    return this.historyFor(bound.organizationId, bound.project.id, bound.task.id);
  }

  async historyFor(organizationId: string, projectId: string, taskId: string) {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        organizationId,
        projectId,
        resourceType: "task",
        resourceId: taskId,
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      payload: row.payload,
    }));
  }

  async addDependency(
    session: RequestSession,
    projectId: string,
    taskId: string,
    idempotencyKey: string | undefined,
    input: { predecessorTaskId: string; type?: string },
  ) {
    const bound = await this.requireTask(session, "task.update", projectId, taskId);
    this.access.rejectArchivedProject(bound.project);
    assertFinishToStartType(input.type);
    if (!UUID_RE.test(input.predecessorTaskId)) {
      throw new DenyByDefaultError("Client predecessorTaskId is not authoritative");
    }
    const predecessor = await this.prisma.task.findUnique({ where: { id: input.predecessorTaskId } });
    if (
      !predecessor ||
      predecessor.projectId !== bound.project.id ||
      predecessor.organizationId !== bound.organizationId
    ) {
      throw new DenyByDefaultError("Task dependency endpoint is not bound to the authorized Project");
    }
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      successorTaskId: bound.task.id,
      predecessorTaskId: predecessor.id,
      type: "FINISH_TO_START",
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const existing = await this.prisma.taskDependency.findMany({
      where: { projectId: bound.project.id, organizationId: bound.organizationId },
      select: { predecessorTaskId: true, successorTaskId: true },
    });
    if (
      existing.some(
        (edge) => edge.predecessorTaskId === predecessor.id && edge.successorTaskId === bound.task.id,
      )
    ) {
      throw new PlanningStateError("Task dependency already exists");
    }
    assertAcyclicDependency(existing, predecessor.id, bound.task.id);
    if (
      (bound.task.status === "IN_PROGRESS" || bound.task.status === "BLOCKED") &&
      predecessor.status !== "DONE"
    ) {
      throw new PlanningStateError("Cannot add an unfinished prerequisite to a Task that has already started");
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const dependency = await tx.taskDependency.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          predecessorTaskId: predecessor.id,
          successorTaskId: bound.task.id,
          type: "FINISH_TO_START",
          createdByUserId: session.userId,
        },
      });
      await this.audit.insert(
        {
          organizationId: dependency.organizationId,
          projectId: dependency.projectId,
          actorUserId: session.userId,
          eventType: "TASK_DEPENDENCY_CREATED",
          resourceType: "task_dependency",
          resourceId: dependency.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            predecessorTaskId: dependency.predecessorTaskId,
            successorTaskId: dependency.successorTaskId,
            type: dependency.type,
          }),
        },
        tx,
      );
      const body = this.toDependencyDto(dependency);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async listDependencies(session: RequestSession, projectId: string, taskId: string) {
    const bound = await this.requireTask(session, "project.read", projectId, taskId);
    const rows = await this.prisma.taskDependency.findMany({
      where: {
        organizationId: bound.organizationId,
        projectId: bound.project.id,
        OR: [{ successorTaskId: bound.task.id }, { predecessorTaskId: bound.task.id }],
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toDependencyDto(row));
  }

  private async requireTask(
    session: RequestSession,
    permission: PermissionCode,
    projectId: string,
    taskId: string,
  ) {
    const bound = await this.access.requireProject(session, permission, projectId);
    if (!UUID_RE.test(taskId)) {
      throw new DenyByDefaultError("Client taskId is not authoritative");
    }
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== bound.project.id || task.organizationId !== bound.organizationId) {
      throw new DenyByDefaultError("Task is not bound to the authorized Project");
    }
    return { ...bound, task };
  }

  private async resolveDeliveryRefs(
    organizationId: string,
    projectId: string,
    input: { phaseId?: string | null; deliverableId?: string | null; workPackageId?: string | null },
  ) {
    const load = async (
      table: "phase" | "deliverable" | "workPackage",
      id: string | null | undefined,
    ) => {
      if (id == null || id === "") {
        return null;
      }
      if (!UUID_RE.test(id)) {
        throw new DenyByDefaultError(`Client ${table}Id is not authoritative`);
      }
      if (table === "phase") {
        const row = await this.prisma.phase.findUnique({ where: { id } });
        return row ? { organizationId: row.organizationId, projectId: row.projectId, phaseId: row.id } : null;
      }
      if (table === "deliverable") {
        const row = await this.prisma.deliverable.findUnique({ where: { id } });
        return row
          ? {
              organizationId: row.organizationId,
              projectId: row.projectId,
              phaseId: row.phaseId,
              deliverableId: row.id,
            }
          : null;
      }
      const row = await this.prisma.workPackage.findUnique({ where: { id } });
      return row
        ? {
            organizationId: row.organizationId,
            projectId: row.projectId,
            phaseId: row.phaseId,
            deliverableId: row.deliverableId,
          }
        : null;
    };
    const workPackage = await load("workPackage", input.workPackageId);
    const deliverable = await load("deliverable", input.deliverableId);
    const phase = await load("phase", input.phaseId);
    return resolveTaskDeliveryRefs(
      { organizationId, projectId, phaseId: input.phaseId, deliverableId: input.deliverableId, workPackageId: input.workPackageId },
      { phase, deliverable, workPackage },
    );
  }

  private async resolveOptionalIssue(
    organizationId: string,
    projectId: string,
    issueId: string | null | undefined,
  ): Promise<string | null> {
    if (issueId == null || issueId === "") {
      return null;
    }
    if (!UUID_RE.test(issueId)) {
      throw new DenyByDefaultError("Client issueId is not authoritative");
    }
    const issue = await this.prisma.issue.findUnique({ where: { id: issueId } });
    if (!issue || issue.organizationId !== organizationId || issue.projectId !== projectId) {
      throw new DenyByDefaultError("Task source Issue is not bound to the authorized Project");
    }
    return issue.id;
  }

  private async resolveOptionalMilestone(
    organizationId: string,
    projectId: string,
    milestoneId: string | null | undefined,
  ): Promise<string | null> {
    if (milestoneId == null || milestoneId === "") {
      return null;
    }
    if (!UUID_RE.test(milestoneId)) {
      throw new DenyByDefaultError("Client milestoneId is not authoritative");
    }
    const milestone = await this.prisma.milestone.findUnique({ where: { id: milestoneId } });
    if (!milestone || milestone.organizationId !== organizationId || milestone.projectId !== projectId) {
      throw new DenyByDefaultError("Task Milestone is not bound to the authorized Project");
    }
    return milestone.id;
  }

  private requireExpectedVersion(current: number, expected: number | undefined) {
    if (expected == null) {
      throw new PlanningStateError("expectedVersion is required");
    }
    this.foundation.cas({ version: current }, expected);
  }

  private async resolveOptionalDiscipline(
    organizationId: string,
    value: string | null | undefined,
  ): Promise<string | null> {
    if (value == null || value === "") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (UUID_RE.test(trimmed)) {
      const row = await this.prisma.discipline.findUnique({ where: { id: trimmed } });
      if (!row || row.organizationId !== organizationId || !row.active) {
        throw new PlanningStateError("Task responsible discipline is not bound to the authorized Organization");
      }
      return row.id;
    }
    const row = await this.prisma.discipline.findFirst({
      where: { organizationId, code: trimmed, active: true },
    });
    if (!row) {
      throw new PlanningStateError("Task responsible discipline is not bound to the authorized Organization");
    }
    return row.id;
  }

  private async assertActiveProjectAssignee(
    organizationId: string,
    projectId: string,
    assigneeUserId: string,
  ) {
    if (!UUID_RE.test(assigneeUserId)) {
      throw new DenyByDefaultError("Client assigneeUserId is not authoritative");
    }
    const membership = await this.prisma.projectMembership.findFirst({
      where: {
        projectId,
        status: "ACTIVE",
        organizationMembership: {
          userId: assigneeUserId,
          organizationId,
          status: "ACTIVE",
        },
      },
    });
    if (!membership) {
      throw new PlanningStateError("Task assignee must have ACTIVE ProjectMembership");
    }
  }

  private async assertPrerequisitesDone(taskId: string, organizationId: string, projectId: string) {
    const edges = await this.prisma.taskDependency.findMany({
      where: { successorTaskId: taskId, organizationId, projectId },
      include: { predecessor: { select: { status: true } } },
    });
    if (prerequisitesBlockStart(edges.map((edge) => edge.predecessor))) {
      throw new PlanningStateError("Task cannot move to IN_PROGRESS while a finish-to-start prerequisite is not DONE");
    }
  }

  private parseOptionalPriority(value: string | null | undefined): TaskPriority | null {
    if (value == null || value === "") {
      return null;
    }
    if (!isTaskPriority(value)) {
      throw new PlanningStateError("Unknown Task priority");
    }
    return value;
  }

  private parseDate(value: string | null | undefined, label: string): Date | null {
    if (value == null || value === "") {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new PlanningStateError(`Invalid ${label}`);
    }
    return parsed;
  }

  toDto(row: {
    id: string;
    organizationId: string;
    projectId: string;
    issueId: string | null;
    milestoneId: string | null;
    phaseId: string | null;
    deliverableId: string | null;
    workPackageId: string | null;
    title: string;
    description: string;
    status: string;
    priority: string | null;
    responsibleDisciplineId: string | null;
    assigneeUserId: string | null;
    dueDate: Date | null;
    plannedStartAt: Date | null;
    estimatedMinutes: number | null;
    progressPercent: number | null;
    startedAt: Date | null;
    completedAt: Date | null;
    blockedReason: string | null;
    createdByUserId: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      issueId: row.issueId,
      milestoneId: row.milestoneId,
      phaseId: row.phaseId,
      deliverableId: row.deliverableId,
      workPackageId: row.workPackageId,
      title: row.title,
      description: row.description,
      status: row.status,
      late: isTaskLate({ dueDate: row.dueDate, status: row.status as TaskStatus }),
      priority: row.priority,
      responsibleDisciplineId: row.responsibleDisciplineId,
      assigneeUserId: row.assigneeUserId,
      dueDate: row.dueDate,
      plannedStartAt: row.plannedStartAt,
      estimatedMinutes: row.estimatedMinutes,
      progressPercent: row.progressPercent,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      blockedReason: row.blockedReason,
      createdByUserId: row.createdByUserId,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  toDependencyDto(row: {
    id: string;
    organizationId: string;
    projectId: string;
    predecessorTaskId: string;
    successorTaskId: string;
    type: string;
    createdByUserId: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      predecessorTaskId: row.predecessorTaskId,
      successorTaskId: row.successorTaskId,
      type: row.type,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
    };
  }
}
