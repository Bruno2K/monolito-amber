import { Injectable } from "@nestjs/common";
import {
  CoordinationStateError,
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  assertIssueTransition,
  isIssuePriority,
  isIssueSeverity,
  isIssueStatus,
  issueStatusRequiresClosePermission,
  issueStatusRequiresReopenPermission,
  issueStatusRequiresResolvePermission,
  redactSecrets,
  type IssuePriority,
  type IssueSeverity,
  type IssueStatus,
  type PermissionCode,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { ImpactsService } from "./impacts.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
    private readonly impacts: ImpactsService,
  ) {}

  async list(session: RequestSession, projectId: string) {
    const bound = await this.impacts.requireProject(session, "project.read", projectId);
    const rows = await this.prisma.issue.findMany({
      where: { projectId: bound.project.id, organizationId: bound.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(session: RequestSession, projectId: string, issueId: string) {
    const bound = await this.requireIssue(session, "project.read", projectId, issueId);
    return this.toDto(bound.issue);
  }

  async createManual(
    session: RequestSession,
    projectId: string,
    idempotencyKey: string | undefined,
    input: {
      title: string;
      description?: string;
      severity?: string;
      priority?: string;
      responsibleDisciplineId?: string;
      dueDate?: string;
      organizationId?: string;
      projectId?: string;
      origin?: string;
      impactAnalysisId?: string;
    },
  ) {
    const bound = await this.impacts.requireProject(session, "issue.create", projectId);
    this.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    return this.createIssue(session, bound.organizationId, bound.project.id, idempotencyKey, {
      origin: "MANUAL",
      impactAnalysisId: null,
      title: input.title,
      description: input.description,
      severity: input.severity,
      priority: input.priority,
      responsibleDisciplineId: input.responsibleDisciplineId,
      dueDate: input.dueDate,
    });
  }

  async createFromImpact(
    session: RequestSession,
    projectId: string,
    impactId: string,
    idempotencyKey: string | undefined,
    input: {
      title: string;
      description?: string;
      severity?: string;
      priority?: string;
      responsibleDisciplineId?: string;
      dueDate?: string;
      organizationId?: string;
      projectId?: string;
      origin?: string;
    },
  ) {
    const bound = await this.impacts.requireImpact(session, "issue.create", projectId, impactId);
    this.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    if (bound.impact.status !== "IMPACTED") {
      throw new CoordinationStateError("Issues may be opened from an Impact only after explicit IMPACTED assessment");
    }
    return this.createIssue(session, bound.organizationId, bound.project.id, idempotencyKey, {
      origin: "IMPACT",
      impactAnalysisId: bound.impact.id,
      title: input.title,
      description: input.description,
      severity: input.severity,
      priority: input.priority,
      responsibleDisciplineId: input.responsibleDisciplineId,
      dueDate: input.dueDate,
    });
  }

  async update(
    session: RequestSession,
    projectId: string,
    issueId: string,
    input: {
      title?: string;
      description?: string;
      severity?: string | null;
      priority?: string | null;
      responsibleDisciplineId?: string | null;
      dueDate?: string | null;
      assigneeUserId?: string;
      status?: string;
      origin?: string;
      organizationId?: string;
      projectId?: string;
      expectedVersion?: number;
    },
  ) {
    const bound = await this.requireIssue(session, "issue.update", projectId, issueId);
    this.rejectClientAuthority(input, bound.organizationId, bound.project.id);
    if (input.status || input.assigneeUserId || input.origin) {
      throw new CoordinationStateError("Status, assignee, and origin have dedicated endpoints and are not patchable");
    }
    const severity = this.parseOptionalSeverity(input.severity);
    const priority = this.parseOptionalPriority(input.priority);
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.issue.version }, input.expectedVersion);
    }
    const next = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: bound.issue.id },
        data: {
          title: input.title?.trim() || bound.issue.title,
          description: input.description !== undefined ? input.description : bound.issue.description,
          severity: input.severity !== undefined ? severity : bound.issue.severity,
          priority: input.priority !== undefined ? priority : bound.issue.priority,
          responsibleDisciplineId:
            input.responsibleDisciplineId !== undefined
              ? input.responsibleDisciplineId?.trim() || null
              : bound.issue.responsibleDisciplineId,
          dueDate: input.dueDate !== undefined ? this.parseDueDate(input.dueDate) : bound.issue.dueDate,
          version: bound.issue.version + 1,
        },
      });
      if (input.priority !== undefined && input.priority !== bound.issue.priority) {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "ISSUE_PRIORITY_CHANGED",
            resourceType: "issue",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.issue.priority, to: updated.priority }),
          },
          tx,
        );
      }
      if (input.dueDate !== undefined && String(input.dueDate) !== String(bound.issue.dueDate)) {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "ISSUE_DUE_DATE_CHANGED",
            resourceType: "issue",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.issue.dueDate, to: updated.dueDate }),
          },
          tx,
        );
      }
      return updated;
    });
    return this.toDto(next);
  }

  async assign(
    session: RequestSession,
    projectId: string,
    issueId: string,
    input: { assigneeUserId: string | null },
  ) {
    const bound = await this.requireIssue(session, "issue.assign", projectId, issueId);
    const next = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: bound.issue.id },
        data: {
          assigneeUserId: input.assigneeUserId,
          version: bound.issue.version + 1,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "ISSUE_ASSIGNED",
          resourceType: "issue",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            assigneeUserId: updated.assigneeUserId,
            responsibleDisciplineId: updated.responsibleDisciplineId,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.IssueAssigned,
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          issueId: updated.id,
          assigneeUserId: updated.assigneeUserId,
        },
        currentCorrelationId(),
        tx,
      );
      return updated;
    });
    return this.toDto(next);
  }

  async transition(
    session: RequestSession,
    projectId: string,
    issueId: string,
    idempotencyKey: string | undefined,
    input: { status: string; rationale?: string; expectedVersion?: number },
  ) {
    if (!isIssueStatus(input.status)) {
      throw new CoordinationStateError("Unknown Issue status");
    }
    const permission = this.permissionForTransition(input.status);
    const bound = await this.requireIssue(session, permission, projectId, issueId);
    const started = await this.idempotency.begin(bound.organizationId, idempotencyKey, {
      issueId,
      status: input.status,
      rationale: input.rationale ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    assertIssueTransition(bound.issue.status as IssueStatus, input.status);
    if (input.expectedVersion != null) {
      this.foundation.cas({ version: bound.issue.version }, input.expectedVersion);
    }
    const body = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.issue.update({
        where: { id: bound.issue.id },
        data: {
          status: input.status,
          resolvedByUserId: input.status === "RESOLVED" ? session.userId : bound.issue.resolvedByUserId,
          resolvedAt: input.status === "RESOLVED" ? now : bound.issue.resolvedAt,
          closedByUserId: input.status === "CLOSED" ? session.userId : bound.issue.closedByUserId,
          closedAt: input.status === "CLOSED" ? now : bound.issue.closedAt,
          version: bound.issue.version + 1,
        },
      });
      await tx.issueStatusEvent.create({
        data: {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          issueId: updated.id,
          fromStatus: bound.issue.status,
          toStatus: updated.status,
          actorUserId: session.userId,
          rationale: input.rationale?.trim() || null,
        },
      });
      await this.audit.insert(
        {
          organizationId: updated.organizationId,
          projectId: updated.projectId,
          actorUserId: session.userId,
          eventType: "ISSUE_STATUS_CHANGED",
          resourceType: "issue",
          resourceId: updated.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ from: bound.issue.status, to: updated.status, rationale: input.rationale ?? null }),
        },
        tx,
      );
      if (updated.status === "RESOLVED") {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "ISSUE_RESOLVED",
            resourceType: "issue",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.issue.status }),
          },
          tx,
        );
      }
      if (updated.status === "CLOSED") {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "ISSUE_CLOSED",
            resourceType: "issue",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.issue.status }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.IssueClosed,
          { organizationId: updated.organizationId, projectId: updated.projectId, issueId: updated.id },
          currentCorrelationId(),
          tx,
        );
      }
      if (updated.status === "READY_FOR_REVIEW") {
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.IssueReadyForReview,
          { organizationId: updated.organizationId, projectId: updated.projectId, issueId: updated.id },
          currentCorrelationId(),
          tx,
        );
      }
      if (updated.status === "REOPENED") {
        await this.audit.insert(
          {
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            actorUserId: session.userId,
            eventType: "ISSUE_REOPENED",
            resourceType: "issue",
            resourceId: updated.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ from: bound.issue.status }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.IssueReopened,
          { organizationId: updated.organizationId, projectId: updated.projectId, issueId: updated.id },
          currentCorrelationId(),
          tx,
        );
      }
      const dto = this.toDto(updated);
      await this.idempotency.commit(bound.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async reopen(
    session: RequestSession,
    projectId: string,
    issueId: string,
    idempotencyKey: string | undefined,
    input: { rationale?: string } = {},
  ) {
    return this.transition(session, projectId, issueId, idempotencyKey, {
      status: "REOPENED",
      rationale: input.rationale,
    });
  }

  async addComment(session: RequestSession, projectId: string, issueId: string, input: { body: string }) {
    const bound = await this.requireIssue(session, "issue.comment", projectId, issueId);
    const body = input.body.trim();
    if (!body) {
      throw new CoordinationStateError("Comment body is required");
    }
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.issueComment.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          issueId: bound.issue.id,
          authorUserId: session.userId,
          body,
        },
      });
      await this.audit.insert(
        {
          organizationId: created.organizationId,
          projectId: created.projectId,
          actorUserId: session.userId,
          eventType: "ISSUE_COMMENT_ADDED",
          resourceType: "issue",
          resourceId: bound.issue.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ commentId: created.id }),
        },
        tx,
      );
      return created;
    });
    return this.toCommentDto(comment);
  }

  async listComments(session: RequestSession, projectId: string, issueId: string) {
    const bound = await this.requireIssue(session, "project.read", projectId, issueId);
    const rows = await this.prisma.issueComment.findMany({
      where: { issueId: bound.issue.id, organizationId: bound.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toCommentDto(row));
  }

  async addEvidence(
    session: RequestSession,
    projectId: string,
    issueId: string,
    input: { kind: string; storedObjectId?: string; reference?: string; note?: string },
  ) {
    const bound = await this.requireIssue(session, "issue.add_evidence", projectId, issueId);
    if (!["FILE", "NOTE", "URI"].includes(input.kind)) {
      throw new CoordinationStateError("Evidence kind must be FILE, NOTE, or URI");
    }
    if (input.storedObjectId) {
      if (!UUID_RE.test(input.storedObjectId)) {
        throw new DenyByDefaultError("Client storedObjectId is not authoritative");
      }
      const object = await this.prisma.storedObject.findUnique({ where: { id: input.storedObjectId } });
      if (
        !object ||
        object.organizationId !== bound.organizationId ||
        object.projectId !== bound.project.id
      ) {
        throw new DenyByDefaultError("Evidence object is not bound to the authorized Project");
      }
    }
    const evidence = await this.prisma.$transaction(async (tx) => {
      const created = await tx.issueEvidence.create({
        data: {
          organizationId: bound.organizationId,
          projectId: bound.project.id,
          issueId: bound.issue.id,
          addedByUserId: session.userId,
          kind: input.kind,
          storedObjectId: input.storedObjectId ?? null,
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
        },
      });
      await this.audit.insert(
        {
          organizationId: created.organizationId,
          projectId: created.projectId,
          actorUserId: session.userId,
          eventType: "ISSUE_EVIDENCE_ADDED",
          resourceType: "issue",
          resourceId: bound.issue.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ evidenceId: created.id, kind: created.kind }),
        },
        tx,
      );
      return created;
    });
    return this.toEvidenceDto(evidence);
  }

  async listEvidence(session: RequestSession, projectId: string, issueId: string) {
    const bound = await this.requireIssue(session, "project.read", projectId, issueId);
    const rows = await this.prisma.issueEvidence.findMany({
      where: { issueId: bound.issue.id, organizationId: bound.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toEvidenceDto(row));
  }

  async listStatusHistory(session: RequestSession, projectId: string, issueId: string) {
    const bound = await this.requireIssue(session, "project.read", projectId, issueId);
    return this.prisma.issueStatusEvent.findMany({
      where: { issueId: bound.issue.id, organizationId: bound.organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  private async createIssue(
    session: RequestSession,
    organizationId: string,
    projectId: string,
    idempotencyKey: string | undefined,
    input: {
      origin: "IMPACT" | "MANUAL";
      impactAnalysisId: string | null;
      title: string;
      description?: string;
      severity?: string;
      priority?: string;
      responsibleDisciplineId?: string;
      dueDate?: string;
    },
  ) {
    const started = await this.idempotency.begin(organizationId, idempotencyKey, {
      origin: input.origin,
      impactAnalysisId: input.impactAnalysisId,
      title: input.title,
      description: input.description ?? "",
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const title = input.title.trim();
    if (!title) {
      throw new CoordinationStateError("Issue title is required");
    }
    const severity = this.parseOptionalSeverity(input.severity);
    const priority = this.parseOptionalPriority(input.priority);
    const created = await this.prisma.$transaction(async (tx) => {
      const issue = await tx.issue.create({
        data: {
          organizationId,
          projectId,
          impactAnalysisId: input.impactAnalysisId,
          origin: input.origin,
          title,
          description: input.description?.trim() ?? "",
          status: "OPEN",
          severity,
          priority,
          responsibleDisciplineId: input.responsibleDisciplineId?.trim() || null,
          dueDate: this.parseDueDate(input.dueDate),
          createdByUserId: session.userId,
        },
      });
      await tx.issueStatusEvent.create({
        data: {
          organizationId,
          projectId,
          issueId: issue.id,
          fromStatus: "OPEN",
          toStatus: "OPEN",
          actorUserId: session.userId,
          rationale: "created",
        },
      });
      await this.audit.insert(
        {
          organizationId,
          projectId,
          actorUserId: session.userId,
          eventType: "ISSUE_CREATED",
          resourceType: "issue",
          resourceId: issue.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            origin: issue.origin,
            impactAnalysisId: issue.impactAnalysisId,
            severity: issue.severity,
            priority: issue.priority,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.IssueCreated,
        {
          organizationId,
          projectId,
          issueId: issue.id,
          origin: issue.origin,
          impactAnalysisId: issue.impactAnalysisId,
        },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(issue);
      await this.idempotency.commit(organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  private permissionForTransition(to: IssueStatus): PermissionCode {
    if (issueStatusRequiresResolvePermission(to)) {
      return "issue.resolve";
    }
    if (issueStatusRequiresClosePermission(to)) {
      return "issue.close";
    }
    if (issueStatusRequiresReopenPermission(to)) {
      return "issue.reopen";
    }
    return "issue.update";
  }

  private async requireIssue(
    session: RequestSession,
    permission: PermissionCode,
    projectId: string,
    issueId: string,
  ) {
    const bound = await this.impacts.requireProject(session, permission, projectId);
    if (!UUID_RE.test(issueId)) {
      throw new DenyByDefaultError("Client issueId is not authoritative");
    }
    const issue = await this.prisma.issue.findUnique({ where: { id: issueId } });
    if (!issue || issue.projectId !== bound.project.id || issue.organizationId !== bound.organizationId) {
      throw new DenyByDefaultError("Issue is not bound to the authorized Project");
    }
    return { ...bound, issue };
  }

  private rejectClientAuthority(
    input: { organizationId?: string; projectId?: string },
    organizationId: string,
    projectId: string,
  ) {
    if (input.organizationId && input.organizationId !== organizationId) {
      throw new DenyByDefaultError("Client organizationId is not authoritative");
    }
    if (input.projectId && input.projectId !== projectId) {
      throw new DenyByDefaultError("Client projectId is not authoritative");
    }
  }

  private parseOptionalSeverity(value: string | null | undefined): IssueSeverity | null {
    if (value == null || value === "") {
      return null;
    }
    if (!isIssueSeverity(value)) {
      throw new CoordinationStateError("Unknown Issue severity");
    }
    return value;
  }

  private parseOptionalPriority(value: string | null | undefined): IssuePriority | null {
    if (value == null || value === "") {
      return null;
    }
    if (!isIssuePriority(value)) {
      throw new CoordinationStateError("Unknown Issue priority");
    }
    return value;
  }

  private parseDueDate(value: string | null | undefined): Date | null {
    if (value == null || value === "") {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new CoordinationStateError("Invalid Issue due date");
    }
    return parsed;
  }

  private toDto(row: {
    id: string;
    organizationId: string;
    projectId: string;
    impactAnalysisId: string | null;
    origin: string;
    title: string;
    description: string;
    status: string;
    severity: string | null;
    priority: string | null;
    responsibleDisciplineId: string | null;
    assigneeUserId: string | null;
    dueDate: Date | null;
    createdByUserId: string;
    resolvedByUserId: string | null;
    resolvedAt: Date | null;
    closedByUserId: string | null;
    closedAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      impactAnalysisId: row.impactAnalysisId,
      origin: row.origin,
      title: row.title,
      description: row.description,
      status: row.status,
      severity: row.severity,
      priority: row.priority,
      responsibleDisciplineId: row.responsibleDisciplineId,
      assigneeUserId: row.assigneeUserId,
      dueDate: row.dueDate,
      createdByUserId: row.createdByUserId,
      resolvedByUserId: row.resolvedByUserId,
      resolvedAt: row.resolvedAt,
      closedByUserId: row.closedByUserId,
      closedAt: row.closedAt,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toCommentDto(row: {
    id: string;
    issueId: string;
    authorUserId: string;
    body: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      issueId: row.issueId,
      authorUserId: row.authorUserId,
      body: row.body,
      createdAt: row.createdAt,
    };
  }

  private toEvidenceDto(row: {
    id: string;
    issueId: string;
    addedByUserId: string;
    kind: string;
    storedObjectId: string | null;
    reference: string | null;
    note: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      issueId: row.issueId,
      addedByUserId: row.addedByUserId,
      kind: row.kind,
      storedObjectId: row.storedObjectId,
      reference: row.reference,
      note: row.note,
      createdAt: row.createdAt,
    };
  }
}
