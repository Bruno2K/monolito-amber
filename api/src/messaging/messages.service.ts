import { Injectable } from "@nestjs/common";
import {
  MessagingStateError,
  OUTBOX_EVENT_TYPES,
  assertAuthorMayMutateOwnMessage,
  assertMaySend,
  compareMessageCursor,
  deepLinkPreviewRequiresTargetAuthorization,
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
import { MessagingAccess, UUID_RE } from "./messaging.access";
import {
  MESSAGE_BODY_MAX,
  type ResourceLink,
  clampPageSize,
  cursorAfterWhere,
  decodeCursor,
  decodeStoredBody,
  encodeCursor,
  encodeStoredBody,
  isResourceLinkType,
  messageLifecycle,
} from "./messaging.codec";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MessagingAccess,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    session: RequestSession,
    conversationId: string,
    query: { cursor?: string; pageSize?: string },
  ) {
    const bound = await this.access.requireConversation(session, conversationId);
    const pageSize = clampPageSize(query.pageSize);
    const cursor = decodeCursor(query.cursor);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: bound.conversation.id,
        organizationId: bound.actor.organizationId,
        ...(cursor ? cursorAfterWhere(cursor) : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: pageSize + 1,
    });
    const page = rows.slice(0, pageSize);
    const items = await Promise.all(page.map((row) => this.toDto(session, row)));
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > pageSize && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  async send(
    session: RequestSession,
    conversationId: string,
    idempotencyKey: string | undefined,
    input: { body: string; resourceLinks?: ResourceLink[]; organizationId?: string },
  ) {
    const bound = await this.access.requireConversation(session, conversationId, "read_write");
    if (input.organizationId && input.organizationId !== bound.actor.organizationId) {
      this.access.omit("Client organizationId is not authoritative");
    }
    assertMaySend(bound.access);
    const text = this.requireBody(input.body);
    const links = this.normalizeLinks(input.resourceLinks);
    const started = await this.idempotency.begin(bound.actor.organizationId, idempotencyKey, {
      conversationId: bound.conversation.id,
      body: text,
      resourceLinks: links,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const stored = encodeStoredBody(text, links);
    const created = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          organizationId: bound.actor.organizationId,
          conversationId: bound.conversation.id,
          authorOrganizationMembershipId: bound.actor.membershipId,
          body: stored,
        },
      });
      await tx.messageReadState.upsert({
        where: {
          conversationId_organizationMembershipId: {
            conversationId: bound.conversation.id,
            organizationMembershipId: bound.actor.membershipId,
          },
        },
        create: {
          conversationId: bound.conversation.id,
          organizationMembershipId: bound.actor.membershipId,
          lastReadMessageId: message.id,
          lastReadCreatedAt: message.createdAt,
        },
        update: {
          lastReadMessageId: message.id,
          lastReadCreatedAt: message.createdAt,
        },
      });
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.MessageSent,
        {
          organizationId: bound.actor.organizationId,
          conversationId: bound.conversation.id,
          messageId: message.id,
          authorOrganizationMembershipId: bound.actor.membershipId,
        },
        currentCorrelationId(),
        tx,
      );
      const body = await this.toDto(session, message);
      await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async edit(
    session: RequestSession,
    conversationId: string,
    messageId: string,
    input: { body: string; expectedVersion: number; resourceLinks?: ResourceLink[] },
  ) {
    const bound = await this.access.requireConversation(session, conversationId);
    const message = await this.requireMessage(bound.conversation.id, bound.actor.organizationId, messageId);
    if (message.deletedAt) {
      throw new MessagingStateError("Tombstoned messages cannot be edited");
    }
    assertAuthorMayMutateOwnMessage({
      actorMembershipId: bound.actor.membershipId,
      authorMembershipId: message.authorOrganizationMembershipId,
      conversationAccess: bound.access,
      action: "edit",
    });
    this.requireExpectedVersion(message.version, input.expectedVersion);
    const text = this.requireBody(input.body);
    const links = this.normalizeLinks(input.resourceLinks ?? decodeStoredBody(message.body).links);
    const next = this.foundation.cas(message, input.expectedVersion);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.message.update({
        where: { id: message.id, version: message.version },
        data: {
          body: encodeStoredBody(text, links),
          editedAt: new Date(),
          version: next.version,
        },
      });
      await this.audit.insert(
        {
          organizationId: bound.actor.organizationId,
          actorUserId: session.userId,
          eventType: "MESSAGE_EDITED",
          resourceType: "message",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            conversationId: bound.conversation.id,
            version: row.version,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.MessageEdited,
        {
          organizationId: bound.actor.organizationId,
          conversationId: bound.conversation.id,
          messageId: row.id,
        },
        currentCorrelationId(),
        tx,
      );
      return row;
    });
    return this.toDto(session, updated);
  }

  async tombstone(
    session: RequestSession,
    conversationId: string,
    messageId: string,
    idempotencyKey: string | undefined,
    input: { expectedVersion: number },
  ) {
    const bound = await this.access.requireConversation(session, conversationId);
    const started = await this.idempotency.begin(bound.actor.organizationId, idempotencyKey, {
      conversationId: bound.conversation.id,
      messageId,
      expectedVersion: input.expectedVersion,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const message = await this.requireMessage(bound.conversation.id, bound.actor.organizationId, messageId);
    assertAuthorMayMutateOwnMessage({
      actorMembershipId: bound.actor.membershipId,
      authorMembershipId: message.authorOrganizationMembershipId,
      conversationAccess: bound.access,
      action: "tombstone",
    });
    if (message.deletedAt) {
      const body = await this.toDto(session, message);
      await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 200, body);
      return body;
    }
    this.requireExpectedVersion(message.version, input.expectedVersion);
    const next = this.foundation.cas(message, input.expectedVersion);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.message.update({
        where: { id: message.id, version: message.version },
        data: {
          deletedAt: new Date(),
          version: next.version,
        },
      });
      await this.audit.insert(
        {
          organizationId: bound.actor.organizationId,
          actorUserId: session.userId,
          eventType: "MESSAGE_DELETED",
          resourceType: "message",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({
            conversationId: bound.conversation.id,
            version: row.version,
          }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.MessageDeleted,
        {
          organizationId: bound.actor.organizationId,
          conversationId: bound.conversation.id,
          messageId: row.id,
        },
        currentCorrelationId(),
        tx,
      );
      const body = await this.toDto(session, row);
      await this.idempotency.commit(bound.actor.organizationId, started.key, started.hash, 200, body, tx);
      return body;
    });
    return updated;
  }

  async updateReadState(
    session: RequestSession,
    conversationId: string,
    input: { lastReadMessageId: string },
  ) {
    const bound = await this.access.requireConversation(session, conversationId);
    const message = await this.requireMessage(
      bound.conversation.id,
      bound.actor.organizationId,
      input.lastReadMessageId,
    );
    const incoming = { id: message.id, createdAt: message.createdAt.toISOString() };
    const current = await this.prisma.messageReadState.findUnique({
      where: {
        conversationId_organizationMembershipId: {
          conversationId: bound.conversation.id,
          organizationMembershipId: bound.actor.membershipId,
        },
      },
    });
    const currentCursor =
      current?.lastReadMessageId && current.lastReadCreatedAt
        ? { id: current.lastReadMessageId, createdAt: current.lastReadCreatedAt.toISOString() }
        : null;
    const keepCurrent = currentCursor && compareMessageCursor(incoming, currentCursor) <= 0;
    const row = keepCurrent
      ? current
      : await this.prisma.messageReadState.upsert({
          where: {
            conversationId_organizationMembershipId: {
              conversationId: bound.conversation.id,
              organizationMembershipId: bound.actor.membershipId,
            },
          },
          create: {
            conversationId: bound.conversation.id,
            organizationMembershipId: bound.actor.membershipId,
            lastReadMessageId: message.id,
            lastReadCreatedAt: message.createdAt,
          },
          update: {
            lastReadMessageId: message.id,
            lastReadCreatedAt: message.createdAt,
          },
        });
    return {
      conversationId: bound.conversation.id,
      organizationMembershipId: bound.actor.membershipId,
      lastReadMessageId: row?.lastReadMessageId ?? message.id,
      lastReadCreatedAt: (row?.lastReadCreatedAt ?? message.createdAt).toISOString(),
      updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
    };
  }

  private async requireMessage(conversationId: string, organizationId: string, messageId: string) {
    if (!UUID_RE.test(messageId)) {
      this.access.omit("Message is not accessible");
    }
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, organizationId },
    });
    if (!message) {
      this.access.omit("Message is not accessible");
    }
    return message;
  }

  private requireBody(raw: string): string {
    const text = raw?.trim() ?? "";
    if (!text) {
      throw new MessagingStateError("Message body is required");
    }
    if (text.length > MESSAGE_BODY_MAX) {
      throw new MessagingStateError(`Message body exceeds ${MESSAGE_BODY_MAX} characters`);
    }
    return text;
  }

  private requireExpectedVersion(current: number, expected: number | undefined): void {
    if (expected === undefined || expected === null || !Number.isInteger(expected)) {
      throw new MessagingStateError("expectedVersion is required");
    }
    this.foundation.cas({ version: current }, expected);
  }

  private normalizeLinks(links: readonly ResourceLink[] | undefined): ResourceLink[] {
    if (!links?.length) {
      return [];
    }
    const seen = new Set<string>();
    const out: ResourceLink[] = [];
    for (const link of links) {
      if (!isResourceLinkType(link.type) || !UUID_RE.test(link.id)) {
        throw new MessagingStateError("Resource link type/id is invalid");
      }
      const key = `${link.type}:${link.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ type: link.type, id: link.id });
    }
    return out;
  }

  private async toDto(
    session: RequestSession,
    row: {
      id: string;
      organizationId: string;
      conversationId: string;
      authorOrganizationMembershipId: string;
      body: string;
      editedAt: Date | null;
      deletedAt: Date | null;
      version: number;
      createdAt: Date;
    },
  ) {
    const lifecycle = messageLifecycle(row);
    const decoded = decodeStoredBody(row.body);
    const resourcePreviews = row.deletedAt
      ? []
      : await this.previewLinks(session, decoded.links);
    return {
      id: row.id,
      organizationId: row.organizationId,
      conversationId: row.conversationId,
      authorOrganizationMembershipId: row.authorOrganizationMembershipId,
      body: row.deletedAt ? null : decoded.text,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      version: row.version,
      lifecycle,
      resourcePreviews,
    };
  }

  private async previewLinks(session: RequestSession, links: readonly ResourceLink[]) {
    void deepLinkPreviewRequiresTargetAuthorization();
    const out: Array<{
      type: ResourceLink["type"];
      id: string;
      authorized: boolean;
      title?: string;
    }> = [];
    for (const link of links) {
      const preview = await this.authorizePreview(session, link);
      if (preview.authorized) {
        out.push({ type: link.type, id: link.id, authorized: true, title: preview.title });
      } else {
        out.push({ type: link.type, id: link.id, authorized: false });
      }
    }
    return out;
  }

  private async authorizePreview(
    session: RequestSession,
    link: ResourceLink,
  ): Promise<{ authorized: boolean; title?: string }> {
    if (!deepLinkPreviewRequiresTargetAuthorization()) {
      return { authorized: false };
    }
    const target = await this.loadPreviewTarget(link);
    if (!target) {
      return { authorized: false };
    }
    try {
      await this.authz.assert(session, target.permission, target.projectId);
      return { authorized: true, title: target.title };
    } catch {
      return { authorized: false };
    }
  }

  private async loadPreviewTarget(link: ResourceLink): Promise<{
    projectId: string;
    title: string;
    permission: PermissionCode;
  } | null> {
    if (link.type === "PROJECT") {
      const project = await this.prisma.project.findUnique({ where: { id: link.id } });
      return project ? { projectId: project.id, title: project.name, permission: "project.read" } : null;
    }
    if (link.type === "TASK") {
      const row = await this.prisma.task.findUnique({ where: { id: link.id } });
      return row ? { projectId: row.projectId, title: row.title, permission: "project.read" } : null;
    }
    if (link.type === "MILESTONE") {
      const row = await this.prisma.milestone.findUnique({ where: { id: link.id } });
      return row ? { projectId: row.projectId, title: row.title, permission: "project.read" } : null;
    }
    if (link.type === "DELIVERABLE") {
      const row = await this.prisma.deliverable.findUnique({ where: { id: link.id } });
      return row ? { projectId: row.projectId, title: row.title, permission: "project.read" } : null;
    }
    if (link.type === "GATE") {
      const row = await this.prisma.gate.findUnique({ where: { id: link.id } });
      return row ? { projectId: row.projectId, title: row.name, permission: "project.read" } : null;
    }
    const document = await this.prisma.document.findUnique({ where: { id: link.id } });
    return document
      ? { projectId: document.projectId, title: document.title, permission: "document.read" }
      : null;
  }
}
