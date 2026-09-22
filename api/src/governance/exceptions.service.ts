import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  GovernanceStateError,
  OUTBOX_EVENT_TYPES,
  assertExceptionDecisionAllowed,
  assertExceptionTransition,
  assertNoGateWideException,
  isExceptionStatus,
  redactSecrets,
  type ExceptionStatus,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { GovernanceAccess, UUID_RE } from "./governance.access";
import { GatesService } from "./gates.service";

@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GovernanceAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
    private readonly gates: GatesService,
  ) {}

  async list(session: RequestSession, projectId: string, gateId?: string) {
    const bound = await this.access.requireProject(session, "gate.read", projectId);
    const rows = await this.prisma.formalException.findMany({
      where: {
        organizationId: bound.organizationId,
        projectId: bound.project.id,
        ...(gateId ? { gateId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(session: RequestSession, projectId: string, exceptionId: string) {
    const bound = await this.requireException(session, "gate.read", projectId, exceptionId);
    return this.toDto(bound.exception);
  }

  async request(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: {
      gateId: string;
      gateRequirementId: string;
      reason: string;
      expiresAt?: string;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.access.requireProject(session, "exception.request", projectId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    assertNoGateWideException(input.gateRequirementId);
    if (!UUID_RE.test(input.gateId) || !UUID_RE.test(input.gateRequirementId)) {
      throw new DenyByDefaultError("Client gate or requirement id is not authoritative");
    }
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      gateId: input.gateId,
      gateRequirementId: input.gateRequirementId,
      reason: input.reason,
      expiresAt: input.expiresAt ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const reason = input.reason.trim();
    if (!reason) {
      throw new GovernanceStateError("Formal Exception reason is required");
    }
    const gate = await this.prisma.gate.findUnique({ where: { id: input.gateId } });
    const requirement = await this.prisma.gateRequirement.findUnique({ where: { id: input.gateRequirementId } });
    if (
      !gate ||
      !requirement ||
      gate.organizationId !== bound.organizationId ||
      gate.projectId !== bound.project.id ||
      requirement.organizationId !== bound.organizationId ||
      requirement.projectId !== bound.project.id ||
      requirement.gateId !== gate.id
    ) {
      throw new DenyByDefaultError("Formal Exception must target a GateRequirement in the authorized Project");
    }
    if (gate.status === "RELEASED") {
      throw new GovernanceStateError("A normally released Gate does not accept Formal Exceptions");
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.formalException.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          gateId: gate.id,
          gateRequirementId: requirement.id,
          status: "REQUESTED",
          reason,
          requestedByUserId: session.userId,
          expiresAt: this.parseDate(input.expiresAt),
        },
      });
      await this.audit.insert(
        {
          organizationId: created.organizationId,
          projectId: created.projectId,
          actorUserId: session.userId,
          eventType: "EXCEPTION_REQUESTED",
          resourceType: "formal_exception",
          resourceId: created.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            gateId: created.gateId,
            gateRequirementId: created.gateRequirementId,
            expiresAt: created.expiresAt,
          }),
        },
        tx,
      );
      const body = this.toDto(created);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
  }

  async approve(
    session: RequestSession,
    projectId: string,
    exceptionId: string,
    idempotencyKey: string | undefined,
    input: { expiresAt?: string; expectedVersion?: number } = {},
  ) {
    return this.decide(session, projectId, exceptionId, idempotencyKey, "APPROVED", input);
  }

  async reject(
    session: RequestSession,
    projectId: string,
    exceptionId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number } = {},
  ) {
    return this.decide(session, projectId, exceptionId, idempotencyKey, "REJECTED", input);
  }

  async revoke(
    session: RequestSession,
    projectId: string,
    exceptionId: string,
    input: { expectedVersion?: number } = {},
  ) {
    const bound = await this.requireException(session, "exception.revoke", projectId, exceptionId);
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.exception.version }, input.expectedVersion);
    }
    assertExceptionTransition(bound.exception.status as ExceptionStatus, "REVOKED");
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.formalException.update({
        where: { id: bound.exception.id },
        data: {
          status: "REVOKED",
          revokedByUserId: session.userId,
          revokedAt: now,
          version: bound.exception.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "EXCEPTION_REVOKED",
          resourceType: "formal_exception",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            gateId: updated.gateId,
            gateRequirementId: updated.gateRequirementId,
            previousStatus: bound.exception.status,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.ExceptionRevoked,
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          exceptionId: updated.id,
          gateId: updated.gateId,
        },
        currentCorrelationId(),
        tx,
      );
      await this.gates.reevaluateAfterExceptionChange(updated.gateId, session.userId, tx);
      return this.toDto(updated);
    });
  }

  private async decide(
    session: RequestSession,
    projectId: string,
    exceptionId: string,
    idempotencyKey: string | undefined,
    to: "APPROVED" | "REJECTED",
    input: { expiresAt?: string; expectedVersion?: number },
  ) {
    const permission = to === "APPROVED" ? "exception.approve" : "exception.reject";
    const bound = await this.requireException(session, permission, projectId, exceptionId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      exceptionId,
      action: to,
      expiresAt: input.expiresAt ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.exception.version }, input.expectedVersion);
    }
    assertExceptionDecisionAllowed({
      actorUserId: session.userId,
      requestedByUserId: bound.exception.requestedByUserId,
    });
    assertExceptionTransition(bound.exception.status as ExceptionStatus, to);
    const now = new Date();
    const body = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.formalException.update({
        where: { id: bound.exception.id },
        data: {
          status: to,
          decidedByUserId: session.userId,
          decidedAt: now,
          expiresAt:
            to === "APPROVED" && input.expiresAt !== undefined
              ? this.parseDate(input.expiresAt)
              : bound.exception.expiresAt,
          version: bound.exception.version + 1,
        },
      });
      const eventType = to === "APPROVED" ? "EXCEPTION_APPROVED" : "EXCEPTION_REJECTED";
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType,
          resourceType: "formal_exception",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            gateId: updated.gateId,
            gateRequirementId: updated.gateRequirementId,
            satisfactionUnchanged: "UNSATISFIED remains UNSATISFIED",
          }),
        },
        tx,
      );
      if (to === "APPROVED") {
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.ExceptionApproved,
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            exceptionId: updated.id,
            gateId: updated.gateId,
          },
          currentCorrelationId(),
          tx,
        );
      }
      await this.gates.reevaluateAfterExceptionChange(updated.gateId, session.userId, tx);
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  private async requireException(
    session: RequestSession,
    permission: Parameters<GovernanceAccess["requireProject"]>[1],
    projectId: string,
    exceptionId: string,
  ) {
    const bound = await this.access.requireProject(session, permission, projectId);
    if (!UUID_RE.test(exceptionId)) {
      throw new DenyByDefaultError("Client exceptionId is not authoritative");
    }
    const exception = await this.prisma.formalException.findUnique({ where: { id: exceptionId } });
    if (
      !exception ||
      exception.projectId !== bound.project.id ||
      exception.organizationId !== bound.organizationId
    ) {
      throw new DenyByDefaultError("Formal Exception is not bound to the authorized Project");
    }
    return { ...bound, exception };
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (value == null || value === "") {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new GovernanceStateError("Invalid Formal Exception expiry");
    }
    return parsed;
  }

  toDto(row: {
    id: string;
    organizationId: string;
    projectId: string;
    gateId: string;
    gateRequirementId: string;
    status: string;
    reason: string;
    requestedByUserId: string;
    requestedAt: Date;
    decidedByUserId: string | null;
    decidedAt: Date | null;
    revokedByUserId: string | null;
    revokedAt: Date | null;
    expiresAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    if (!isExceptionStatus(row.status)) {
      throw new GovernanceStateError("Persisted Formal Exception status is invalid");
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      gateId: row.gateId,
      gateRequirementId: row.gateRequirementId,
      status: row.status,
      reason: row.reason,
      requestedByUserId: row.requestedByUserId,
      requestedAt: row.requestedAt,
      decidedByUserId: row.decidedByUserId,
      decidedAt: row.decidedAt,
      revokedByUserId: row.revokedByUserId,
      revokedAt: row.revokedAt,
      expiresAt: row.expiresAt,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      satisfiesRequirement: false,
    };
  }
}
