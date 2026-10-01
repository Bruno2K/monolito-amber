import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  OperationsStateError,
  assertBlockedReason,
  assertBlockedReasonPersistsWhileBlocked,
  assertOwnershipXor,
  assertUniqueAmongNonArchived,
  assertUserOwnerRequiresActiveProjectMembership,
  assertValidDateRange,
  assertWorkPackageTransition,
  clampWorkPackageListLimit,
  decodeWorkPackageCursor,
  encodeWorkPackageCursor,
  hardDeleteWorkPackageAllowed,
  incidentalTasksBlockWorkPackageDone,
  isWorkPackageStatus,
  nextBlockedReason,
  redactSecrets,
  resolvePermissions,
  workPackageCompleteCascadesToDeliverable,
  workPackageCompleteCascadesToMilestone,
  workPackageCompleteCascadesToTask,
  workPackageDatesTransitStatus,
  workPackageStatusRequiresCompletePermission,
  type PermissionCode,
  type WorkPackageStatus,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsAccess, UUID_RE } from "./operations.access";

type WorkPackageRow = {
  id: string;
  organizationId: string;
  projectId: string;
  phaseId: string;
  deliverableId: string | null;
  disciplineId: string | null;
  code: string | null;
  title: string;
  description: string;
  blockedReason: string | null;
  ownerProjectMembershipId: string | null;
  ownerTeamId: string | null;
  plannedStartAt: Date | null;
  dueAt: Date | null;
  status: string;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkPackageMutationInput = {
  phaseId?: string;
  deliverableId?: string | null;
  disciplineId?: string | null;
  code?: string | null;
  title?: string;
  description?: string;
  blockedReason?: string | null;
  ownerProjectMembershipId?: string | null;
  ownerTeamId?: string | null;
  plannedStartAt?: string | null;
  dueAt?: string | null;
  expectedVersion?: number;
  organizationId?: string;
  projectId?: string;
  status?: string;
  documentId?: string;
  revisionId?: string;
  taskId?: string;
  milestoneId?: string;
};

@Injectable()
export class WorkPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OperationsAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    session: RequestSession,
    projectId: string,
    query: {
      cursor?: string;
      limit?: number;
      includeArchived?: boolean | string;
      q?: string;
      status?: string;
      phaseId?: string;
      deliverableId?: string;
      disciplineId?: string;
      ownerProjectMembershipId?: string;
      ownerTeamId?: string;
      unassigned?: boolean | string;
    },
  ) {
    const bound = await this.access.requireProject(session, "project.read", projectId);
    const includeArchived =
      (query.includeArchived === true || query.includeArchived === "true") &&
      resolvePermissions(bound.context).includes("work_package.update");
    const take = clampWorkPackageListLimit(query.limit);
    const where: Prisma.WorkPackageWhereInput = {
      projectId: bound.project.id,
      organizationId: bound.organizationId,
    };
    if (!includeArchived) {
      where.archivedAt = null;
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    }
    if (query.status?.trim()) {
      const statuses = query.status
        .split(",")
        .map((value) => value.trim())
        .filter((value) => isWorkPackageStatus(value));
      if (statuses.length) {
        where.status = { in: statuses };
      }
    }
    if (query.phaseId && UUID_RE.test(query.phaseId)) {
      where.phaseId = query.phaseId;
    }
    if (query.deliverableId && UUID_RE.test(query.deliverableId)) {
      where.deliverableId = query.deliverableId;
    }
    if (query.disciplineId && UUID_RE.test(query.disciplineId)) {
      where.disciplineId = query.disciplineId;
    }
    if (query.ownerProjectMembershipId && UUID_RE.test(query.ownerProjectMembershipId)) {
      where.ownerProjectMembershipId = query.ownerProjectMembershipId;
    }
    if (query.ownerTeamId && UUID_RE.test(query.ownerTeamId)) {
      where.ownerTeamId = query.ownerTeamId;
    }
    if (query.unassigned === true || query.unassigned === "true") {
      where.ownerProjectMembershipId = null;
      where.ownerTeamId = null;
    }
    if (query.cursor) {
      const cursor = decodeWorkPackageCursor(query.cursor);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [{ title: { gt: cursor.title } }, { title: cursor.title, id: { gt: cursor.id } }],
        },
      ];
    }
    const rows = await this.prisma.workPackage.findMany({
      where,
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toDto(row)),
      nextCursor: rows.length > take && last ? encodeWorkPackageCursor(last.title, last.id) : null,
    };
  }

  async get(session: RequestSession, projectId: string, workPackageId: string) {
    const bound = await this.requireWorkPackage(session, "project.read", projectId, workPackageId);
    return this.toDto(bound.workPackage);
  }

  async create(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: WorkPackageMutationInput,
  ) {
    const bound = await this.access.requireProject(session, "work_package.create", projectId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    this.rejectDocumentMutation(input);
    if (input.status) {
      throw new OperationsStateError("Status is assigned by the server on create (PLANNED)");
    }
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      phaseId: input.phaseId ?? null,
      deliverableId: input.deliverableId ?? null,
      disciplineId: input.disciplineId ?? null,
      code: input.code ?? null,
      title: input.title ?? null,
      description: input.description ?? "",
      ownerProjectMembershipId: input.ownerProjectMembershipId ?? null,
      ownerTeamId: input.ownerTeamId ?? null,
      plannedStartAt: input.plannedStartAt ?? null,
      dueAt: input.dueAt ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const title = input.title?.trim() ?? "";
    if (!title) {
      throw new OperationsStateError("WorkPackage title is required");
    }
    if (!input.phaseId) {
      throw new OperationsStateError("phaseId is required");
    }
    const plannedStartAt = this.parseDate(input.plannedStartAt, "plannedStartAt");
    const dueAt = this.parseDate(input.dueAt, "dueAt");
    assertValidDateRange(plannedStartAt, dueAt, "Planned");
    void workPackageDatesTransitStatus();
    await this.assertPhaseBound(bound.organizationId, bound.project.id, input.phaseId);
    const disciplineId = await this.assertOptionalDisciplineBound(bound.organizationId, input.disciplineId);
    const deliverableId = await this.assertOptionalDeliverableBound(
      bound.organizationId,
      bound.project.id,
      input.phaseId,
      input.deliverableId,
    );
    const owners = await this.resolveOwnership(
      bound.project.id,
      bound.organizationId,
      input.ownerProjectMembershipId,
      input.ownerTeamId,
    );
    const code = this.normalizeOptionalCode(input.code);
    const created = await this.prisma.$transaction(async (tx) => {
      if (code) {
        const existing = await tx.workPackage.findMany({
          where: { projectId: bound.project.id, organizationId: bound.organizationId },
          select: { code: true, archivedAt: true },
        });
        assertUniqueAmongNonArchived(
          existing.filter((row) => row.code).map((row) => ({ code: row.code!, archived: row.archivedAt != null })),
          code,
        );
      }
      let row: WorkPackageRow;
      try {
        row = await tx.workPackage.create({
          data: {
            organizationId: bound.organizationId,
            projectId: bound.project.id,
            phaseId: input.phaseId!,
            deliverableId,
            disciplineId,
            code,
            title,
            description: input.description ?? "",
            ownerProjectMembershipId: owners.ownerProjectMembershipId,
            ownerTeamId: owners.ownerTeamId,
            plannedStartAt,
            dueAt,
            status: "PLANNED",
            blockedReason: null,
          },
        });
      } catch (error) {
        this.rethrowUnique(error);
        throw error;
      }
      await this.audit.insert(
        {
          organizationId: row.organizationId,
          projectId: row.projectId,
          actorUserId: session.userId,
          eventType: "WORK_PACKAGE_CREATED",
          resourceType: "work_package",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            code: row.code,
            title: row.title,
            status: row.status,
            phaseId: row.phaseId,
            deliverableId: row.deliverableId,
            disciplineId: row.disciplineId,
            ownerProjectMembershipId: row.ownerProjectMembershipId,
            ownerTeamId: row.ownerTeamId,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.WorkPackageCreated,
        { organizationId: row.organizationId, projectId: row.projectId, workPackageId: row.id },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(row);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(session: RequestSession, projectId: string, workPackageId: string, input: WorkPackageMutationInput) {
    const bound = await this.requireWorkPackage(session, "work_package.update", projectId, workPackageId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    this.rejectDocumentMutation(input);
    if (input.status) {
      throw new OperationsStateError(
        "Status has dedicated activate/block/unblock/complete/cancel endpoints and is not patchable",
      );
    }
    if (input.ownerProjectMembershipId !== undefined || input.ownerTeamId !== undefined) {
      throw new OperationsStateError("Ownership uses assign/unassign endpoints");
    }
    if (input.deliverableId !== undefined) {
      throw new OperationsStateError("Deliverable association uses associate/disassociate endpoints");
    }
    this.requireExpectedVersion(bound.workPackage.version, input.expectedVersion);
    if (bound.workPackage.archivedAt) {
      throw new OperationsStateError("Archived WorkPackage cannot be updated");
    }
    if (!isWorkPackageStatus(bound.workPackage.status)) {
      throw new OperationsStateError("WorkPackage status is invalid");
    }
    const nextReason =
      input.blockedReason !== undefined ? input.blockedReason : bound.workPackage.blockedReason;
    assertBlockedReasonPersistsWhileBlocked(bound.workPackage.status, nextReason);
    const plannedStartAt =
      input.plannedStartAt !== undefined
        ? this.parseDate(input.plannedStartAt, "plannedStartAt")
        : bound.workPackage.plannedStartAt;
    const dueAt = input.dueAt !== undefined ? this.parseDate(input.dueAt, "dueAt") : bound.workPackage.dueAt;
    assertValidDateRange(plannedStartAt, dueAt, "Planned");
    void workPackageDatesTransitStatus();
    const phaseId = input.phaseId ?? bound.workPackage.phaseId;
    await this.assertPhaseBound(bound.organizationId, bound.project.id, phaseId);
    if (bound.workPackage.deliverableId) {
      await this.assertOptionalDeliverableBound(
        bound.organizationId,
        bound.project.id,
        phaseId,
        bound.workPackage.deliverableId,
      );
    }
    const disciplineId =
      input.disciplineId !== undefined
        ? await this.assertOptionalDisciplineBound(bound.organizationId, input.disciplineId)
        : bound.workPackage.disciplineId;
    const title = input.title !== undefined ? input.title.trim() : bound.workPackage.title;
    if (!title) {
      throw new OperationsStateError("WorkPackage title is required");
    }
    const code = input.code !== undefined ? this.normalizeOptionalCode(input.code) : bound.workPackage.code;
    const next = await this.prisma.$transaction(async (tx) => {
      if (code && code.toLowerCase() !== (bound.workPackage.code ?? "").toLowerCase()) {
        const existing = await tx.workPackage.findMany({
          where: { projectId: bound.project.id, organizationId: bound.organizationId },
          select: { id: true, code: true, archivedAt: true },
        });
        assertUniqueAmongNonArchived(
          existing.filter((row) => row.code).map((row) => ({ code: row.code!, archived: row.archivedAt != null })),
          code,
          existing.findIndex((row) => row.id === bound.workPackage.id),
        );
      }
      let updated: WorkPackageRow;
      try {
        updated = await tx.workPackage.update({
          where: { id: bound.workPackage.id },
          data: {
            phaseId,
            disciplineId,
            code,
            title,
            description: input.description !== undefined ? input.description : bound.workPackage.description,
            blockedReason: nextReason,
            plannedStartAt,
            dueAt,
            version: bound.workPackage.version + 1,
          },
        });
      } catch (error) {
        this.rethrowUnique(error);
        throw error;
      }
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "WORK_PACKAGE_UPDATED",
          resourceType: "work_package",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            code: updated.code,
            title: updated.title,
            status: updated.status,
            blockedReason: updated.blockedReason,
            plannedStartAt: updated.plannedStartAt,
            dueAt: updated.dueAt,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.WorkPackageUpdated,
        { organizationId: updated.organizationId, projectId: updated.projectId, workPackageId: updated.id },
        currentCorrelationId(),
        tx,
      );
      return this.toDto(updated);
    });
    return next;
  }

  async assign(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: {
      ownerProjectMembershipId?: string | null;
      ownerTeamId?: string | null;
      expectedVersion?: number;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.requireWorkPackage(session, "work_package.update", projectId, workPackageId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      workPackageId,
      action: "assign",
      ownerProjectMembershipId: input.ownerProjectMembershipId ?? null,
      ownerTeamId: input.ownerTeamId ?? null,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.requireExpectedVersion(bound.workPackage.version, input.expectedVersion);
    if (bound.workPackage.archivedAt) {
      throw new OperationsStateError("Archived WorkPackage cannot be assigned");
    }
    const owners = await this.resolveOwnership(
      bound.project.id,
      bound.organizationId,
      input.ownerProjectMembershipId,
      input.ownerTeamId,
    );
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workPackage.update({
        where: { id: bound.workPackage.id },
        data: {
          ownerProjectMembershipId: owners.ownerProjectMembershipId,
          ownerTeamId: owners.ownerTeamId,
          version: bound.workPackage.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "WORK_PACKAGE_ASSIGNED",
          resourceType: "work_package",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            from: {
              ownerProjectMembershipId: bound.workPackage.ownerProjectMembershipId,
              ownerTeamId: bound.workPackage.ownerTeamId,
            },
            to: {
              ownerProjectMembershipId: updated.ownerProjectMembershipId,
              ownerTeamId: updated.ownerTeamId,
            },
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.WorkPackageAssigned,
        { organizationId: updated.organizationId, projectId: updated.projectId, workPackageId: updated.id },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async unassign(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.assign(session, projectId, workPackageId, idempotencyKey, {
      ownerProjectMembershipId: null,
      ownerTeamId: null,
      expectedVersion: input.expectedVersion,
    });
  }

  async activate(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, workPackageId, idempotencyKey, {
      to: "ACTIVE",
      permission: "work_package.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async block(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number; blockedReason?: string | null },
  ) {
    return this.transition(session, projectId, workPackageId, idempotencyKey, {
      to: "BLOCKED",
      permission: "work_package.update",
      expectedVersion: input.expectedVersion,
      blockedReason: input.blockedReason,
    });
  }

  async unblock(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, workPackageId, idempotencyKey, {
      to: "ACTIVE",
      permission: "work_package.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async complete(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    void incidentalTasksBlockWorkPackageDone();
    void workPackageCompleteCascadesToTask();
    void workPackageCompleteCascadesToDeliverable();
    void workPackageCompleteCascadesToMilestone();
    return this.transition(session, projectId, workPackageId, idempotencyKey, {
      to: "DONE",
      permission: "work_package.complete",
      expectedVersion: input.expectedVersion,
    });
  }

  async cancel(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, workPackageId, idempotencyKey, {
      to: "CANCELLED",
      permission: "work_package.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async archive(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    const bound = await this.requireWorkPackage(session, "work_package.update", projectId, workPackageId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      workPackageId,
      action: "archive",
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.requireExpectedVersion(bound.workPackage.version, input.expectedVersion);
    if (hardDeleteWorkPackageAllowed()) {
      throw new OperationsStateError("Hard-delete of WorkPackage is forbidden");
    }
    if (bound.workPackage.archivedAt) {
      const body = this.toDto(bound.workPackage);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, body);
      return body;
    }
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workPackage.update({
        where: { id: bound.workPackage.id },
        data: { archivedAt: new Date(), version: bound.workPackage.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "WORK_PACKAGE_ARCHIVED",
          resourceType: "work_package",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ code: updated.code, title: updated.title, status: updated.status }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.WorkPackageArchived,
        { organizationId: updated.organizationId, projectId: updated.projectId, workPackageId: updated.id },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async associate(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { deliverableId?: string | null; expectedVersion?: number; organizationId?: string; projectId?: string },
  ) {
    const bound = await this.requireWorkPackage(session, "work_package.update", projectId, workPackageId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      workPackageId,
      action: "associate",
      deliverableId: input.deliverableId ?? null,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.requireExpectedVersion(bound.workPackage.version, input.expectedVersion);
    if (bound.workPackage.archivedAt) {
      throw new OperationsStateError("Archived WorkPackage cannot be associated");
    }
    if (!input.deliverableId) {
      throw new OperationsStateError("deliverableId is required to associate");
    }
    const deliverableId = await this.assertOptionalDeliverableBound(
      bound.organizationId,
      bound.project.id,
      bound.workPackage.phaseId,
      input.deliverableId,
    );
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workPackage.update({
        where: { id: bound.workPackage.id },
        data: { deliverableId, version: bound.workPackage.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "WORK_PACKAGE_ASSOCIATED",
          resourceType: "work_package",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            from: bound.workPackage.deliverableId,
            to: updated.deliverableId,
            phaseId: updated.phaseId,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.WorkPackageAssociated,
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          workPackageId: updated.id,
          deliverableId: updated.deliverableId,
        },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async disassociate(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    const bound = await this.requireWorkPackage(session, "deliverable.update", projectId, workPackageId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      workPackageId,
      action: "disassociate",
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.requireExpectedVersion(bound.workPackage.version, input.expectedVersion);
    if (bound.workPackage.archivedAt) {
      throw new OperationsStateError("Archived WorkPackage cannot be disassociated");
    }
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workPackage.update({
        where: { id: bound.workPackage.id },
        data: { deliverableId: null, version: bound.workPackage.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "WORK_PACKAGE_DISASSOCIATED",
          resourceType: "work_package",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            from: bound.workPackage.deliverableId,
            to: null,
            status: updated.status,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.WorkPackageDisassociated,
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          workPackageId: updated.id,
          deliverableId: bound.workPackage.deliverableId,
        },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  private async transition(
    session: RequestSession,
    projectId: string,
    workPackageId: string,
    idempotencyKey: string | undefined,
    input: {
      to: WorkPackageStatus;
      permission: PermissionCode;
      expectedVersion?: number;
      blockedReason?: string | null;
    },
  ) {
    const bound = await this.requireWorkPackage(session, input.permission, projectId, workPackageId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      workPackageId,
      to: input.to,
      blockedReason: input.blockedReason ?? null,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (bound.workPackage.archivedAt) {
      throw new OperationsStateError("Archived WorkPackage cannot change status");
    }
    if (!isWorkPackageStatus(bound.workPackage.status)) {
      throw new OperationsStateError("WorkPackage status is invalid");
    }
    assertWorkPackageTransition(bound.workPackage.status, input.to);
    if (workPackageStatusRequiresCompletePermission(input.to) && input.permission !== "work_package.complete") {
      throw new DenyByDefaultError("Missing permission work_package.complete");
    }
    this.requireExpectedVersion(bound.workPackage.version, input.expectedVersion);
    const reasonForBlocked = input.blockedReason ?? bound.workPackage.blockedReason;
    assertBlockedReason(input.to, reasonForBlocked);
    const blockedReason = nextBlockedReason(bound.workPackage.status, input.to, reasonForBlocked);
    const specific =
      input.to === "ACTIVE" && bound.workPackage.status === "BLOCKED"
        ? { audit: "WORK_PACKAGE_UNBLOCKED", outbox: OUTBOX_EVENT_TYPES.WorkPackageUnblocked }
        : input.to === "ACTIVE"
          ? { audit: "WORK_PACKAGE_ACTIVATED", outbox: OUTBOX_EVENT_TYPES.WorkPackageActivated }
          : input.to === "BLOCKED"
            ? { audit: "WORK_PACKAGE_BLOCKED", outbox: OUTBOX_EVENT_TYPES.WorkPackageBlocked }
            : input.to === "DONE"
              ? { audit: "WORK_PACKAGE_COMPLETED", outbox: OUTBOX_EVENT_TYPES.WorkPackageCompleted }
              : { audit: "WORK_PACKAGE_CANCELLED", outbox: OUTBOX_EVENT_TYPES.WorkPackageCancelled };
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workPackage.update({
        where: { id: bound.workPackage.id },
        data: { status: input.to, blockedReason, version: bound.workPackage.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "WORK_PACKAGE_STATUS_CHANGED",
          resourceType: "work_package",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            from: bound.workPackage.status,
            to: input.to,
            blockedReason: updated.blockedReason,
          }),
        },
        tx,
      );
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: specific.audit,
          resourceType: "work_package",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            from: bound.workPackage.status,
            to: input.to,
            blockedReason: updated.blockedReason,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        specific.outbox,
        { organizationId: updated.organizationId, projectId: updated.projectId, workPackageId: updated.id },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  private async requireWorkPackage(
    session: RequestSession,
    permission: PermissionCode,
    projectId: string,
    workPackageId: string,
  ) {
    const bound = await this.access.requireProject(session, permission, projectId);
    if (!UUID_RE.test(workPackageId)) {
      throw new DenyByDefaultError("Client workPackageId is not authoritative");
    }
    const workPackage = await this.prisma.workPackage.findUnique({ where: { id: workPackageId } });
    if (
      !workPackage ||
      workPackage.projectId !== bound.project.id ||
      workPackage.organizationId !== bound.organizationId
    ) {
      throw new DenyByDefaultError("WorkPackage is not bound to the authorized Project");
    }
    return { ...bound, workPackage };
  }

  private async assertPhaseBound(organizationId: string, projectId: string, phaseId: string) {
    if (!UUID_RE.test(phaseId)) {
      throw new DenyByDefaultError("Client phaseId is not authoritative");
    }
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase || phase.projectId !== projectId || phase.organizationId !== organizationId || phase.archivedAt) {
      throw new DenyByDefaultError("Phase is not bound to the authorized Project");
    }
  }

  private async assertOptionalDisciplineBound(organizationId: string, disciplineId?: string | null) {
    if (disciplineId == null || disciplineId === "") {
      return null;
    }
    if (!UUID_RE.test(disciplineId)) {
      throw new DenyByDefaultError("Client disciplineId is not authoritative");
    }
    const discipline = await this.prisma.discipline.findUnique({ where: { id: disciplineId } });
    if (!discipline || discipline.organizationId !== organizationId) {
      throw new DenyByDefaultError("Discipline is not bound to the authorized Organization");
    }
    return discipline.id;
  }

  private async assertOptionalDeliverableBound(
    organizationId: string,
    projectId: string,
    phaseId: string,
    deliverableId?: string | null,
  ) {
    if (deliverableId == null || deliverableId === "") {
      return null;
    }
    if (!UUID_RE.test(deliverableId)) {
      throw new DenyByDefaultError("Client deliverableId is not authoritative");
    }
    const deliverable = await this.prisma.deliverable.findUnique({ where: { id: deliverableId } });
    if (
      !deliverable ||
      deliverable.projectId !== projectId ||
      deliverable.organizationId !== organizationId ||
      deliverable.archivedAt
    ) {
      throw new DenyByDefaultError("Deliverable is not bound to the authorized Project");
    }
    if (deliverable.phaseId !== phaseId) {
      throw new DenyByDefaultError("Deliverable is not bound to the same Phase");
    }
    return deliverable.id;
  }

  private async resolveOwnership(
    projectId: string,
    organizationId: string,
    ownerProjectMembershipId?: string | null,
    ownerTeamId?: string | null,
  ) {
    const userId = ownerProjectMembershipId || null;
    const teamId = ownerTeamId || null;
    assertOwnershipXor({ ownerProjectMembershipId: userId, ownerTeamId: teamId });
    if (userId) {
      if (!UUID_RE.test(userId)) {
        throw new DenyByDefaultError("Client ownerProjectMembershipId is not authoritative");
      }
      const membership = await this.prisma.projectMembership.findUnique({
        where: { id: userId },
        include: { project: true, organizationMembership: true },
      });
      if (!membership || membership.projectId !== projectId || membership.project.organizationId !== organizationId) {
        throw new DenyByDefaultError("User owner is not an ACTIVE ProjectMembership of this Project");
      }
      assertUserOwnerRequiresActiveProjectMembership(userId, membership.status as "ACTIVE" | "SUSPENDED" | "REMOVED");
      if (membership.organizationMembership.status !== "ACTIVE") {
        throw new OperationsStateError("User owner requires an ACTIVE ProjectMembership");
      }
    }
    if (teamId) {
      if (!UUID_RE.test(teamId)) {
        throw new DenyByDefaultError("Client ownerTeamId is not authoritative");
      }
      const team = await this.prisma.team.findUnique({ where: { id: teamId } });
      if (!team || team.organizationId !== organizationId || team.archivedAt) {
        throw new DenyByDefaultError("Team owner is not in the authorized Organization");
      }
    }
    return { ownerProjectMembershipId: userId, ownerTeamId: teamId };
  }

  private rejectDocumentMutation(input: WorkPackageMutationInput) {
    if (input.documentId || input.revisionId || input.taskId || input.milestoneId) {
      throw new OperationsStateError("Documents, Revisions, Tasks, and Milestones cannot be mutated via WorkPackage paths");
    }
  }

  private requireExpectedVersion(current: number, expected: number | undefined) {
    if (expected == null) {
      throw new OperationsStateError("expectedVersion is required");
    }
    this.foundation.cas({ version: current }, expected);
  }

  private parseDate(value: string | null | undefined, label: string): Date | null {
    if (value == null || value === "") {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new OperationsStateError(`Invalid ${label}`);
    }
    return parsed;
  }

  private normalizeOptionalCode(code: string | null | undefined): string | null {
    const trimmed = code?.trim() ?? "";
    return trimmed ? trimmed : null;
  }

  private rethrowUnique(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new OperationsStateError("Code must be unique among non-archived records in this scope");
    }
    const message = error instanceof Error ? error.message : "";
    if (/work_packages_project_code_active|unique/i.test(message)) {
      throw new OperationsStateError("Code must be unique among non-archived records in this scope");
    }
  }

  toDto(row: WorkPackageRow) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      phaseId: row.phaseId,
      deliverableId: row.deliverableId,
      disciplineId: row.disciplineId,
      code: row.code,
      title: row.title,
      description: row.description,
      blockedReason: row.blockedReason,
      ownerProjectMembershipId: row.ownerProjectMembershipId,
      ownerTeamId: row.ownerTeamId,
      plannedStartAt: row.plannedStartAt,
      dueAt: row.dueAt,
      status: row.status,
      version: row.version,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
