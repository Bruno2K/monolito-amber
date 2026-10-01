import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  OperationsStateError,
  assertBothSidesAuthorized,
  hasPermission,
  linkAuditPayload,
  omitUnauthorizedSection,
  redactSecrets,
  type PermissionCode,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { GateReadAdapter } from "./adapters/gate.read-adapter";
import { OperationsAccess, UUID_RE } from "./operations.access";

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

@Injectable()
export class TraceabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OperationsAccess,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
    private readonly gates: GateReadAdapter,
  ) {}

  async deliverableContext(session: RequestSession, projectId: string, deliverableId: string) {
    const bound = await this.requireDeliverable(session, "project.read", projectId, deliverableId);
    return this.buildContext(session, bound.organizationId, bound.project.id, {
      deliverableId: bound.deliverable.id,
      phaseId: bound.deliverable.phaseId,
      workPackageId: null,
    });
  }

  async workPackageContext(session: RequestSession, projectId: string, workPackageId: string) {
    const bound = await this.requireWorkPackage(session, "project.read", projectId, workPackageId);
    return this.buildContext(session, bound.organizationId, bound.project.id, {
      deliverableId: bound.workPackage.deliverableId,
      phaseId: bound.workPackage.phaseId,
      workPackageId: bound.workPackage.id,
    });
  }

  async linkDocument(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    idempotencyKey: string | undefined,
    input: { documentId: string; organizationId?: string; projectId?: string; status?: string },
  ) {
    if (input.status) {
      throw new OperationsStateError("Document status is not mutated via Ops");
    }
    const source = await this.requireDeliverable(session, "deliverable.update", projectId, deliverableId);
    this.access.rejectClientAuthority(input, source.organizationId, source.project.id);
    let targetGranted = false;
    try {
      await this.authz.assert(session, "document.read", projectId);
      targetGranted = true;
    } catch {
      targetGranted = false;
    }
    assertBothSidesAuthorized(true, targetGranted);
    if (!UUID_RE.test(input.documentId)) {
      throw new DenyByDefaultError("Client documentId is not authoritative");
    }
    const document = await this.prisma.document.findUnique({ where: { id: input.documentId } });
    if (
      !document ||
      document.organizationId !== source.organizationId ||
      document.projectId !== source.project.id
    ) {
      throw new DenyByDefaultError("Document is not bound to the authorized Project");
    }
    const started = await this.idempotency.begin(source.organizationId, idempotencyKey, {
      action: "document-link",
      deliverableId: source.deliverable.id,
      documentId: document.id,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const existing = await this.prisma.deliverableDocument.findUnique({
      where: {
        deliverableId_documentId: { deliverableId: source.deliverable.id, documentId: document.id },
      },
    });
    if (existing) {
      const body = this.toLinkDto(existing);
      await this.idempotency.commit(source.organizationId, started.key, started.hash, 200, body);
      return body;
    }
    const revisionSnapshot = document.currentRevisionId
      ? await this.prisma.revision.findUnique({ where: { id: document.currentRevisionId } })
      : null;
    const snapshot = {
      documentStatus: document.status,
      documentVersion: document.version,
      currentRevisionId: document.currentRevisionId,
      revisionStatus: revisionSnapshot?.status ?? null,
      revisionChecksum: revisionSnapshot?.publishedChecksumSha256 ?? null,
      storedObjectId: revisionSnapshot?.storedObjectId ?? null,
    };
    const created = await this.prisma.$transaction(async (tx) => {
      const link = await tx.deliverableDocument.create({
        data: {
          organizationId: source.organizationId,
          projectId: source.project.id,
          deliverableId: source.deliverable.id,
          documentId: document.id,
          createdByUserId: session.userId,
        },
      });
      const after = await tx.document.findUnique({ where: { id: document.id } });
      if (
        !after ||
        after.status !== snapshot.documentStatus ||
        after.version !== snapshot.documentVersion ||
        after.currentRevisionId !== snapshot.currentRevisionId
      ) {
        throw new OperationsStateError("Document identity/status must not change when linking");
      }
      if (after.currentRevisionId) {
        const revision = await tx.revision.findUnique({ where: { id: after.currentRevisionId } });
        if (
          !revision ||
          revision.status !== snapshot.revisionStatus ||
          revision.publishedChecksumSha256 !== snapshot.revisionChecksum ||
          revision.storedObjectId !== snapshot.storedObjectId
        ) {
          throw new OperationsStateError("Revision bytes/status must not change when linking");
        }
      }
      await this.audit.insert(
        {
          organizationId: link.organizationId,
          projectId: link.projectId,
          actorUserId: session.userId,
          eventType: "DOCUMENT_DELIVERABLE_LINKED",
          resourceType: "deliverable_document",
          resourceId: link.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets(
            linkAuditPayload({
              linkId: link.id,
              deliverableId: link.deliverableId,
              documentId: link.documentId,
            }),
          ),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DocumentDeliverableLinked,
        {
          organizationId: link.organizationId,
          projectId: link.projectId,
          deliverableId: link.deliverableId,
          documentId: link.documentId,
          linkId: link.id,
        },
        currentCorrelationId(),
        tx,
      );
      const body = this.toLinkDto(link);
      await this.idempotency.commit(source.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async unlinkDocument(
    session: RequestSession,
    projectId: string,
    deliverableId: string,
    documentId: string,
    idempotencyKey: string | undefined,
  ) {
    const source = await this.requireDeliverable(session, "deliverable.update", projectId, deliverableId);
    let targetGranted = false;
    try {
      await this.authz.assert(session, "document.read", projectId);
      targetGranted = true;
    } catch {
      targetGranted = false;
    }
    assertBothSidesAuthorized(true, targetGranted);
    if (!UUID_RE.test(documentId)) {
      throw new DenyByDefaultError("Client documentId is not authoritative");
    }
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (
      !document ||
      document.organizationId !== source.organizationId ||
      document.projectId !== source.project.id
    ) {
      throw new DenyByDefaultError("Document is not bound to the authorized Project");
    }
    const started = await this.idempotency.begin(source.organizationId, idempotencyKey, {
      action: "document-unlink",
      deliverableId: source.deliverable.id,
      documentId: document.id,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const existing = await this.prisma.deliverableDocument.findUnique({
      where: {
        deliverableId_documentId: { deliverableId: source.deliverable.id, documentId: document.id },
      },
    });
    if (!existing) {
      throw new DenyByDefaultError("Document is not bound to the authorized Deliverable");
    }
    const snapshot = {
      documentStatus: document.status,
      currentRevisionId: document.currentRevisionId,
    };
    const body = await this.prisma.$transaction(async (tx) => {
      await tx.deliverableDocument.delete({ where: { id: existing.id } });
      const after = await tx.document.findUnique({ where: { id: document.id } });
      if (!after || after.status !== snapshot.documentStatus || after.currentRevisionId !== snapshot.currentRevisionId) {
        throw new OperationsStateError("Document identity/status must not change when unlinking");
      }
      await this.audit.insert(
        {
          organizationId: existing.organizationId,
          projectId: existing.projectId,
          actorUserId: session.userId,
          eventType: "DOCUMENT_DELIVERABLE_UNLINKED",
          resourceType: "deliverable_document",
          resourceId: existing.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets(
            linkAuditPayload({
              linkId: existing.id,
              deliverableId: existing.deliverableId,
              documentId: existing.documentId,
            }),
          ),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DocumentDeliverableUnlinked,
        {
          organizationId: existing.organizationId,
          projectId: existing.projectId,
          deliverableId: existing.deliverableId,
          documentId: existing.documentId,
          linkId: existing.id,
        },
        currentCorrelationId(),
        tx,
      );
      const dto = { ok: true, deliverableId: existing.deliverableId, documentId: existing.documentId };
      await this.idempotency.commit(source.organizationId, started.key, started.hash, 200, dto, tx);
      return dto;
    });
    return body;
  }

  async deliveryContextForDocument(
    session: RequestSession,
    organizationId: string,
    projectId: string,
    documentId: string,
  ) {
    const granted = await this.hasGrant(session, "project.read", projectId);
    if (!granted) {
      return undefined;
    }
    const links = await this.prisma.deliverableDocument.findMany({
      where: { documentId, organizationId, projectId },
      include: {
        deliverable: {
          select: { id: true, code: true, title: true, status: true, phaseId: true, archivedAt: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const items = links
      .filter((row) => !row.deliverable.archivedAt)
      .map((row) => ({
        id: row.deliverable.id,
        code: row.deliverable.code,
        title: row.deliverable.title,
        status: row.deliverable.status,
        phaseId: row.deliverable.phaseId,
        href: {
          ui: `/projects/${projectId}/deliverables?inspect=${row.deliverable.id}`,
          api: `/api/v1/projects/${projectId}/deliverables/${row.deliverable.id}`,
        },
      }));
    return omitUnauthorizedSection(true, items);
  }

  async deliveryContextForIssue(
    session: RequestSession,
    organizationId: string,
    projectId: string,
    issueId: string,
  ) {
    const granted = await this.hasGrant(session, "project.read", projectId);
    if (!granted) {
      return undefined;
    }
    const tasks = await this.prisma.task.findMany({
      where: { issueId, organizationId, projectId },
      select: { id: true, phaseId: true, deliverableId: true, workPackageId: true, milestoneId: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    const items = tasks
      .filter((row) => row.phaseId || row.deliverableId || row.workPackageId)
      .map((row) => ({
        taskId: row.id,
        phaseId: row.phaseId,
        deliverableId: row.deliverableId,
        workPackageId: row.workPackageId,
        milestoneId: row.milestoneId,
        status: row.status,
      }));
    return omitUnauthorizedSection(true, items);
  }

  private async buildContext(
    session: RequestSession,
    organizationId: string,
    projectId: string,
    filter: { deliverableId: string | null; phaseId: string; workPackageId: string | null },
  ) {
    const permissions = await this.permissionSet(session, projectId);
    const canDocuments = permissions.has("document.read");
    const canGates = permissions.has("gate.read");
    const canLink = permissions.has("deliverable.update") && canDocuments;

    const payload: Record<string, unknown> = {
      organizationId,
      projectId,
      deliverableId: filter.deliverableId,
      workPackageId: filter.workPackageId,
      phaseId: filter.phaseId,
      canLinkDocuments: canLink,
    };

    if (canDocuments && filter.deliverableId) {
      const links = await this.prisma.deliverableDocument.findMany({
        where: { deliverableId: filter.deliverableId, organizationId, projectId },
        include: {
          document: {
            select: {
              id: true,
              code: true,
              title: true,
              status: true,
              currentRevisionId: true,
              archivedAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      const documents: Array<{
        id: string;
        code: string;
        title: string;
        status: string;
        currentRevision: { id: string; revisionCode: string; status: string; publishedAt: Date | null } | null;
      }> = [];
      for (const link of links) {
        const current = link.document.currentRevisionId
          ? await this.prisma.revision.findFirst({
              where: {
                id: link.document.currentRevisionId,
                documentId: link.document.id,
                organizationId,
                projectId,
              },
              select: { id: true, revisionCode: true, status: true, publishedAt: true },
            })
          : null;
        documents.push({
          id: link.document.id,
          code: link.document.code,
          title: link.document.title,
          status: link.document.status,
          currentRevision: current,
        });
      }
      payload.documents = documents;
    } else if (canDocuments) {
      payload.documents = [];
    }

    const taskWhere =
      filter.workPackageId != null
        ? { workPackageId: filter.workPackageId, organizationId, projectId }
        : filter.deliverableId
          ? { deliverableId: filter.deliverableId, organizationId, projectId }
          : { phaseId: filter.phaseId, organizationId, projectId, deliverableId: null, workPackageId: null };
    const tasks = await this.prisma.task.findMany({
      where: taskWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        progressPercent: true,
        dueDate: true,
        issueId: true,
        milestoneId: true,
        workPackageId: true,
        deliverableId: true,
        phaseId: true,
      },
    });
    payload.tasks = tasks.map((row) => ({
      ...row,
      dueDate: iso(row.dueDate),
    }));

    const milestoneWhere = filter.deliverableId
      ? { deliverableId: filter.deliverableId, organizationId, projectId }
      : { phaseId: filter.phaseId, organizationId, projectId };
    const milestones = await this.prisma.milestone.findMany({
      where: milestoneWhere,
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, status: true, targetDate: true, phaseId: true, deliverableId: true },
    });
    payload.milestones = milestones.map((row) => ({
      ...row,
      recordedStatus: row.status,
      targetDate: iso(row.targetDate),
    }));

    const issueIds = [...new Set(tasks.map((row) => row.issueId).filter(Boolean))] as string[];
    const issues =
      issueIds.length === 0
        ? []
        : await this.prisma.issue.findMany({
            where: { id: { in: issueIds }, organizationId, projectId },
            orderBy: { createdAt: "asc" },
            select: { id: true, title: true, status: true, origin: true, severity: true, priority: true },
          });
    payload.issues = issues;

    if (canGates) {
      payload.gates = (await this.gates.listGates(organizationId, projectId)).map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        lastEvaluatedAt: iso(row.lastEvaluatedAt),
        releasedAt: iso(row.releasedAt),
        releaseKind: row.releaseKind,
        readOnly: true,
      }));
    }

    return payload;
  }

  private async permissionSet(session: RequestSession, projectId: string): Promise<Set<PermissionCode>> {
    const context = await this.authz.assert(session, "project.read", projectId);
    return new Set(hasPermission(context, "project.read") ? this.authz.permissionsOf(context) : []);
  }

  private async hasGrant(session: RequestSession, permission: PermissionCode, projectId: string): Promise<boolean> {
    try {
      await this.authz.assert(session, permission, projectId);
      return true;
    } catch {
      return false;
    }
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

  private toLinkDto(row: {
    id: string;
    organizationId: string;
    projectId: string;
    deliverableId: string;
    documentId: string;
    createdByUserId: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      deliverableId: row.deliverableId,
      documentId: row.documentId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
    };
  }
}
