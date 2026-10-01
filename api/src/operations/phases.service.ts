import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  OperationsStateError,
  assertPhaseTransition,
  assertUniquePhaseSequence,
  assertValidDateRange,
  clampPhaseListLimit,
  decodePhaseCursor,
  encodePhaseCursor,
  hardDeletePhaseAllowed,
  isPhaseStatus,
  phaseDatesTransitStatus,
  phaseStatusRequiresCompletePermission,
  redactSecrets,
  resolvePermissions,
  type PermissionCode,
  type PhaseStatus,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsAccess, UUID_RE } from "./operations.access";

type PhaseRow = {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  description: string;
  sequence: number;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  status: string;
  createdBy: string;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PhasesService {
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
    query: { cursor?: string; limit?: number; includeArchived?: boolean | string },
  ) {
    const bound = await this.access.requireProject(session, "project.read", projectId);
    const includeArchived =
      (query.includeArchived === true || query.includeArchived === "true") &&
      resolvePermissions(bound.context).includes("phase.update");
    const take = clampPhaseListLimit(query.limit);
    const where: Prisma.PhaseWhereInput = {
      projectId: bound.project.id,
      organizationId: bound.organizationId,
    };
    if (!includeArchived) {
      where.archivedAt = null;
    }
    if (query.cursor) {
      const cursor = decodePhaseCursor(query.cursor);
      where.OR = [
        { sequence: { gt: cursor.sequence } },
        { sequence: cursor.sequence, id: { gt: cursor.id } },
      ];
    }
    const rows = await this.prisma.phase.findMany({
      where,
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toDto(row)),
      nextCursor: rows.length > take && last ? encodePhaseCursor(last.sequence, last.id) : null,
    };
  }

  async get(session: RequestSession, projectId: string, phaseId: string) {
    const bound = await this.requirePhase(session, "project.read", projectId, phaseId);
    return this.toDto(bound.phase);
  }

  async create(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: {
      name: string;
      description?: string;
      sequence?: number;
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.access.requireProject(session, "phase.create", projectId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      name: input.name,
      description: input.description ?? "",
      sequence: input.sequence ?? null,
      plannedStartAt: input.plannedStartAt ?? null,
      plannedEndAt: input.plannedEndAt ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const name = input.name.trim();
    if (!name) {
      throw new OperationsStateError("Phase name is required");
    }
    const plannedStartAt = this.parseDate(input.plannedStartAt, "plannedStartAt");
    const plannedEndAt = this.parseDate(input.plannedEndAt, "plannedEndAt");
    assertValidDateRange(plannedStartAt, plannedEndAt, "Planned");
    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.phase.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId },
        select: { sequence: true, archivedAt: true },
      });
      const sequence =
        input.sequence ??
        existing
          .filter((row) => row.archivedAt == null)
          .reduce((max, row) => Math.max(max, row.sequence), -1) + 1;
      assertUniquePhaseSequence(
        existing.map((row) => ({ sequence: row.sequence, archived: row.archivedAt != null })),
        sequence,
      );
      let phase: PhaseRow;
      try {
        phase = await tx.phase.create({
          data: {
            organizationId: bound.organizationId,
            projectId: bound.project.id,
            name,
            description: input.description ?? "",
            sequence,
            plannedStartAt,
            plannedEndAt,
            status: "PLANNED",
            createdBy: session.userId,
          },
        });
      } catch (error) {
        this.rethrowUnique(error);
        throw error;
      }
      await this.audit.insert(
        {
          organizationId: phase.organizationId,
          projectId: phase.projectId,
          actorUserId: session.userId,
          eventType: "PHASE_CREATED",
          resourceType: "phase",
          resourceId: phase.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ name: phase.name, sequence: phase.sequence, status: phase.status }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.PhaseCreated,
        {
          organizationId: phase.organizationId,
          projectId: phase.projectId,
          phaseId: phase.id,
        },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(phase);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(
    session: RequestSession,
    projectId: string,
    phaseId: string,
    input: {
      name?: string;
      description?: string;
      sequence?: number;
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
      expectedVersion?: number;
      organizationId?: string;
      projectId?: string;
      status?: string;
    },
  ) {
    const bound = await this.requirePhase(session, "phase.update", projectId, phaseId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    if (input.status) {
      throw new OperationsStateError("Status has dedicated activate/complete/cancel endpoints and is not patchable");
    }
    this.requireExpectedVersion(bound.phase.version, input.expectedVersion);
    if (bound.phase.archivedAt) {
      throw new OperationsStateError("Archived Phase cannot be updated");
    }
    const plannedStartAt =
      input.plannedStartAt !== undefined
        ? this.parseDate(input.plannedStartAt, "plannedStartAt")
        : bound.phase.plannedStartAt;
    const plannedEndAt =
      input.plannedEndAt !== undefined
        ? this.parseDate(input.plannedEndAt, "plannedEndAt")
        : bound.phase.plannedEndAt;
    assertValidDateRange(plannedStartAt, plannedEndAt, "Planned");
    void phaseDatesTransitStatus();
    const next = await this.prisma.$transaction(async (tx) => {
      if (input.sequence != null && input.sequence !== bound.phase.sequence) {
        const existing = await tx.phase.findMany({
          where: { projectId: bound.project.id, organizationId: bound.organizationId },
          select: { id: true, sequence: true, archivedAt: true },
        });
        assertUniquePhaseSequence(
          existing.map((row) => ({ sequence: row.sequence, archived: row.archivedAt != null })),
          input.sequence,
          existing.findIndex((row) => row.id === bound.phase.id),
        );
      }
      const name = input.name !== undefined ? input.name.trim() : bound.phase.name;
      if (!name) {
        throw new OperationsStateError("Phase name is required");
      }
      let updated: PhaseRow;
      try {
        updated = await tx.phase.update({
          where: { id: bound.phase.id },
          data: {
            name,
            description: input.description !== undefined ? input.description : bound.phase.description,
            sequence: input.sequence ?? bound.phase.sequence,
            plannedStartAt,
            plannedEndAt,
            version: bound.phase.version + 1,
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
          eventType: "PHASE_UPDATED",
          resourceType: "phase",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            sequence: updated.sequence,
            plannedStartAt: updated.plannedStartAt,
            plannedEndAt: updated.plannedEndAt,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.PhaseUpdated,
        { organizationId: updated.organizationId, projectId: updated.projectId, phaseId: updated.id },
        currentCorrelationId(),
        tx,
      );
      return this.toDto(updated);
    });
    return next;
  }

  async activate(
    session: RequestSession,
    projectId: string,
    phaseId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, phaseId, idempotencyKey, {
      to: "ACTIVE",
      permission: "phase.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async complete(
    session: RequestSession,
    projectId: string,
    phaseId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, phaseId, idempotencyKey, {
      to: "COMPLETED",
      permission: "phase.complete",
      expectedVersion: input.expectedVersion,
    });
  }

  async cancel(
    session: RequestSession,
    projectId: string,
    phaseId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    return this.transition(session, projectId, phaseId, idempotencyKey, {
      to: "CANCELLED",
      permission: "phase.update",
      expectedVersion: input.expectedVersion,
    });
  }

  async archive(
    session: RequestSession,
    projectId: string,
    phaseId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number },
  ) {
    const bound = await this.requirePhase(session, "phase.update", projectId, phaseId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      phaseId,
      action: "archive",
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.requireExpectedVersion(bound.phase.version, input.expectedVersion);
    if (hardDeletePhaseAllowed()) {
      throw new OperationsStateError("Hard-delete of Phase is forbidden");
    }
    if (bound.phase.archivedAt) {
      const body = this.toDto(bound.phase);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, body);
      return body;
    }
    const referenced = await this.phaseIsReferenced(bound.phase.id);
    void referenced;
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.phase.update({
        where: { id: bound.phase.id },
        data: { archivedAt: new Date(), version: bound.phase.version + 1 },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "PHASE_ARCHIVED",
          resourceType: "phase",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ sequence: updated.sequence, referenced }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.PhaseArchived,
        { organizationId: updated.organizationId, projectId: updated.projectId, phaseId: updated.id },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async reorder(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: { items: Array<{ id: string; sequence: number; expectedVersion: number }> },
  ) {
    const bound = await this.access.requireProject(session, "phase.update", projectId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      items: input.items,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (!input.items?.length) {
      throw new OperationsStateError("Reorder requires at least one Phase");
    }
    const body = await this.prisma.$transaction(async (tx) => {
      const ids = input.items.map((item) => item.id);
      const rows = await tx.phase.findMany({
        where: {
          id: { in: ids },
          projectId: bound.project.id,
          organizationId: bound.organizationId,
          archivedAt: null,
        },
      });
      if (rows.length !== ids.length) {
        throw new DenyByDefaultError("Phase is not bound to the authorized Project");
      }
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const item of input.items) {
        const row = byId.get(item.id);
        if (!row) {
          throw new DenyByDefaultError("Phase is not bound to the authorized Project");
        }
        this.requireExpectedVersion(row.version, item.expectedVersion);
      }
      const sequences = input.items.map((item) => item.sequence);
      if (new Set(sequences).size !== sequences.length) {
        throw new OperationsStateError("Phase sequence must be unique among non-archived Phases of the Project");
      }
      const others = await tx.phase.findMany({
        where: {
          projectId: bound.project.id,
          organizationId: bound.organizationId,
          archivedAt: null,
          id: { notIn: ids },
        },
        select: { sequence: true, archivedAt: true },
      });
      for (const item of input.items) {
        assertUniquePhaseSequence(
          [
            ...others.map((row) => ({ sequence: row.sequence, archived: false })),
            ...input.items
              .filter((other) => other.id !== item.id)
              .map((other) => ({ sequence: other.sequence, archived: false })),
          ],
          item.sequence,
        );
      }
      try {
        for (const [index, item] of input.items.entries()) {
          await tx.phase.update({
            where: { id: item.id },
            data: { sequence: -1 * (index + 1) },
          });
        }
        for (const item of input.items) {
          const current = byId.get(item.id)!;
          await tx.phase.update({
            where: { id: item.id },
            data: { sequence: item.sequence, version: current.version + 1 },
          });
        }
      } catch (error) {
        this.rethrowUnique(error);
        throw error;
      }
      const updated = await tx.phase.findMany({
        where: { projectId: bound.project.id, organizationId: bound.organizationId, archivedAt: null },
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
      });
      await this.audit.insert(
        {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          actorUserId: session.userId,
          eventType: "PHASE_UPDATED",
          resourceType: "phase",
          resourceId: bound.project.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ action: "reorder", ids }),
        },
        tx,
      );
      const dto = { items: updated.map((row) => this.toDto(row)), nextCursor: null };
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  private async transition(
    session: RequestSession,
    projectId: string,
    phaseId: string,
    idempotencyKey: string | undefined,
    input: { to: PhaseStatus; permission: PermissionCode; expectedVersion?: number },
  ) {
    const bound = await this.requirePhase(session, input.permission, projectId, phaseId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      phaseId,
      to: input.to,
      expectedVersion: input.expectedVersion ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (bound.phase.archivedAt) {
      throw new OperationsStateError("Archived Phase cannot change status");
    }
    if (!isPhaseStatus(bound.phase.status)) {
      throw new OperationsStateError("Phase status is invalid");
    }
    assertPhaseTransition(bound.phase.status, input.to);
    if (phaseStatusRequiresCompletePermission(input.to) && input.permission !== "phase.complete") {
      throw new DenyByDefaultError("Missing permission phase.complete");
    }
    this.requireExpectedVersion(bound.phase.version, input.expectedVersion);
    const now = new Date();
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.phase.update({
        where: { id: bound.phase.id },
        data: {
          status: input.to,
          actualStartAt:
            input.to === "ACTIVE" ? (bound.phase.actualStartAt ?? now) : bound.phase.actualStartAt,
          actualEndAt:
            input.to === "COMPLETED" || input.to === "CANCELLED"
              ? (bound.phase.actualEndAt ?? now)
              : bound.phase.actualEndAt,
          version: bound.phase.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "PHASE_STATUS_CHANGED",
          resourceType: "phase",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ from: bound.phase.status, to: input.to }),
        },
        tx,
      );
      const specific =
        input.to === "ACTIVE"
          ? { audit: "PHASE_ACTIVATED", outbox: OUTBOX_EVENT_TYPES.PhaseActivated }
          : input.to === "COMPLETED"
            ? { audit: "PHASE_COMPLETED", outbox: OUTBOX_EVENT_TYPES.PhaseCompleted }
            : { audit: "PHASE_CANCELLED", outbox: OUTBOX_EVENT_TYPES.PhaseCancelled };
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: specific.audit,
          resourceType: "phase",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ from: bound.phase.status, to: input.to }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        specific.outbox,
        { organizationId: updated.organizationId, projectId: updated.projectId, phaseId: updated.id },
        currentCorrelationId(),
        tx,
      );
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  private async requirePhase(
    session: RequestSession,
    permission: PermissionCode,
    projectId: string,
    phaseId: string,
  ) {
    const bound = await this.access.requireProject(session, permission, projectId);
    if (!UUID_RE.test(phaseId)) {
      throw new DenyByDefaultError("Client phaseId is not authoritative");
    }
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase || phase.projectId !== bound.project.id || phase.organizationId !== bound.organizationId) {
      throw new DenyByDefaultError("Phase is not bound to the authorized Project");
    }
    return { ...bound, phase };
  }

  private async phaseIsReferenced(_phaseId: string): Promise<boolean> {
    // Deliverable FKs land in M3.4. Archive remains the removal path regardless.
    return false;
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
      throw new OperationsStateError("Phase sequence must be unique among non-archived Phases of the Project");
    }
    const message = error instanceof Error ? error.message : "";
    if (/phases_project_sequence_active|unique/i.test(message)) {
      throw new OperationsStateError("Phase sequence must be unique among non-archived Phases of the Project");
    }
  }

  toDto(row: PhaseRow) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      name: row.name,
      description: row.description,
      sequence: row.sequence,
      plannedStartAt: row.plannedStartAt,
      plannedEndAt: row.plannedEndAt,
      actualStartAt: row.actualStartAt,
      actualEndAt: row.actualEndAt,
      status: row.status,
      createdBy: row.createdBy,
      version: row.version,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
