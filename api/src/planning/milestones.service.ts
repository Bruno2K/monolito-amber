import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  PlanningStateError,
  deriveMilestoneStatus,
  isTaskLate,
  linkAuditPayload,
  redactSecrets,
  resolveMilestoneDeliveryRefs,
  type MilestoneRecordedStatus,
  type PermissionCode,
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
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlanningAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(session: RequestSession, projectId: string) {
    const bound = await this.access.requireProject(session, "project.read", projectId);
    const [rows, tasks] = await Promise.all([
      this.prisma.milestone.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.task.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId, milestoneId: { not: null } },
        select: { milestoneId: true, dueDate: true, status: true },
      }),
    ]);
    return rows.map((row) => this.toDto(row, tasks));
  }

  async get(session: RequestSession, projectId: string, milestoneId: string) {
    const bound = await this.requireMilestone(session, "project.read", projectId, milestoneId);
    const tasks = await this.prisma.task.findMany({
      where: {
        milestoneId: bound.milestone.id,
        projectId: bound.project.id,
        organizationId: bound.organizationId,
      },
      select: { milestoneId: true, dueDate: true, status: true },
    });
    return this.toDto(bound.milestone, tasks);
  }

  async create(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: {
      title: string;
      description?: string;
      targetDate?: string;
      phaseId?: string;
      deliverableId?: string;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.access.requireProject(session, "milestone.create", projectId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      title: input.title,
      description: input.description ?? "",
      targetDate: input.targetDate ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const title = input.title.trim();
    if (!title) {
      throw new PlanningStateError("Milestone title is required");
    }
    const refs = await this.resolveDeliveryRefs(bound.organizationId, bound.project.id, {
      phaseId: input.phaseId,
      deliverableId: input.deliverableId,
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          title,
          description: input.description?.trim() ?? "",
          status: "PLANNED",
          targetDate: this.parseDate(input.targetDate),
          phaseId: refs.phaseId,
          deliverableId: refs.deliverableId,
        },
      });
      await this.audit.insert(
        {
          organizationId: milestone.organizationId,
          projectId: milestone.projectId,
          actorUserId: session.userId,
          eventType: "MILESTONE_CREATED",
          resourceType: "milestone",
          resourceId: milestone.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ targetDate: milestone.targetDate }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.MilestoneCreated,
        {
          organizationId: milestone.organizationId,
          projectId: milestone.projectId,
          milestoneId: milestone.id,
        },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(milestone, []);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(
    session: RequestSession,
    projectId: string,
    milestoneId: string,
    input: {
      title?: string;
      description?: string;
      targetDate?: string | null;
      phaseId?: string | null;
      deliverableId?: string | null;
      status?: string;
      organizationId?: string;
      projectId?: string;
      expectedVersion?: number;
    },
  ) {
    const bound = await this.requireMilestone(session, "milestone.update", projectId, milestoneId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    if (input.status) {
      throw new PlanningStateError("Milestone status is not patchable; achieve or cancel explicitly");
    }
    if (bound.milestone.status === "ACHIEVED" || bound.milestone.status === "CANCELLED") {
      throw new PlanningStateError(`Milestone cannot be updated from ${bound.milestone.status}`);
    }
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.milestone.version }, input.expectedVersion);
    }
    const refs = await this.resolveDeliveryRefs(bound.organizationId, bound.project.id, {
      phaseId: input.phaseId !== undefined ? input.phaseId : bound.milestone.phaseId,
      deliverableId: input.deliverableId !== undefined ? input.deliverableId : bound.milestone.deliverableId,
    });
    const refsChanged =
      refs.phaseId !== bound.milestone.phaseId || refs.deliverableId !== bound.milestone.deliverableId;
    const next = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.milestone.update({
        where: { id: bound.milestone.id },
        data: {
          title: input.title?.trim() || bound.milestone.title,
          description: input.description !== undefined ? input.description : bound.milestone.description,
          targetDate:
            input.targetDate !== undefined ? this.parseDate(input.targetDate) : bound.milestone.targetDate,
          phaseId: refs.phaseId,
          deliverableId: refs.deliverableId,
          version: bound.milestone.version + 1,
        },
      });
      if (input.targetDate !== undefined && String(input.targetDate) !== String(bound.milestone.targetDate)) {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "MILESTONE_DATE_CHANGED",
            resourceType: "milestone",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.milestone.targetDate, to: updated.targetDate }),
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
            eventType: "MILESTONE_DELIVERY_REFS_UPDATED",
            resourceType: "milestone",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets(
              linkAuditPayload({
                milestoneId: updated.id,
                phaseId: updated.phaseId,
                deliverableId: updated.deliverableId,
              }),
            ),
          },
          tx,
        );
      }
      return updated;
    });
    const tasks = await this.prisma.task.findMany({
      where: { milestoneId: next.id, organizationId: next.organizationId, projectId: next.projectId },
      select: { milestoneId: true, dueDate: true, status: true },
    });
    return this.toDto(next, tasks);
  }

  async achieve(
    session: RequestSession,
    projectId: string,
    milestoneId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number } = {},
  ) {
    const bound = await this.requireMilestone(session, "milestone.achieve", projectId, milestoneId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      milestoneId,
      action: "ACHIEVE",
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (bound.milestone.status === "CANCELLED") {
      throw new PlanningStateError("A cancelled Milestone cannot be achieved");
    }
    if (bound.milestone.status === "ACHIEVED") {
      throw new PlanningStateError("Milestone is already achieved");
    }
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.milestone.version }, input.expectedVersion);
    }
    const body = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.milestone.update({
        where: { id: bound.milestone.id },
        data: {
          status: "ACHIEVED",
          achievedByUserId: session.userId,
          achievedAt: now,
          version: bound.milestone.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "MILESTONE_ACHIEVED",
          resourceType: "milestone",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ recordedStatus: "ACHIEVED", explicit: true }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.MilestoneAchieved,
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          milestoneId: updated.id,
        },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated, []);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async cancel(
    session: RequestSession,
    projectId: string,
    milestoneId: string,
    input: { expectedVersion?: number } = {},
  ) {
    const bound = await this.requireMilestone(session, "milestone.update", projectId, milestoneId);
    if (bound.milestone.status === "ACHIEVED") {
      throw new PlanningStateError("An achieved Milestone cannot be cancelled");
    }
    if (bound.milestone.status === "CANCELLED") {
      throw new PlanningStateError("Milestone is already cancelled");
    }
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.milestone.version }, input.expectedVersion);
    }
    const next = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.milestone.update({
        where: { id: bound.milestone.id },
        data: {
          status: "CANCELLED",
          cancelledByUserId: session.userId,
          cancelledAt: now,
          version: bound.milestone.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "MILESTONE_CANCELLED",
          resourceType: "milestone",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ recordedStatus: "CANCELLED" }),
        },
        tx,
      );
      return updated;
    });
    return this.toDto(next, []);
  }

  private async requireMilestone(
    session: RequestSession,
    permission: PermissionCode,
    projectId: string,
    milestoneId: string,
  ) {
    const bound = await this.access.requireProject(session, permission, projectId);
    if (!UUID_RE.test(milestoneId)) {
      throw new DenyByDefaultError("Client milestoneId is not authoritative");
    }
    const milestone = await this.prisma.milestone.findUnique({ where: { id: milestoneId } });
    if (
      !milestone ||
      milestone.projectId !== bound.project.id ||
      milestone.organizationId !== bound.organizationId
    ) {
      throw new DenyByDefaultError("Milestone is not bound to the authorized Project");
    }
    return { ...bound, milestone };
  }

  private async resolveDeliveryRefs(
    organizationId: string,
    projectId: string,
    input: { phaseId?: string | null; deliverableId?: string | null },
  ) {
    const load = async (table: "phase" | "deliverable", id: string | null | undefined) => {
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
      const row = await this.prisma.deliverable.findUnique({ where: { id } });
      return row
        ? {
            organizationId: row.organizationId,
            projectId: row.projectId,
            phaseId: row.phaseId,
            deliverableId: row.id,
          }
        : null;
    };
    const deliverable = await load("deliverable", input.deliverableId);
    const phase = await load("phase", input.phaseId);
    return resolveMilestoneDeliveryRefs(
      { organizationId, projectId, phaseId: input.phaseId, deliverableId: input.deliverableId },
      { phase, deliverable },
    );
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (value == null || value === "") {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new PlanningStateError("Invalid Milestone target date");
    }
    return parsed;
  }

  toDto(
    row: {
      id: string;
      organizationId: string;
      projectId: string;
      title: string;
      description: string;
      status: string;
      targetDate: Date | null;
      phaseId: string | null;
      deliverableId: string | null;
      achievedByUserId: string | null;
      achievedAt: Date | null;
      cancelledByUserId: string | null;
      cancelledAt: Date | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    },
    tasks: readonly { milestoneId: string | null; dueDate: Date | null; status: string }[],
  ) {
    const linked = tasks.filter((task) => task.milestoneId === row.id);
    const linkedTasksLate = linked.some((task) =>
      isTaskLate({ dueDate: task.dueDate, status: task.status as TaskStatus }),
    );
    const recordedStatus = row.status as MilestoneRecordedStatus;
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      title: row.title,
      description: row.description,
      phaseId: row.phaseId,
      deliverableId: row.deliverableId,
      recordedStatus,
      status: deriveMilestoneStatus({
        recordedStatus,
        targetDate: row.targetDate,
        linkedTasksLate,
      }),
      targetDate: row.targetDate,
      achievedByUserId: row.achievedByUserId,
      achievedAt: row.achievedAt,
      cancelledByUserId: row.cancelledByUserId,
      cancelledAt: row.cancelledAt,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
