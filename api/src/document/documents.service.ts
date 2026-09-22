import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  FileIntegrityError,
  ImmutableRevisionError,
  NamingValidationError,
  OptimisticLockError,
  OUTBOX_EVENT_TYPES,
  RevisionStateError,
  assertCanApprove,
  assertCanMakeCurrent,
  assertCanPublish,
  assertCanReject,
  assertCanReview,
  assertDraftMutable,
  assertFileAccessAllowed,
  assertNamingValid,
  assertRevisionApprovalSoD,
  assertRevisionMakeCurrentSoD,
  assertTenantBoundObjectKey,
  defaultNamingValidator,
  documentObjectKey,
  isRollbackToOlderApproved,
  redactSecrets,
  sanitizeObjectFileName,
  type CurrentRevisionChangedPayload,
  type ScanStatus,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { FilesService } from "../files/files.service";
import { UPLOAD_TTL_MS, signObjectGrant } from "../files/object-storage";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { OutboxProcessor } from "../foundation/outbox.processor";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxProcessor,
  ) {}

  async create(
    session: RequestSession,
    projectId: string,
    input: { title: string; code: string; disciplineId?: string; documentType?: string },
  ) {
    const context = await this.authz.assert(session, "document.create", projectId);
    const project = await this.requireProject(projectId, context.organizationId);
    const document = await this.prisma.document.create({
      data: {
        organizationId: project.organizationId,
        projectId: project.id,
        title: input.title.trim(),
        code: input.code.trim(),
        disciplineId: input.disciplineId?.trim() || null,
        documentType: input.documentType?.trim() || null,
        status: "ACTIVE",
      },
    });
    await this.audit.insert({
      organizationId: document.organizationId,
      projectId: document.projectId,
      actorUserId: session.userId,
      eventType: "DOCUMENT_CREATED",
      resourceType: "document",
      resourceId: document.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ code: document.code, title: document.title }),
    });
    return this.toDocumentDto(document);
  }

  async list(session: RequestSession, projectId: string) {
    const context = await this.authz.assert(session, "document.read", projectId);
    await this.requireProject(projectId, context.organizationId);
    const rows = await this.prisma.document.findMany({
      where: { projectId, organizationId: context.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toDocumentDto(row));
  }

  async get(session: RequestSession, projectId: string, documentId: string) {
    const bound = await this.requireDocument(session, "document.read", projectId, documentId);
    return this.toDocumentDto(bound.document);
  }

  async archive(session: RequestSession, projectId: string, documentId: string) {
    const bound = await this.requireDocument(session, "document.archive", projectId, documentId);
    if (bound.document.status === "ARCHIVED") {
      return this.toDocumentDto(bound.document);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.document.update({
        where: { id: bound.document.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DocumentArchived,
        { organizationId: next.organizationId, projectId: next.projectId, documentId: next.id },
        currentCorrelationId(),
        tx,
      );
      await this.audit.insert(
        {
          organizationId: next.organizationId,
          projectId: next.projectId,
          actorUserId: session.userId,
          eventType: "DOCUMENT_ARCHIVED",
          resourceType: "document",
          resourceId: next.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ code: next.code }),
        },
        tx,
      );
      return next;
    });
    return this.toDocumentDto(updated);
  }

  async listRevisions(session: RequestSession, projectId: string, documentId: string) {
    const bound = await this.requireDocument(session, "document.read", projectId, documentId);
    const rows = await this.prisma.revision.findMany({
      where: { documentId: bound.document.id, organizationId: bound.document.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toRevisionDto(row, bound.document.currentRevisionId));
  }

  async createRevision(
    session: RequestSession,
    projectId: string,
    documentId: string,
    input: { revisionCode: string; fileName?: string },
  ) {
    const bound = await this.requireDocument(session, "revision.create", projectId, documentId);
    this.assertDocumentActive(bound.document.status);
    const revision = await this.prisma.revision.create({
      data: {
        organizationId: bound.document.organizationId,
        projectId: bound.document.projectId,
        documentId: bound.document.id,
        revisionCode: input.revisionCode.trim(),
        fileName: input.fileName ? sanitizeObjectFileName(input.fileName) : null,
        status: "DRAFT",
        createdByUserId: session.userId,
      },
    });
    await this.audit.insert({
      organizationId: revision.organizationId,
      projectId: revision.projectId,
      actorUserId: session.userId,
      eventType: "REVISION_DRAFT_CREATED",
      resourceType: "revision",
      resourceId: revision.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ documentId: revision.documentId, revisionCode: revision.revisionCode }),
    });
    return this.toRevisionDto(revision, bound.document.currentRevisionId);
  }

  async getRevision(session: RequestSession, projectId: string, documentId: string, revisionId: string) {
    const bound = await this.requireRevision(session, "document.read", projectId, documentId, revisionId);
    return this.toRevisionDto(bound.revision, bound.document.currentRevisionId);
  }

  async updateDraft(
    session: RequestSession,
    projectId: string,
    documentId: string,
    revisionId: string,
    input: { revisionCode?: string; fileName?: string },
  ) {
    const bound = await this.requireRevision(session, "revision.create", projectId, documentId, revisionId);
    this.assertDocumentActive(bound.document.status);
    assertDraftMutable(bound.revision.status as "DRAFT");
    const updated = await this.prisma.revision.update({
      where: { id: bound.revision.id },
      data: {
        revisionCode: input.revisionCode?.trim() || bound.revision.revisionCode,
        fileName: input.fileName ? sanitizeObjectFileName(input.fileName) : bound.revision.fileName,
      },
    });
    return this.toRevisionDto(updated, bound.document.currentRevisionId);
  }

  async createUploadUrl(session: RequestSession, projectId: string, documentId: string, revisionId: string) {
    const bound = await this.requireRevision(session, "revision.create", projectId, documentId, revisionId);
    this.assertDocumentActive(bound.document.status);
    assertDraftMutable(bound.revision.status as "DRAFT");
    this.files.assertNewUpload();
    const fileName = bound.revision.fileName || "upload.bin";
    const storageKey = documentObjectKey({
      organizationId: bound.document.organizationId,
      projectId: bound.document.projectId,
      documentId: bound.document.id,
      revisionId: bound.revision.id,
      fileName,
    });
    const token = signObjectGrant({
      purpose: "upload",
      organizationId: bound.document.organizationId,
      projectId: bound.document.projectId,
      documentId: bound.document.id,
      revisionId: bound.revision.id,
      storageKey,
      exp: Date.now() + UPLOAD_TTL_MS,
    });
    return {
      storageKey,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS).toISOString(),
      uploadUrl: `/api/v1/files/objects/${token}`,
    };
  }

  async completeUpload(
    session: RequestSession,
    projectId: string,
    documentId: string,
    revisionId: string,
    input: { checksumSha256: string; mimeType?: string; fileName?: string },
  ) {
    const bound = await this.requireRevision(session, "revision.create", projectId, documentId, revisionId);
    this.assertDocumentActive(bound.document.status);
    assertDraftMutable(bound.revision.status as "DRAFT");
    this.files.assertNewUpload();
    const fileName = input.fileName
      ? sanitizeObjectFileName(input.fileName)
      : bound.revision.fileName || "upload.bin";
    const storageKey = documentObjectKey({
      organizationId: bound.document.organizationId,
      projectId: bound.document.projectId,
      documentId: bound.document.id,
      revisionId: bound.revision.id,
      fileName,
    });
    assertTenantBoundObjectKey(storageKey, {
      organizationId: bound.document.organizationId,
      projectId: bound.document.projectId,
      documentId: bound.document.id,
      revisionId: bound.revision.id,
    });
    const checksum = input.checksumSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(checksum)) {
      throw new FileIntegrityError("checksumSha256 must be a SHA-256 hex digest");
    }
    let verified: { byteSize: number };
    try {
      verified = await this.files.verifyUploadedObject(storageKey, checksum);
    } catch {
      throw new FileIntegrityError("Uploaded object is missing or checksum does not match");
    }
    const duplicate = await this.prisma.storedObject.findFirst({
      where: {
        organizationId: bound.document.organizationId,
        projectId: bound.document.projectId,
        checksumSha256: checksum,
      },
    });
    const object = await this.prisma.$transaction(async (tx) => {
      const created = await tx.storedObject.create({
        data: {
          organizationId: bound.document.organizationId,
          projectId: bound.document.projectId,
          documentId: bound.document.id,
          storageKey,
          checksumSha256: checksum,
          mimeType: input.mimeType?.trim() || "application/octet-stream",
          byteSize: verified.byteSize,
          originalFileName: fileName,
          scanStatus: "PENDING",
        },
      });
      await tx.revision.update({
        where: { id: bound.revision.id },
        data: { storedObjectId: created.id, fileName },
      });
      return created;
    });
    return {
      storedObjectId: object.id,
      scanStatus: object.scanStatus,
      checksumSha256: object.checksumSha256,
      byteSize: object.byteSize,
      duplicateWarning: Boolean(duplicate),
    };
  }

  async publish(
    session: RequestSession,
    projectId: string,
    documentId: string,
    revisionId: string,
    idempotencyKey: string | undefined,
  ) {
    const bound = await this.requireRevision(session, "revision.publish", projectId, documentId, revisionId);
    const started = await this.idempotency.begin(bound.document.organizationId, idempotencyKey, {
      action: "publish",
      revisionId,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.assertDocumentActive(bound.document.status);
    assertCanPublish(bound.revision.status as "DRAFT");
    assertNamingValid(
      {
        documentCode: bound.document.code,
        revisionCode: bound.revision.revisionCode,
        title: bound.document.title,
        disciplineId: bound.document.disciplineId,
        documentType: bound.document.documentType,
        fileName: bound.revision.fileName,
      },
      defaultNamingValidator,
    );
    if (!bound.revision.storedObjectId) {
      throw new FileIntegrityError("Revision has no stored object; complete-upload is required before publish");
    }
    const object = await this.prisma.storedObject.findUnique({ where: { id: bound.revision.storedObjectId } });
    if (!object || object.organizationId !== bound.document.organizationId) {
      throw new DenyByDefaultError("Stored object is not bound to the authorized Organization");
    }
    assertFileAccessAllowed(object.scanStatus as ScanStatus, "download");
    const published = await this.prisma.$transaction(async (tx) => {
      const next = await tx.revision.update({
        where: { id: bound.revision.id },
        data: {
          status: "PUBLISHED",
          publishedByUserId: session.userId,
          publishedAt: new Date(),
          publishedChecksumSha256: object.checksumSha256,
        },
      });
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.RevisionPublished,
        { organizationId: next.organizationId, projectId: next.projectId, documentId: next.documentId, revisionId: next.id },
        currentCorrelationId(),
        tx,
      );
      await this.audit.insert(
        {
          organizationId: next.organizationId,
          projectId: next.projectId,
          actorUserId: session.userId,
          eventType: "REVISION_PUBLISHED",
          resourceType: "revision",
          resourceId: next.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            documentId: next.documentId,
            revisionCode: next.revisionCode,
            checksumSha256: next.publishedChecksumSha256,
          }),
        },
        tx,
      );
      const body = this.toRevisionDto(next, bound.document.currentRevisionId);
      await this.idempotency.commit(bound.document.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return published;
  }

  async review(session: RequestSession, projectId: string, documentId: string, revisionId: string) {
    const bound = await this.requireRevision(session, "revision.review", projectId, documentId, revisionId);
    this.assertDocumentActive(bound.document.status);
    assertCanReview(bound.revision.status as "PUBLISHED");
    const updated = await this.prisma.revision.update({
      where: { id: bound.revision.id },
      data: { status: "UNDER_REVIEW", reviewedByUserId: session.userId, reviewedAt: new Date() },
    });
    await this.audit.insert({
      organizationId: updated.organizationId,
      projectId: updated.projectId,
      actorUserId: session.userId,
      eventType: "REVISION_REVIEW_STARTED",
      resourceType: "revision",
      resourceId: updated.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ documentId: updated.documentId }),
    });
    return this.toRevisionDto(updated, bound.document.currentRevisionId);
  }

  async approve(
    session: RequestSession,
    projectId: string,
    documentId: string,
    revisionId: string,
    idempotencyKey: string | undefined,
    input: { comment?: string } = {},
  ) {
    const bound = await this.requireRevision(session, "revision.approve", projectId, documentId, revisionId);
    const started = await this.idempotency.begin(bound.document.organizationId, idempotencyKey, {
      action: "approve",
      revisionId,
      comment: input.comment ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.assertDocumentActive(bound.document.status);
    assertCanApprove(bound.revision.status as "UNDER_REVIEW");
    if (!bound.revision.publishedByUserId) {
      throw new RevisionStateError("Revision has no publisher; cannot evaluate SoD");
    }
    assertRevisionApprovalSoD({
      actorUserId: session.userId,
      publishedByUserId: bound.revision.publishedByUserId,
    });
    const approved = await this.prisma.$transaction(async (tx) => {
      const next = await tx.revision.update({
        where: { id: bound.revision.id },
        data: { status: "APPROVED", approvedByUserId: session.userId, approvedAt: new Date() },
      });
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.RevisionApproved,
        { organizationId: next.organizationId, projectId: next.projectId, documentId: next.documentId, revisionId: next.id },
        currentCorrelationId(),
        tx,
      );
      await this.audit.insert(
        {
          organizationId: next.organizationId,
          projectId: next.projectId,
          actorUserId: session.userId,
          eventType: "REVISION_APPROVED",
          resourceType: "revision",
          resourceId: next.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ documentId: next.documentId, comment: input.comment ?? null }),
        },
        tx,
      );
      const body = this.toRevisionDto(next, bound.document.currentRevisionId);
      await this.idempotency.commit(bound.document.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return approved;
  }

  async reject(
    session: RequestSession,
    projectId: string,
    documentId: string,
    revisionId: string,
    idempotencyKey: string | undefined,
    input: { reason: string },
  ) {
    const bound = await this.requireRevision(session, "revision.reject", projectId, documentId, revisionId);
    const started = await this.idempotency.begin(bound.document.organizationId, idempotencyKey, {
      action: "reject",
      revisionId,
      reason: input.reason,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.assertDocumentActive(bound.document.status);
    assertCanReject(bound.revision.status as "UNDER_REVIEW");
    const reason = input.reason.trim();
    if (!reason) {
      throw new NamingValidationError("Rejection reason is required");
    }
    if (!bound.revision.publishedByUserId) {
      throw new RevisionStateError("Revision has no publisher; cannot evaluate SoD");
    }
    assertRevisionApprovalSoD({
      actorUserId: session.userId,
      publishedByUserId: bound.revision.publishedByUserId,
    });
    const rejected = await this.prisma.$transaction(async (tx) => {
      const next = await tx.revision.update({
        where: { id: bound.revision.id },
        data: {
          status: "REJECTED",
          rejectedByUserId: session.userId,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      });
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.RevisionRejected,
        { organizationId: next.organizationId, projectId: next.projectId, documentId: next.documentId, revisionId: next.id },
        currentCorrelationId(),
        tx,
      );
      await this.audit.insert(
        {
          organizationId: next.organizationId,
          projectId: next.projectId,
          actorUserId: session.userId,
          eventType: "REVISION_REJECTED",
          resourceType: "revision",
          resourceId: next.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ documentId: next.documentId, reason }),
        },
        tx,
      );
      const body = this.toRevisionDto(next, bound.document.currentRevisionId);
      await this.idempotency.commit(bound.document.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return rejected;
  }

  async makeCurrent(
    session: RequestSession,
    projectId: string,
    documentId: string,
    revisionId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion: number; reason?: string },
  ) {
    const bound = await this.requireRevision(session, "revision.make_current", projectId, documentId, revisionId);
    const started = await this.idempotency.begin(bound.document.organizationId, idempotencyKey, {
      action: "make_current",
      revisionId,
      expectedVersion: input.expectedVersion,
      reason: input.reason ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    this.assertDocumentActive(bound.document.status);
    assertCanMakeCurrent(bound.revision.status as "APPROVED");
    if (!bound.revision.publishedByUserId) {
      throw new RevisionStateError("Revision has no publisher; cannot evaluate SoD");
    }
    assertRevisionMakeCurrentSoD({
      actorUserId: session.userId,
      publishedByUserId: bound.revision.publishedByUserId,
      revisionStatus: bound.revision.status,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; version: number; current_revision_id: string | null }[]>`
        SELECT id, version, current_revision_id
        FROM document.documents
        WHERE id = ${bound.document.id}::uuid
        FOR UPDATE
      `;
      const row = locked[0];
      if (!row) {
        throw new DenyByDefaultError("Document is not bound to the authorized Organization");
      }
      this.foundation.cas({ version: row.version }, input.expectedVersion);
      if (row.current_revision_id === bound.revision.id) {
        const already = {
          documentId: bound.document.id,
          currentRevisionId: bound.revision.id,
          previousRevisionId: bound.revision.id,
          version: row.version,
          isRollback: false,
        };
        await this.idempotency.commit(bound.document.organizationId, started.key, started.hash, 200, already, tx);
        return already;
      }

      let currentPublishedAt: Date | null = null;
      if (row.current_revision_id) {
        const current = await tx.revision.findUnique({ where: { id: row.current_revision_id } });
        currentPublishedAt = current?.publishedAt ?? null;
      }
      const isRollback = isRollbackToOlderApproved({
        targetPublishedAt: bound.revision.publishedAt ?? bound.revision.createdAt,
        currentPublishedAt,
      });
      if (isRollback && !input.reason?.trim()) {
        throw new RevisionStateError("Rollback to a previously approved Revision requires a reason");
      }

      const nextVersion = row.version + 1;
      const updated = await tx.document.update({
        where: { id: bound.document.id, version: row.version },
        data: { currentRevisionId: bound.revision.id, version: nextVersion },
      });
      if (updated.version !== nextVersion) {
        throw new OptimisticLockError();
      }

      const payload: CurrentRevisionChangedPayload = {
        organizationId: bound.document.organizationId,
        projectId: bound.document.projectId,
        documentId: bound.document.id,
        previousRevisionId: row.current_revision_id,
        newRevisionId: bound.revision.id,
        actorUserId: session.userId,
        reason: input.reason?.trim() || undefined,
        isRollback,
      };
      const currentChanged = await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.CurrentRevisionChanged,
        payload,
        currentCorrelationId(),
        tx,
      );
      const newBase = await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.NewBaseEstablished,
        payload,
        currentCorrelationId(),
        tx,
      );
      await this.outbox.processIds([currentChanged.id, newBase.id], tx);
      await this.audit.insert(
        {
          organizationId: bound.document.organizationId,
          projectId: bound.document.projectId,
          actorUserId: session.userId,
          eventType: isRollback ? "REVISION_ROLLBACK" : "CURRENT_REVISION_CHANGED",
          resourceType: "document",
          resourceId: bound.document.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            previousRevisionId: payload.previousRevisionId,
            newRevisionId: payload.newRevisionId,
            isRollback,
            reason: payload.reason ?? null,
          }),
        },
        tx,
      );
      if (isRollback) {
        await this.audit.insert(
          {
            organizationId: bound.document.organizationId,
            projectId: bound.document.projectId,
            actorUserId: session.userId,
            eventType: "CURRENT_REVISION_CHANGED",
            resourceType: "document",
            resourceId: bound.document.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({
              previousRevisionId: payload.previousRevisionId,
              newRevisionId: payload.newRevisionId,
              isRollback: true,
            }),
          },
          tx,
        );
      }
      const body = {
        documentId: updated.id,
        currentRevisionId: updated.currentRevisionId,
        previousRevisionId: payload.previousRevisionId,
        version: updated.version,
        isRollback,
      };
      await this.idempotency.commit(bound.document.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return result;
  }

  async downloadUrl(session: RequestSession, projectId: string, documentId: string, revisionId: string) {
    const bound = await this.requireRevision(session, "document.read", projectId, documentId, revisionId);
    if (!bound.revision.storedObjectId) {
      throw new FileIntegrityError("Revision has no stored object");
    }
    const object = await this.prisma.storedObject.findUnique({ where: { id: bound.revision.storedObjectId } });
    if (!object || object.organizationId !== bound.document.organizationId) {
      throw new DenyByDefaultError("Stored object is not bound to the authorized Organization");
    }
    await this.files.authorizeDownload(object.id, "download");
    const minted = this.files.mintDownloadUrl({
      organizationId: bound.document.organizationId,
      projectId: bound.document.projectId,
      documentId: bound.document.id,
      revisionId: bound.revision.id,
      storageKey: object.storageKey,
    });
    return { expiresAt: minted.expiresAt, downloadUrl: minted.url, scanStatus: object.scanStatus };
  }

  private async requireProject(projectId: string, organizationId: string) {
    if (!UUID_RE.test(projectId)) {
      throw new DenyByDefaultError("Client projectId is not authoritative");
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== organizationId) {
      throw new DenyByDefaultError("Project is not bound to the authorized Organization");
    }
    return project;
  }

  private async requireDocument(
    session: RequestSession,
    permission: "document.read" | "document.create" | "document.archive" | "revision.create" | "revision.publish" | "revision.review" | "revision.approve" | "revision.reject" | "revision.make_current",
    projectId: string,
    documentId: string,
  ) {
    const context = await this.authz.assert(session, permission, projectId);
    if (!UUID_RE.test(documentId)) {
      throw new DenyByDefaultError("Client documentId is not authoritative");
    }
    await this.requireProject(projectId, context.organizationId);
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (
      !document ||
      document.projectId !== projectId ||
      document.organizationId !== context.organizationId
    ) {
      throw new DenyByDefaultError("Document is not bound to the authorized Project");
    }
    return { document, context };
  }

  private async requireRevision(
    session: RequestSession,
    permission: Parameters<DocumentsService["requireDocument"]>[1],
    projectId: string,
    documentId: string,
    revisionId: string,
  ) {
    const bound = await this.requireDocument(session, permission, projectId, documentId);
    if (!UUID_RE.test(revisionId)) {
      throw new DenyByDefaultError("Client revisionId is not authoritative");
    }
    const revision = await this.prisma.revision.findUnique({ where: { id: revisionId } });
    if (
      !revision ||
      revision.documentId !== bound.document.id ||
      revision.projectId !== projectId ||
      revision.organizationId !== bound.document.organizationId
    ) {
      throw new DenyByDefaultError("Revision is not bound to the authorized Document");
    }
    return { ...bound, revision };
  }

  private assertDocumentActive(status: string): void {
    if (status !== "ACTIVE") {
      throw new ImmutableRevisionError("Archived documents do not accept revision mutations");
    }
  }

  private toDocumentDto(document: {
    id: string;
    organizationId: string;
    projectId: string;
    disciplineId: string | null;
    documentType: string | null;
    code: string;
    title: string;
    status: string;
    currentRevisionId: string | null;
    version: number;
    archivedAt: Date | null;
  }) {
    return {
      id: document.id,
      organizationId: document.organizationId,
      projectId: document.projectId,
      disciplineId: document.disciplineId,
      documentType: document.documentType,
      code: document.code,
      title: document.title,
      status: document.status,
      currentRevisionId: document.currentRevisionId,
      version: document.version,
      archivedAt: document.archivedAt,
    };
  }

  private toRevisionDto(
    revision: {
      id: string;
      documentId: string;
      projectId: string;
      organizationId: string;
      revisionCode: string;
      storedObjectId: string | null;
      fileName: string | null;
      publishedChecksumSha256: string | null;
      status: string;
      createdByUserId: string;
      publishedByUserId: string | null;
      publishedAt: Date | null;
      reviewedByUserId: string | null;
      reviewedAt: Date | null;
      approvedByUserId: string | null;
      approvedAt: Date | null;
      rejectedByUserId: string | null;
      rejectedAt: Date | null;
      rejectionReason: string | null;
    },
    currentRevisionId: string | null,
  ) {
    return {
      id: revision.id,
      documentId: revision.documentId,
      projectId: revision.projectId,
      organizationId: revision.organizationId,
      revisionCode: revision.revisionCode,
      storedObjectId: revision.storedObjectId,
      fileName: revision.fileName,
      checksumSha256: revision.publishedChecksumSha256,
      status: revision.status,
      isCurrent: currentRevisionId === revision.id,
      createdByUserId: revision.createdByUserId,
      publishedByUserId: revision.publishedByUserId,
      publishedAt: revision.publishedAt,
      reviewedByUserId: revision.reviewedByUserId,
      reviewedAt: revision.reviewedAt,
      approvedByUserId: revision.approvedByUserId,
      approvedAt: revision.approvedAt,
      rejectedByUserId: revision.rejectedByUserId,
      rejectedAt: revision.rejectedAt,
      rejectionReason: revision.rejectionReason,
    };
  }
}
