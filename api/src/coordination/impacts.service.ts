import { Injectable } from "@nestjs/common";
import {
  CoordinationStateError,
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  assertCanAssessImpact,
  assertCanResolveImpact,
  assertImpactTransition,
  impactAnalysisChangeKey,
  isImpactAssessmentResult,
  isImpactBlockingIssueStatus,
  parseCurrentRevisionChangedPayload,
  redactSecrets,
  type PermissionCode,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import type { OutboxRecord } from "../foundation/outbox.processor";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ImpactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Idempotent consumer for CurrentRevisionChanged / NewBaseEstablished.
   * Creates exactly one PENDING_ANALYSIS case per change event.
   */
  async consumeChangeEvent(message: OutboxRecord, tx: Prisma.TransactionClient): Promise<void> {
    if (
      message.eventType !== OUTBOX_EVENT_TYPES.CurrentRevisionChanged &&
      message.eventType !== OUTBOX_EVENT_TYPES.NewBaseEstablished
    ) {
      return;
    }
    const payload = parseCurrentRevisionChangedPayload(message.payload);
    const changeKey = impactAnalysisChangeKey({
      correlationId: message.correlationId,
      documentId: payload.documentId,
      previousRevisionId: payload.previousRevisionId,
      newRevisionId: payload.newRevisionId,
    });
    const existing = await tx.impactAnalysis.findUnique({ where: { changeKey } });
    if (existing) {
      return;
    }
    try {
      const created = await tx.impactAnalysis.create({
        data: {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          documentId: payload.documentId,
          sourceRevisionId: payload.newRevisionId,
          previousRevisionId: payload.previousRevisionId,
          changeKey,
          sourceOutboxMessageId: message.id,
          correlationId: message.correlationId,
          status: "PENDING_ANALYSIS",
        },
      });
      await this.audit.insert(
        {
          organizationId: created.organizationId,
          projectId: created.projectId,
          actorUserId: payload.actorUserId,
          eventType: "IMPACT_CREATED",
          resourceType: "impact_analysis",
          resourceId: created.id,
          correlationId: message.correlationId,
          payload: redactSecrets({
            documentId: created.documentId,
            sourceRevisionId: created.sourceRevisionId,
            previousRevisionId: created.previousRevisionId,
            status: created.status,
            sourceEventType: message.eventType,
            changeKey,
          }),
        },
        tx,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }
  }

  async list(session: RequestSession, projectId: string) {
    const bound = await this.requireProject(session, "project.read", projectId);
    const rows = await this.prisma.impactAnalysis.findMany({
      where: { projectId: bound.project.id, organizationId: bound.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(session: RequestSession, projectId: string, impactId: string) {
    const bound = await this.requireImpact(session, "project.read", projectId, impactId);
    return this.toDto(bound.impact);
  }

  async assess(
    session: RequestSession,
    projectId: string,
    impactId: string,
    idempotencyKey: string | undefined,
    input: { result: string; rationale: string; affectedContext?: string; expectedVersion?: number },
  ) {
    const bound = await this.requireImpact(session, "issue.update", projectId, impactId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      impactId,
      result: input.result,
      rationale: input.rationale,
      affectedContext: input.affectedContext ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    if (!isImpactAssessmentResult(input.result)) {
      throw new CoordinationStateError("Assessment result must be IMPACTED or NOT_IMPACTED");
    }
    const rationale = input.rationale.trim();
    if (!rationale) {
      throw new CoordinationStateError("Assessment rationale is required");
    }
    assertCanAssessImpact(bound.impact.status as "PENDING_ANALYSIS");
    assertImpactTransition(bound.impact.status as "PENDING_ANALYSIS", input.result);
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.impact.version }, input.expectedVersion);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.impactAnalysis.update({
        where: { id: bound.impact.id },
        data: {
          status: input.result,
          assessmentResult: input.result,
          assessmentRationale: rationale,
          assessedByUserId: session.userId,
          assessedAt: new Date(),
          affectedContext: input.affectedContext?.trim() || bound.impact.affectedContext,
          version: bound.impact.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: next.organizationId,
          projectId: next.projectId,
          actorUserId: session.userId,
          eventType: "IMPACT_ASSESSED",
          resourceType: "impact_analysis",
          resourceId: next.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            result: next.assessmentResult,
            rationale,
            previousStatus: bound.impact.status,
          }),
        },
        tx,
      );
      if (input.result === "IMPACTED") {
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.ImpactIdentified,
          {
            organizationId: next.organizationId,
            projectId: next.projectId,
            impactAnalysisId: next.id,
            documentId: next.documentId,
            sourceRevisionId: next.sourceRevisionId,
          },
          currentCorrelationId(),
          tx,
        );
      }
      const body = this.toDto(next);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return updated;
  }

  async resolve(
    session: RequestSession,
    projectId: string,
    impactId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number } = {},
  ) {
    const bound = await this.requireImpact(session, "issue.resolve", projectId, impactId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, { impactId, action: "resolve" });
    if (started.replay) {
      return started.replay.responseBody;
    }
    assertCanResolveImpact(bound.impact.status as "IMPACTED" | "NOT_IMPACTED");
    assertImpactTransition(bound.impact.status as "IMPACTED" | "NOT_IMPACTED", "RESOLVED");
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.impact.version }, input.expectedVersion);
    }

    const openIssues = await this.prisma.issue.findMany({
      where: { impactAnalysisId: bound.impact.id, organizationId: bound.organizationId },
    });
    const blocking = openIssues.filter((issue) => isImpactBlockingIssueStatus(issue.status));
    if (blocking.length > 0) {
      throw new CoordinationStateError(
        "Impact Analysis cannot be resolved while linked Issues remain open or active",
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.impactAnalysis.update({
        where: { id: bound.impact.id },
        data: {
          status: "RESOLVED",
          resolvedByUserId: session.userId,
          resolvedAt: new Date(),
          version: bound.impact.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: next.organizationId,
          projectId: next.projectId,
          actorUserId: session.userId,
          eventType: "IMPACT_RESOLVED",
          resourceType: "impact_analysis",
          resourceId: next.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ previousStatus: bound.impact.status }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.ImpactResolved,
        {
          organizationId: next.organizationId,
          projectId: next.projectId,
          impactAnalysisId: next.id,
        },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(next);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return updated;
  }

  async requireImpact(
    session: RequestSession,
    permission: PermissionCode,
    projectId: string,
    impactId: string,
  ) {
    const bound = await this.requireProject(session, permission, projectId);
    if (!UUID_RE.test(impactId)) {
      throw new DenyByDefaultError("Client impactId is not authoritative");
    }
    const impact = await this.prisma.impactAnalysis.findUnique({ where: { id: impactId } });
    if (
      !impact ||
      impact.projectId !== bound.project.id ||
      impact.organizationId !== bound.organizationId
    ) {
      throw new DenyByDefaultError("Impact Analysis is not bound to the authorized Project");
    }
    return { ...bound, impact };
  }

  async requireProject(session: RequestSession, permission: PermissionCode, projectId: string) {
    const context = await this.authz.assert(session, permission, projectId);
    if (!UUID_RE.test(projectId)) {
      throw new DenyByDefaultError("Client projectId is not authoritative");
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== context.organizationId) {
      throw new DenyByDefaultError("Project is not bound to the authorized Organization");
    }
    return { project, organizationId: context.organizationId, context };
  }

  toDto(row: {
    id: string;
    organizationId: string;
    projectId: string;
    documentId: string;
    sourceRevisionId: string;
    previousRevisionId: string | null;
    changeKey: string;
    status: string;
    affectedContext: string | null;
    assessedByUserId: string | null;
    assessedAt: Date | null;
    assessmentResult: string | null;
    assessmentRationale: string | null;
    resolvedByUserId: string | null;
    resolvedAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      documentId: row.documentId,
      sourceRevisionId: row.sourceRevisionId,
      previousRevisionId: row.previousRevisionId,
      status: row.status,
      affectedContext: row.affectedContext,
      assessedByUserId: row.assessedByUserId,
      assessedAt: row.assessedAt,
      assessmentResult: row.assessmentResult,
      assessmentRationale: row.assessmentRationale,
      resolvedByUserId: row.resolvedByUserId,
      resolvedAt: row.resolvedAt,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
