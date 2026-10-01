import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  OperationsStateError,
  assertDeliverableCanBeDelivered,
  assertDeliverableTransition,
  assertOwnershipXor,
  assertProgressPercent,
  assertUniqueAmongNonArchived,
  assertUserOwnerRequiresActiveProjectMembership,
  assertValidDateRange,
  clampDeliverableListLimit,
  decodeDeliverableCursor,
  deliverableDatesTransitStatus,
  deliverableStatusRequiresApprovePermission,
  deliverableStatusRequiresDeliverPermission,
  encodeDeliverableCursor,
  hardDeleteDeliverableAllowed,
  isDeliverableStatus,
  progressPercentTransitsDeliverableStatus,
  redactSecrets,
  resolvePermissions,
  type DeliverableStatus,
  type PermissionCode,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsAccess, UUID_RE } from "./operations.access";

type DeliverableRow = {
  id: string;
  organizationId: string;
  projectId: string;
  phaseId: string;
  disciplineId: string;
  code: string;
  title: string;
  description: string;
  ownerProjectMembershipId: string | null;
  ownerTeamId: string | null;
  plannedStartAt: Date | null;
  dueAt: Date | null;
  status: string;
  progressPercent: number | null;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DeliverableMutationInput = {
  phaseId?: string;
  disciplineId?: string;
  code?: string;
  title?: string;
  description?: string;
  ownerProjectMembershipId?: string | null;
  ownerTeamId?: string | null;
  plannedStartAt?: string | null;
  dueAt?: string | null;
  progressPercent?: number | null;
  expectedVersion?: number;
  organizationId?: string;
  projectId?: string;
  status?: string;
  documentId?: string;
  revisionId?: string;
};

@Injectable()
export class DeliverablesService {
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
      disciplineId?: string;
      sort?: string;
    },
  ) {
    const bound = await this.access.requireProject(session, "project.read", projectId);
    const includeArchived =
      (query.includeArchived === true || query.includeArchived === "true") &&
      resolvePermissions(bound.context).includes("deliverable.update");
    const take = clampDeliverableListLimit(query.limit);
    const where: Prisma.DeliverableWhereInput = {
      projectId: bound.project.id,
      organizationId: bound.organizationId,
    };
    if (!includeArchived) {
      where.archivedAt = null;
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
      ];
    }
    if (query.status?.trim()) {
      const statuses = query.status
        .split(",")
        .map((value) => value.trim())
        .filter((value) => isDeliverableStatus(value));
      if (statuses.length) {
        where.status = { in: statuses };
      }
    }
    if (query.phaseId && UUID_RE.test(query.phaseId)) {
      where.phaseId = query.phaseId;
    }
    if (query.disciplineId && UUID_RE.test(query.disciplineId)) {
      where.disciplineId = query.disciplineId;
    }
    if (query.cursor) {
      const cursor = decodeDeliverableCursor(query.cursor);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [{ code: { gt: cursor.code } }, { code: cursor.code, id: { gt: cursor.id } }],
        },
      ];
    }
    const rows = await this.prisma.deliverable.findMany({
      where,
      orderBy: [{ code: "asc" }, { id: "asc" }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toDto(row)),
      nextCursor: rows.length > take && last ? encodeDeliverableCursor(last.code, last.id) : null,
    };
  }

  async get(session: RequestSession, projectId: string, deliverableId: string) {
    const bound = await this.requireDeliverable(session, "project.read", projectId, deliverableId);
    return this.toDto(bound.deliverable);
  }

  async create(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: DeliverableMutationInput,
  ) {
    const bound = await this.access.requireProject(session, "deliverable.create", projectId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    this.rejectDocumentMutation(input);
    if (input.status) {
      throw new OperationsStateError("Status is assigned by the server on create (PLANNED)");
    }
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      phaseId: input.phaseId ?? null,
      disciplineId: input.disciplineId ?? null,
      code: input.code ?? null,
      title: input.title ?? null,
      description: input.description ?? "",
      ownerProjectMembershipId: input.ownerProjectMembershipId ?? null,
      ownerTeamId: input.ownerTeamId ?? null,
      plannedStartAt: input.plannedStartAt ?? null,
      dueAt: input.dueAt ?? null,
      progressPercent: input.progressPercent ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const code = input.code?.trim() ?? "";
    const title = input.title?.trim() ?? "";
    if (!code || !title) {
      throw new OperationsStateError("Deliverable code and title are required");
    }
    if (!input.phaseId || !input.disciplineId) {
      throw new OperationsStateError("phaseId and disciplineId are required");
    }
    const hasOwner = Boolean(input.ownerProjectMembershipId) || Boolean(input.ownerTeamId);
    if (hasOwner && !resolvePermissions(bound.context).includes("deliverable.assign")) {
      throw new DenyByDefaultError("Missing permission deliverable.assign");
    }
    const plannedStartAt = this.parseDate(input.plannedStartAt, "plannedStartAt");
    const dueAt = this.parseDate(input.dueAt, "dueAt");
    assertValidDateRange(plannedStartAt, dueAt, "Planned");
    assertProgressPercent(input.progressPercent ?? null);
    void deliverableDatesTransitStatus();
    void progressPercentTransitsDeliverableStatus();
    await this.assertPhaseBound(bound.organizationId, bound.project.id, input.phaseId);
    await this.assertDisciplineBound(bound.organizationId, input.disciplineId);
    const owners = await this.resolveOwnership(
      bound.project.id,
      bound.organizationId,
      input.ownerProjectMembershipId,
      input.ownerTeamId,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.deliverable.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId },
        select: { code: true, archivedAt: true },
      });
      assertUniqueAmongNonArchived(
        existing.map((row) => ({ code: row.code, archived: row.archivedAt != null })),
        code,
      );
      let row: DeliverableRow;
      try {
        row = await tx.deliverable.create({
          data: {
            organizationId: bound.organizationId,
            projectId: bound.project.id,
            phaseId: input.phaseId!,
            disciplineId: input.disciplineId!,
            code,
            title,
            description: input.description ?? "",
            ownerProjectMembershipId: owners.ownerProjectMembershipId,
            ownerTeamId: owners.ownerTeamId,
            plannedStartAt,
            dueAt,
            status: "PLANNED",
            progressPercent: input.progressPercent ?? null,
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
          eventType: "DELIVERABLE_CREATED",
          resourceType: "deliverable",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            code: row.code,
            status: row.status,
            phaseId: row.phaseId,
            disciplineId: row.disciplineId,
            ownerProjectMembershipId: row.ownerProjectMembershipId,
            ownerTeamId: row.ownerTeamId,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DeliverableCreated,
        { organizationId: row.organizationId, projectId: row.projectId, deliverableId: row.id },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(row);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(session: RequestSession, projectId: string, deliverableId: string, input: DeliverableMutationInput) {
    const bound = await this.requireDeliverable(session, "deliverable.update", projectId, deliverableId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    this.rejectDocumentMutation(input);
    if (input.status) {
      throw new OperationsStateError(
        "Status has dedicated start/submit-for-review/approve/deliver/cancel endpoints and is not patchable",
      );
    }
    if (input.ownerProjectMembershipId !== undefined || input.ownerTeamId !== undefined) {
      throw new OperationsStateError("Ownership uses assign/unassign endpoints");
    }
    this.requireExpectedVersion(bound.deliverable.version, input.expectedVersion);
    if (bound.deliverable.archivedAt) {
      throw new OperationsStateError("Archived Deliverable cannot be updated");
    }
    const plannedStartAt =
      input.plannedStartAt !== undefined
        ? this.parseDate(input.plannedStartAt, "plannedStartAt")
        : bound.deliverable.plannedStartAt;
    const dueAt = input.dueAt !== undefined ? this.parseDate(input.dueAt, "dueAt") : bound.deliverable.dueAt;
    assertValidDateRange(plannedStartAt, dueAt, "Planned");
    const progressPercent =
      input.progressPercent !== undefined ? input.progressPercent : bound.deliverable.progressPercent;
    assertProgressPercent(progressPercent);
    void deliverableDatesTransitStatus();
    void progressPercentTransitsDeliverableStatus();
    const phaseId = input.phaseId ?? bound.deliverable.phaseId;
    const disciplineId = input.disciplineId ?? bound.deliverable.disciplineId;
    await this.assertPhaseBound(bound.organizationId, bound.project.id, phaseId);
    await this.assertDisciplineBound(bound.organizationId, disciplineId);
    const code = input.code !== undefined ? input.code.trim() : bound.deliverable.code;
    const title = input.title !== undefined ? input.title.trim() : bound.deliverable.title;
    if (!code || !title) {
      throw new OperationsStateError("Deliverable code and title are required");
    }
    const next = await this.prisma.$transaction(async (tx) => {
      if (code.toLowerCase() !== bound.deliverable.code.toLowerCase()) {
        const existing = await tx.deliverable.findMany({
          where: { projectId: bound.project.id, organizationId: bound.organizationId },
          select: { id: true, code: true, archivedAt: true },
        });
        assertUniqueAmongNonArchived(
          existing.map((row) => ({ code: row.code, archived: row.archivedAt != null })),
          code,
          existing.findIndex((row) => row.id === bound.deliverable.id),
        );
      }
      let updated: DeliverableRow;
      try {
        updated = await tx.deliverable.update({
          where: { id: bound.deliverable.id },
          data: {
            phaseId,
            disciplineId,
            code,
            title,
            description: input.description !== undefined ? input.description : bound.deliverable.description,
            plannedStartAt,
            dueAt,
            progressPercent,
            version: bound.deliverable.version + 1,
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
          eventType: "DELIVERABLE_UPDATED",
          resourceType: "deliverable",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            code: updated.code,
            status: updated.status,
            progressPercent: updated.progressPercent,
            plannedStartAt: updated.plannedStartAt,
            dueAt: updated.dueAt,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DeliverableUpdated,
        { organizationId: updated.organizationId, projectId: updated.projectId, deliverableId: updated.id },
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
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: {
      ownerProjectMembershipId?: string | null;
      ownerTeamId?: string | null;
      expectedVersion?: number;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.requireDeliverable(session, "deliverable.assign", projectId, deliverableId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      deliverableId,
      action: "assign",
      ownerProjectMembershipId: input.ownerProjectMembershipId ?? null,
      ownerTeamId: input.ownerTeamId ?? null,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.requireExpectedVersion(bound.deliverable.version, input.expectedVersion);
    if (bound.deliverable.archivedAt) {
      throw new OperationsStateError("Archived Deliverable cannot be assigned");
    }
    const owners = await this.resolveOwnership(
      bound.project.id,
      bound.organizationId,
      input.ownerProjectMembershipId,
      input.ownerTeamId,
    );
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliverable.update({
        where: { id: bound.deliverable.id },
        data: {
          ownerProjectMembershipId: owners.ownerProjectMembershipId,
          ownerTeamId: owners.ownerTeamId,
          version: bound.deliverable.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "DELIVERABLE_ASSIGNED",
          resourceType: "deliverable",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            from: {
              ownerProjectMembershipId: bound.deliverable.ownerProjectMembershipId,
              ownerTeamId: bound.deliverable.ownerTeamId,
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
        OUTBOX_EVENT_TYPES.DeliverableAssigned,
        { organizationId: updated.organizationId, projectId: updated.projectId, deliverableId: updated.id },
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
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.assign(session, projectId, deliverableId, idempotencyKey, {
      ownerProjectMembershipId: null,
      ownerTeamId: null,
      expectedVersion: input.expectedVersion,
    });
  }

  async start(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, deliverableId, idempotencyKey, {
      to: "IN_PROGRESS",
      permission: "deliverable.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async submitForReview(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, deliverableId, idempotencyKey, {
      to: "IN_REVIEW",
      permission: "deliverable.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async approve(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, deliverableId, idempotencyKey, {
      to: "APPROVED",
      permission: "deliverable.approve",
      expectedVersion: input.expectedVersion,
    });
  }

  async deliver(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, deliverableId, idempotencyKey, {
      to: "DELIVERED",
      permission: "deliverable.deliver",
      expectedVersion: input.expectedVersion,
    });
  }

  async cancel(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, deliverableId, idempotencyKey, {
      to: "CANCELLED",
      permission: "deliverable.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async archive(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    const bound = await this.requireDeliverable(session, "deliverable.update", projectId, deliverableId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      deliverableId,
      action: "archive",
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.requireExpectedVersion(bound.deliverable.version, input.expectedVersion);
    if (hardDeleteDeliverableAllowed()) {
      throw new OperationsStateError("Hard-delete of Deliverable is forbidden");
    }
    if (bound.deliverable.archivedAt) {
      const body = this.toDto(bound.deliverable);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, body);
      return body;
    }
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliverable.update({
        where: { id: bound.deliverable.id },
        data: { archivedAt: new Date(), version: bound.deliverable.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "DELIVERABLE_ARCHIVED",
          resourceType: "deliverable",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ code: updated.code, status: updated.status }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DeliverableArchived,
        { organizationId: updated.organizationId, projectId: updated.projectId, deliverableId: updated.id },
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
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { to: DeliverableStatus; permission: PermissionCode; expectedVersion?: number },
  ) {
    const bound = await this.requireDeliverable(session, input.permission, projectId, deliverableId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      deliverableId,
      to: input.to,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (bound.deliverable.archivedAt) {
      throw new OperationsStateError("Archived Deliverable cannot change status");
    }
    if (!isDeliverableStatus(bound.deliverable.status)) {
      throw new OperationsStateError("Deliverable status is invalid");
    }
    assertDeliverableTransition(bound.deliverable.status, input.to);
    if (deliverableStatusRequiresApprovePermission(input.to) && input.permission !== "deliverable.approve") {
      throw new DenyByDefaultError("Missing permission deliverable.approve");
    }
    if (deliverableStatusRequiresDeliverPermission(input.to) && input.permission !== "deliverable.deliver") {
      throw new DenyByDefaultError("Missing permission deliverable.deliver");
    }
    this.requireExpectedVersion(bound.deliverable.version, input.expectedVersion);
    if (input.to === "DELIVERED") {
      const linked = await this.linkedWorkPackages(bound.deliverable.id);
      assertDeliverableCanBeDelivered(linked);
    }
    const specific =
      input.to === "IN_PROGRESS"
        ? { audit: "DELIVERABLE_STARTED", outbox: OUTBOX_EVENT_TYPES.DeliverableStarted }
        : input.to === "IN_REVIEW"
          ? { audit: "DELIVERABLE_SUBMITTED", outbox: OUTBOX_EVENT_TYPES.DeliverableSubmitted }
          : input.to === "APPROVED"
            ? { audit: "DELIVERABLE_APPROVED", outbox: OUTBOX_EVENT_TYPES.DeliverableApproved }
            : input.to === "DELIVERED"
              ? { audit: "DELIVERABLE_DELIVERED", outbox: OUTBOX_EVENT_TYPES.DeliverableDelivered }
              : { audit: "DELIVERABLE_CANCELLED", outbox: OUTBOX_EVENT_TYPES.DeliverableCancelled };
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliverable.update({
        where: { id: bound.deliverable.id },
        data: { status: input.to, version: bound.deliverable.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "DELIVERABLE_STATUS_CHANGED",
          resourceType: "deliverable",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ from: bound.deliverable.status, to: input.to }),
        },
        tx,
      );
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: specific.audit,
          resourceType: "deliverable",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ from: bound.deliverable.status, to: input.to }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        specific.outbox,
        { organizationId: updated.organizationId, projectId: updated.projectId, deliverableId: updated.id },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  private async requireDeliverable(
    session: RequestSession,
    permission: PermissionCode,
    projectId: string,
    deliverableId: string,
  ) {
    const bound = await this.access.requireProject(session, permission, projectId);
    if (!UUID_RE.test(deliverableId)) {
      throw new DenyByDefaultError("Client deliverableId is not authoritative");
    }
    const deliverable = await this.prisma.deliverable.findUnique({ where: { id: deliverableId } });
    if (
      !deliverable ||
      deliverable.projectId !== bound.project.id ||
      deliverable.organizationId !== bound.organizationId
    ) {
      throw new DenyByDefaultError("Deliverable is not bound to the authorized Project");
    }
    return { ...bound, deliverable };
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

  private async assertDisciplineBound(organizationId: string, disciplineId: string) {
    if (!UUID_RE.test(disciplineId)) {
      throw new DenyByDefaultError("Client disciplineId is not authoritative");
    }
    const discipline = await this.prisma.discipline.findUnique({ where: { id: disciplineId } });
    if (!discipline || discipline.organizationId !== organizationId) {
      throw new DenyByDefaultError("Discipline is not bound to the authorized Organization");
    }
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

  private async linkedWorkPackages(deliverableId: string) {
    const rows = await this.prisma.workPackage.findMany({
      where: { deliverableId, archivedAt: null },
      select: { status: true },
    });
    return rows.map((row) => ({
      status: row.status as "PLANNED" | "ACTIVE" | "BLOCKED" | "DONE" | "CANCELLED",
      associated: true,
    }));
  }

  private rejectDocumentMutation(input: DeliverableMutationInput) {
    if (input.documentId || input.revisionId) {
      throw new OperationsStateError("Documents and Revisions cannot be mutated via Deliverable paths");
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

  private rethrowUnique(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new OperationsStateError("Code must be unique among non-archived records in this scope");
    }
    const message = error instanceof Error ? error.message : "";
    if (/deliverables_project_code_active|unique/i.test(message)) {
      throw new OperationsStateError("Code must be unique among non-archived records in this scope");
    }
  }

  toDto(row: DeliverableRow) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      phaseId: row.phaseId,
      disciplineId: row.disciplineId,
      code: row.code,
      title: row.title,
      description: row.description,
      ownerProjectMembershipId: row.ownerProjectMembershipId,
      ownerTeamId: row.ownerTeamId,
      plannedStartAt: row.plannedStartAt,
      dueAt: row.dueAt,
      status: row.status,
      progressPercent: row.progressPercent,
      version: row.version,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
