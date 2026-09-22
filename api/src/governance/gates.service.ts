import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  GovernanceStateError,
  OUTBOX_EVENT_TYPES,
  assertCanRelease,
  assertExceptionNotSatisfying,
  assertReleaseSoDForUsedExceptions,
  coveringExceptionFor,
  deriveEvaluationOutcome,
  deriveReleaseKind,
  evaluateTypedPredicate,
  isGateRequirementType,
  nextGateStatusAfterEvaluation,
  parseChecklist,
  parseRequirementConfig,
  redactSecrets,
  usedExceptionsForRelease,
  type FormalExceptionSnapshot,
  type GateRequirementType,
  type GateStatus,
  type RequirementEvaluation,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { CoordinationGovernanceAdapter } from "./adapters/coordination.adapter";
import { DocumentGovernanceAdapter } from "./adapters/document.adapter";
import { PlanningGovernanceAdapter } from "./adapters/planning.adapter";
import { GovernanceAccess, UUID_RE } from "./governance.access";

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class GatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GovernanceAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
    private readonly documents: DocumentGovernanceAdapter,
    private readonly coordination: CoordinationGovernanceAdapter,
    private readonly planning: PlanningGovernanceAdapter,
  ) {}

  async list(session: RequestSession, projectId: string) {
    const bound = await this.access.requireProject(session, "gate.read", projectId);
    const gates = await this.prisma.gate.findMany({
      where: { projectId: bound.project.id, organizationId: bound.organizationId },
      include: { requirements: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return gates.map((gate) => this.toGateDto(gate));
  }

  async get(session: RequestSession, projectId: string, gateId: string) {
    const bound = await this.requireGate(session, "gate.read", projectId, gateId);
    return this.toGateDto(bound.gate);
  }

  async create(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: { name: string; description?: string; organizationId?: string; projectId?: string },
  ) {
    const bound = await this.access.requireProject(session, "gate.evaluate", projectId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      name: input.name,
      description: input.description ?? "",
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const name = input.name.trim();
    if (!name) {
      throw new GovernanceStateError("Gate name is required");
    }
    return this.prisma.$transaction(async (tx) => {
      const gate = await tx.gate.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          name,
          description: input.description?.trim() ?? "",
          status: "NOT_READY",
          createdByUserId: session.userId,
        },
        include: { requirements: true },
      });
      await this.audit.insert(
        {
          organizationId: gate.organizationId,
          projectId: gate.projectId,
          actorUserId: session.userId,
          eventType: "GATE_CREATED",
          resourceType: "gate",
          resourceId: gate.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ status: gate.status }),
        },
        tx,
      );
      const body = this.toGateDto(gate);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
  }

  async addRequirement(
    session: RequestSession,
    projectId: string,
    gateId: string,
    input: {
      type: string;
      title: string;
      mandatory?: boolean;
      config?: unknown;
      checklist?: unknown;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.requireGate(session, "gate.evaluate", projectId, gateId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    this.assertConfigurable(bound.gate.status);
    if (!isGateRequirementType(input.type)) {
      throw new GovernanceStateError("Unknown GateRequirement type");
    }
    const title = input.title.trim();
    if (!title) {
      throw new GovernanceStateError("GateRequirement title is required");
    }
    const config = parseRequirementConfig(input.type, input.config ?? {});
    const checklist = parseChecklist(input.checklist);
    const created = await this.prisma.$transaction(async (tx) => {
      const requirement = await tx.gateRequirement.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          gateId: bound.gate.id,
          type: input.type,
          title,
          mandatory: input.mandatory !== false,
          config: config as unknown as Prisma.InputJsonValue,
          checklist: checklist as unknown as Prisma.InputJsonValue,
        },
      });
      const gate = await tx.gate.update({
        where: { id: bound.gate.id },
        data: { version: bound.gate.version + 1, status: "NOT_READY" },
        include: { requirements: { orderBy: { createdAt: "asc" } } },
      });
      await this.audit.insert(
        {
          organizationId: requirement.organizationId,
          projectId: requirement.projectId,
          actorUserId: session.userId,
          eventType: "GATE_REQUIREMENT_CONFIGURED",
          resourceType: "gate_requirement",
          resourceId: requirement.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ gateId: bound.gate.id, type: requirement.type, action: "create" }),
        },
        tx,
      );
      return gate;
    });
    return this.toGateDto(created);
  }

  async configureRequirement(
    session: RequestSession,
    projectId: string,
    gateId: string,
    requirementId: string,
    input: {
      title?: string;
      mandatory?: boolean;
      config?: unknown;
      checklist?: unknown;
      expectedVersion?: number;
      organizationId?: string;
      projectId?: string;
    },
  ) {
    const bound = await this.requireRequirement(session, "gate.evaluate", projectId, gateId, requirementId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    this.assertConfigurable(bound.gate.status);
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.requirement.version }, input.expectedVersion);
    }
    const type = bound.requirement.type as GateRequirementType;
    const config = parseRequirementConfig(type, input.config ?? bound.requirement.config);
    const checklist = input.checklist !== undefined ? parseChecklist(input.checklist) : parseChecklist(bound.requirement.checklist);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.gateRequirement.update({
        where: { id: bound.requirement.id },
        data: {
          title: input.title?.trim() || bound.requirement.title,
          mandatory: input.mandatory ?? bound.requirement.mandatory,
          config: config as unknown as Prisma.InputJsonValue,
          checklist: checklist as unknown as Prisma.InputJsonValue,
          lastSatisfaction: null,
          lastCoveredByException: false,
          lastCoveringExceptionId: null,
          lastEvaluatedAt: null,
          version: bound.requirement.version + 1,
        },
      });
      const gate = await tx.gate.update({
        where: { id: bound.gate.id },
        data: { version: bound.gate.version + 1, status: "NOT_READY" },
        include: { requirements: { orderBy: { createdAt: "asc" } } },
      });
      await this.audit.insert(
        {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          actorUserId: session.userId,
          eventType: "GATE_REQUIREMENT_CONFIGURED",
          resourceType: "gate_requirement",
          resourceId: bound.requirement.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ gateId: bound.gate.id, type, action: "update" }),
        },
        tx,
      );
      return gate;
    });
    return this.toGateDto(updated);
  }

  async evaluate(session: RequestSession, projectId: string, gateId: string) {
    const bound = await this.requireGate(session, "gate.evaluate", projectId, gateId);
    const { evaluations, nextStatus } = await this.evaluateGate(bound.gate, this.prisma);
    const updated = await this.prisma.$transaction(async (tx) => {
      return this.persistEvaluation(tx, session, bound.gate, evaluations, nextStatus);
    });
    return this.toGateDto(updated);
  }

  async release(
    session: RequestSession,
    projectId: string,
    gateId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion?: number; organizationId?: string; projectId?: string } = {},
  ) {
    const bound = await this.requireGate(session, "gate.release", projectId, gateId);
    this.access.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    if (input.expectedVersion == null) {
      throw new GovernanceStateError("gate.release requires expectedVersion for CAS");
    }
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      gateId,
      expectedVersion: input.expectedVersion,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.foundation.cas({ version: bound.gate.version }, input.expectedVersion);
    const { evaluations, exceptions } = await this.evaluateGate(bound.gate, this.prisma);
    const release = { currentStatus: bound.gate.status as GateStatus, kind: deriveReleaseKind(evaluations) };
    assertCanRelease(release);
    const kind = release.kind;
    const used = usedExceptionsForRelease(evaluations, exceptions);
    assertReleaseSoDForUsedExceptions({ releaserUserId: session.userId, usedExceptions: used });
    const nextStatus = kind === "NORMAL" ? "RELEASED" : "RELEASED_WITH_EXCEPTION";
    const body = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.persistRequirementResults(tx, evaluations);
      const gate = await tx.gate.update({
        where: { id: bound.gate.id },
        data: {
          status: nextStatus,
          lastEvaluatedAt: now,
          lastEvaluatedByUserId: session.userId,
          releasedAt: now,
          releasedByUserId: session.userId,
          releaseKind: kind,
          version: bound.gate.version + 1,
        },
        include: { requirements: { orderBy: { createdAt: "asc" } } },
      });
      const snapshot = {
        kind,
        evaluations,
        usedExceptionIds: used.map((row) => row.id),
      };
      const decision = await tx.gateReleaseDecision.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          gateId: bound.gate.id,
          kind,
          releasedByUserId: session.userId,
          releasedAt: now,
          gateVersion: gate.version,
          evaluationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      if (used.length > 0) {
        await tx.gateReleaseUsedException.createMany({
          data: used.map((exception) => ({
            organizationId: bound.organizationId,
            projectId: bound.project.id,
            releaseDecisionId: decision.id,
            formalExceptionId: exception.id,
            gateRequirementId: exception.gateRequirementId,
          })),
        });
      }
      const eventType = kind === "NORMAL" ? "GATE_RELEASED" : "GATE_RELEASED_WITH_EXCEPTION";
      await this.audit.insert(
        {
          organizationId: gate.organizationId,
          projectId: gate.projectId,
          actorUserId: session.userId,
          eventType,
          resourceType: "gate",
          resourceId: gate.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            kind,
            status: gate.status,
            usedExceptionIds: used.map((row) => row.id),
            evaluations: evaluations.map((row) => ({
              requirementId: row.requirementId,
              satisfaction: row.satisfaction,
              coveredByException: row.coveredByException,
            })),
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        kind === "NORMAL" ? OUTBOX_EVENT_TYPES.GateReleased : OUTBOX_EVENT_TYPES.GateReleasedWithException,
        {
          organizationId: gate.organizationId,
          projectId: gate.projectId,
          gateId: gate.id,
          kind,
          releaseDecisionId: decision.id,
        },
        currentCorrelationId(),
        tx,
      );
      const dto = {
        ...this.toGateDto(gate),
        releaseDecision: this.toReleaseDto(decision, used.map((row) => row.id)),
      };
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async listReleases(session: RequestSession, projectId: string, gateId: string) {
    const bound = await this.requireGate(session, "gate.read", projectId, gateId);
    const rows = await this.prisma.gateReleaseDecision.findMany({
      where: { gateId: bound.gate.id, organizationId: bound.organizationId, projectId: bound.project.id },
      include: { usedExceptions: true },
      orderBy: { releasedAt: "asc" },
    });
    return rows.map((row) =>
      this.toReleaseDto(
        row,
        row.usedExceptions.map((link) => link.formalExceptionId),
      ),
    );
  }

  async reevaluateAfterExceptionChange(gateId: string, actorUserId: string, tx: Prisma.TransactionClient) {
    const gate = await tx.gate.findUnique({
      where: { id: gateId },
      include: { requirements: { orderBy: { createdAt: "asc" } } },
    });
    if (!gate) {
      return null;
    }
    const { evaluations, nextStatus } = await this.evaluateGate(gate, tx);
    return this.persistEvaluation(
      tx,
      { userId: actorUserId } as RequestSession,
      gate,
      evaluations,
      nextStatus,
    );
  }

  private async evaluateGate(gate: { id: string; organizationId: string; projectId: string; status: string }, db: Db) {
    const requirements = await db.gateRequirement.findMany({
      where: { gateId: gate.id, organizationId: gate.organizationId, projectId: gate.projectId },
      orderBy: { createdAt: "asc" },
    });
    const exceptionRows = await db.formalException.findMany({
      where: { gateId: gate.id, organizationId: gate.organizationId, projectId: gate.projectId },
    });
    const exceptions: FormalExceptionSnapshot[] = exceptionRows.map((row) => ({
      id: row.id,
      gateRequirementId: row.gateRequirementId,
      status: row.status as FormalExceptionSnapshot["status"],
      requestedByUserId: row.requestedByUserId,
      expiresAt: row.expiresAt,
    }));
    const now = new Date();
    const evaluations: RequirementEvaluation[] = [];
    for (const requirement of requirements) {
      const type = requirement.type as GateRequirementType;
      const config = parseRequirementConfig(type, requirement.config);
      const checklist = parseChecklist(requirement.checklist);
      const snapshots = await this.loadSnapshots(gate.organizationId, gate.projectId, type, config);
      const satisfaction = evaluateTypedPredicate({
        type,
        config,
        checklist,
        organizationId: gate.organizationId,
        projectId: gate.projectId,
        ...snapshots,
      });
      const covering =
        satisfaction === "UNSATISFIED" ? coveringExceptionFor(requirement.id, exceptions, now) : null;
      const evaluation: RequirementEvaluation = {
        requirementId: requirement.id,
        type,
        mandatory: requirement.mandatory,
        satisfaction,
        coveredByException: covering != null,
        coveringExceptionId: covering?.id ?? null,
      };
      assertExceptionNotSatisfying(evaluation);
      evaluations.push(evaluation);
    }
    const outcome = deriveEvaluationOutcome(evaluations);
    const nextStatus = nextGateStatusAfterEvaluation({
      currentStatus: gate.status as GateStatus,
      outcome,
      evaluations,
    });
    return { evaluations, nextStatus, exceptions, outcome };
  }

  private async loadSnapshots(
    organizationId: string,
    projectId: string,
    type: GateRequirementType,
    config: ReturnType<typeof parseRequirementConfig>,
  ) {
    if (type === "DOCUMENT_REQUIRED" && config.type === "DOCUMENT_REQUIRED") {
      const document = await this.documents.findDocument(organizationId, projectId, config);
      return { document };
    }
    if (type === "REVISION_APPROVED" && config.type === "REVISION_APPROVED") {
      const document = await this.documents.findDocument(organizationId, projectId, {
        documentId: config.documentId,
      });
      const revision = document
        ? await this.documents.findRevision(organizationId, projectId, {
            documentId: document.id,
            revisionId: config.revisionId,
            currentRevisionId: document.currentRevisionId,
          })
        : null;
      return { document, revision };
    }
    if (type === "ISSUE_STATE" && config.type === "ISSUE_STATE") {
      return { issue: await this.coordination.findIssue(organizationId, projectId, config.issueId) };
    }
    if (type === "TASK_STATE" && config.type === "TASK_STATE") {
      return { task: await this.planning.findTask(organizationId, projectId, config.taskId) };
    }
    if (type === "MILESTONE_STATE" && config.type === "MILESTONE_STATE") {
      const milestone = await this.planning.findMilestone(organizationId, projectId, config.milestoneId);
      return {
        milestone: milestone
          ? {
              id: milestone.id,
              organizationId: milestone.organizationId,
              projectId: milestone.projectId,
              recordedStatus: milestone.status,
              targetDate: milestone.targetDate,
              linkedTasksLate: milestone.linkedTasksLate,
            }
          : null,
      };
    }
    return {};
  }

  private async persistEvaluation(
    tx: Prisma.TransactionClient,
    session: { userId: string },
    gate: { id: string; organizationId: string; projectId: string; version: number; status: string },
    evaluations: RequirementEvaluation[],
    nextStatus: GateStatus,
  ) {
    const now = new Date();
    await this.persistRequirementResults(tx, evaluations, now);
    const released = nextStatus === "RELEASED" || nextStatus === "RELEASED_WITH_EXCEPTION";
    const updated = await tx.gate.update({
      where: { id: gate.id },
      data: {
        status: nextStatus,
        lastEvaluatedAt: now,
        lastEvaluatedByUserId: session.userId,
        version: gate.version + 1,
        ...(released
          ? {}
          : { releasedAt: null, releasedByUserId: null, releaseKind: null }),
      },
      include: { requirements: { orderBy: { createdAt: "asc" } } },
    });
    await this.audit.insert(
      {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        actorUserId: session.userId,
        eventType: "GATE_EVALUATED",
        resourceType: "gate",
        resourceId: updated.id,
        correlationId: currentCorrelationId(),
        payload: redactSecrets({
          from: gate.status,
          to: nextStatus,
          evaluations: evaluations.map((row) => ({
            requirementId: row.requirementId,
            satisfaction: row.satisfaction,
            coveredByException: row.coveredByException,
            coveringExceptionId: row.coveringExceptionId,
          })),
        }),
      },
      tx,
    );
    return updated;
  }

  private async persistRequirementResults(
    tx: Prisma.TransactionClient,
    evaluations: RequirementEvaluation[],
    now = new Date(),
  ) {
    for (const evaluation of evaluations) {
      await tx.gateRequirement.update({
        where: { id: evaluation.requirementId },
        data: {
          lastSatisfaction: evaluation.satisfaction,
          lastCoveredByException: evaluation.coveredByException,
          lastCoveringExceptionId: evaluation.coveringExceptionId,
          lastEvaluatedAt: now,
        },
      });
    }
  }

  async requireGate(session: RequestSession, permission: Parameters<GovernanceAccess["requireProject"]>[1], projectId: string, gateId: string) {
    const bound = await this.access.requireProject(session, permission, projectId);
    if (!UUID_RE.test(gateId)) {
      throw new DenyByDefaultError("Client gateId is not authoritative");
    }
    const gate = await this.prisma.gate.findUnique({
      where: { id: gateId },
      include: { requirements: { orderBy: { createdAt: "asc" } } },
    });
    if (!gate || gate.projectId !== bound.project.id || gate.organizationId !== bound.organizationId) {
      throw new DenyByDefaultError("Gate is not bound to the authorized Project");
    }
    return { ...bound, gate };
  }

  private async requireRequirement(
    session: RequestSession,
    permission: Parameters<GovernanceAccess["requireProject"]>[1],
    projectId: string,
    gateId: string,
    requirementId: string,
  ) {
    const bound = await this.requireGate(session, permission, projectId, gateId);
    if (!UUID_RE.test(requirementId)) {
      throw new DenyByDefaultError("Client requirementId is not authoritative");
    }
    const requirement = bound.gate.requirements.find((row) => row.id === requirementId);
    if (!requirement) {
      throw new DenyByDefaultError("GateRequirement is not bound to the authorized Gate");
    }
    return { ...bound, requirement };
  }

  private assertConfigurable(status: string) {
    if (status === "RELEASED" || status === "RELEASED_WITH_EXCEPTION") {
      throw new GovernanceStateError("A released Gate cannot be reconfigured; historical release is immutable");
    }
  }

  toGateDto(gate: {
    id: string;
    organizationId: string;
    projectId: string;
    name: string;
    description: string;
    status: string;
    lastEvaluatedAt: Date | null;
    lastEvaluatedByUserId: string | null;
    releasedAt: Date | null;
    releasedByUserId: string | null;
    releaseKind: string | null;
    createdByUserId: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    requirements: Array<{
      id: string;
      type: string;
      title: string;
      mandatory: boolean;
      config: Prisma.JsonValue;
      checklist: Prisma.JsonValue;
      lastSatisfaction: string | null;
      lastCoveredByException: boolean;
      lastCoveringExceptionId: string | null;
      lastEvaluatedAt: Date | null;
      version: number;
    }>;
  }) {
    return {
      id: gate.id,
      organizationId: gate.organizationId,
      projectId: gate.projectId,
      name: gate.name,
      description: gate.description,
      status: gate.status,
      lastEvaluatedAt: gate.lastEvaluatedAt,
      lastEvaluatedByUserId: gate.lastEvaluatedByUserId,
      releasedAt: gate.releasedAt,
      releasedByUserId: gate.releasedByUserId,
      releaseKind: gate.releaseKind,
      createdByUserId: gate.createdByUserId,
      version: gate.version,
      createdAt: gate.createdAt,
      updatedAt: gate.updatedAt,
      requirements: gate.requirements.map((requirement) => ({
        id: requirement.id,
        type: requirement.type,
        title: requirement.title,
        mandatory: requirement.mandatory,
        config: requirement.config,
        checklist: parseChecklist(requirement.checklist),
        satisfaction: requirement.lastSatisfaction,
        coveredByException: requirement.lastCoveredByException,
        coveringExceptionId: requirement.lastCoveringExceptionId,
        lastEvaluatedAt: requirement.lastEvaluatedAt,
        version: requirement.version,
      })),
    };
  }

  toReleaseDto(
    row: {
      id: string;
      organizationId: string;
      projectId: string;
      gateId: string;
      kind: string;
      releasedByUserId: string;
      releasedAt: Date;
      gateVersion: number;
      evaluationSnapshot: Prisma.JsonValue;
    },
    usedExceptionIds: string[],
  ) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      gateId: row.gateId,
      kind: row.kind,
      releasedByUserId: row.releasedByUserId,
      releasedAt: row.releasedAt,
      gateVersion: row.gateVersion,
      evaluationSnapshot: row.evaluationSnapshot,
      usedExceptionIds,
    };
  }
}
