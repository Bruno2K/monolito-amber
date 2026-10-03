import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  MessagingStateError,
  OUTBOX_EVENT_TYPES,
  assertConversationShape,
  compareMessageCursor,
  countUnread,
  directConversationPairKey,
  redactSecrets,
  searchSnippetMayRevealInaccessibleConversation,
  type ConversationKind,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingAccess, type ActorBinding, type ConversationRow } from "./messaging.access";
import {
  clampPageSize,
  conversationKind,
  cursorAfterWhere,
  decodeCursor,
  decodeStoredBody,
  encodeCursor,
  messageLifecycle,
  snippetFromText,
} from "./messaging.codec";

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MessagingAccess,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
    private readonly authz: AuthzService,
  ) {}

  async list(
    session: RequestSession,
    query: { cursor?: string; pageSize?: string; kind?: string },
  ) {
    const actor = await this.access.requireActor(session);
    await this.ensureActorTeamConversations(actor);
    const authorized = await this.loadAuthorizedConversations(actor, query.kind);
    const pageSize = clampPageSize(query.pageSize);
    const cursor = decodeCursor(query.cursor);
    const decorated = await Promise.all(
      authorized.map(async (row) => this.toInboxItem(actor, row.conversation, row.access, row.teamArchived)),
    );
    decorated.sort((left, right) => {
      const leftCursor = { createdAt: left.lastMessage?.createdAt ?? left.createdAt, id: left.id };
      const rightCursor = { createdAt: right.lastMessage?.createdAt ?? right.createdAt, id: right.id };
      return compareMessageCursor(rightCursor, leftCursor);
    });
    const start = cursor
      ? decorated.findIndex((item) => {
          const itemCursor = { createdAt: item.lastMessage?.createdAt ?? item.createdAt, id: item.id };
          return compareMessageCursor(itemCursor, cursor) < 0;
        })
      : 0;
    const sliced = decorated.slice(start < 0 ? decorated.length : start, (start < 0 ? decorated.length : start) + pageSize + 1);
    const hasMore = sliced.length > pageSize;
    const items = hasMore ? sliced.slice(0, pageSize) : sliced;
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.lastMessage?.createdAt ?? last.createdAt, id: last.id })
          : null,
    };
  }

  async get(session: RequestSession, conversationId: string) {
    const bound = await this.access.requireConversation(session, conversationId);
    return this.toInboxItem(bound.actor, bound.conversation, bound.access, bound.teamArchived);
  }

  async findOrCreateDirect(
    session: RequestSession,
    idempotencyKey: string | undefined,
    input: { organizationMembershipId: string; organizationId?: string },
  ) {
    const actor = await this.access.requireActor(session);
    if (input.organizationId && input.organizationId !== actor.organizationId) {
      throw new DenyByDefaultError("Client organizationId is not authoritative");
    }
    const peer = await this.access.loadSameOrgMembership(actor.organizationId, input.organizationMembershipId);
    if (peer.id === actor.membershipId) {
      throw new MessagingStateError("Direct conversation cannot be a self-pair");
    }
    if (peer.status !== "ACTIVE") {
      throw new MessagingStateError("DIRECT conversation requires two distinct ACTIVE Organization memberships");
    }
    const pair = directConversationPairKey(actor.membershipId, peer.id);
    assertConversationShape({
      kind: "DIRECT",
      participantLowId: pair.low,
      participantHighId: pair.high,
    });
    const started = await this.idempotency.begin(actor.organizationId, idempotencyKey, {
      organizationMembershipId: peer.id,
      pair,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const existing = await this.prisma.conversation.findFirst({
      where: {
        organizationId: actor.organizationId,
        kind: "DIRECT",
        participantLowId: pair.low,
        participantHighId: pair.high,
      },
    });
    if (existing) {
      const body = await this.toInboxItem(actor, existing, "read_write", false);
      await this.idempotency.commit(actor.organizationId, started.key, started.hash, 200, body);
      return body;
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.create({
          data: {
            organizationId: actor.organizationId,
            kind: "DIRECT",
            participantLowId: pair.low,
            participantHighId: pair.high,
          },
        });
        await this.audit.insert(
          {
            organizationId: actor.organizationId,
            actorUserId: session.userId,
            eventType: "DIRECT_CONVERSATION_CREATED",
            resourceType: "conversation",
            resourceId: conversation.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({
              kind: "DIRECT",
              participantLowId: pair.low,
              participantHighId: pair.high,
            }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.DirectConversationCreated,
          {
            organizationId: actor.organizationId,
            conversationId: conversation.id,
            participantLowId: pair.low,
            participantHighId: pair.high,
          },
          currentCorrelationId(),
          tx,
        );
        const body = await this.toInboxItem(actor, conversation, "read_write", false);
        await this.idempotency.commit(actor.organizationId, started.key, started.hash, 201, body, tx);
        return body;
      });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.conversation.findFirst({
          where: {
            organizationId: actor.organizationId,
            kind: "DIRECT",
            participantLowId: pair.low,
            participantHighId: pair.high,
          },
        });
        if (!raced) {
          throw error;
        }
        const body = await this.toInboxItem(actor, raced, "read_write", false);
        await this.idempotency.commit(actor.organizationId, started.key, started.hash, 200, body);
        return body;
      }
      throw error;
    }
  }

  async ensureTeam(
    session: RequestSession,
    idempotencyKey: string | undefined,
    input: { teamId: string; organizationId?: string },
  ) {
    const actor = await this.access.requireActor(session);
    if (input.organizationId && input.organizationId !== actor.organizationId) {
      throw new DenyByDefaultError("Client organizationId is not authoritative");
    }
    const teamId = this.access.requireUuid(input.teamId, "teamId");
    const started = await this.idempotency.begin(actor.organizationId, idempotencyKey, { teamId });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const conversation = await this.ensureTeamConversation(actor, teamId);
    const resolved = await this.access.resolveAccess(actor, conversation);
    if (resolved.access === "none") {
      this.access.omit();
    }
    const body = await this.toInboxItem(actor, conversation, resolved.access, resolved.teamArchived);
    await this.idempotency.commit(actor.organizationId, started.key, started.hash, 200, body);
    return body;
  }

  async search(
    session: RequestSession,
    query: { q?: string; cursor?: string; pageSize?: string },
  ) {
    void searchSnippetMayRevealInaccessibleConversation();
    const actor = await this.access.requireActor(session);
    const q = query.q?.trim() ?? "";
    if (!q) {
      return { items: [], nextCursor: null };
    }
    const authorized = await this.loadAuthorizedConversations(actor);
    const conversationIds = authorized.map((row) => row.conversation.id);
    if (conversationIds.length === 0) {
      return { items: [], nextCursor: null };
    }
    const pageSize = clampPageSize(query.pageSize);
    const cursor = decodeCursor(query.cursor);
    const rows = await this.prisma.message.findMany({
      where: {
        organizationId: actor.organizationId,
        conversationId: { in: conversationIds },
        deletedAt: null,
        body: { contains: q, mode: "insensitive" },
        ...(cursor ? cursorAfterWhere(cursor) : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: pageSize + 1,
    });
    const authorizedById = new Map(authorized.map((row) => [row.conversation.id, row]));
    const page = rows.slice(0, pageSize);
    const items = page.flatMap((row) => {
      const bound = authorizedById.get(row.conversationId);
      if (!bound) {
        return [];
      }
      const decoded = decodeStoredBody(row.body);
      return [
        {
          conversationId: row.conversationId,
          messageId: row.id,
          kind: conversationKind(bound.conversation.kind),
          createdAt: row.createdAt.toISOString(),
          snippet: snippetFromText(decoded.text, q),
        },
      ];
    });
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > pageSize && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  async directCandidates(session: RequestSession, q?: string) {
    const actor = await this.access.requireActor(session);
    const ownProjects = await this.prisma.projectMembership.findMany({
      where: {
        organizationMembershipId: actor.membershipId,
        status: "ACTIVE",
        project: { organizationId: actor.organizationId },
      },
      select: { projectId: true },
    });
    const projectIds: string[] = [];
    for (const row of ownProjects) {
      try {
        await this.authz.assert(session, "project.read", row.projectId);
        projectIds.push(row.projectId);
      } catch {
        continue;
      }
    }
    if (projectIds.length === 0) {
      return { items: [] as Array<{ id: string; displayName: string }> };
    }
    const peers = await this.prisma.projectMembership.findMany({
      where: {
        projectId: { in: projectIds },
        status: "ACTIVE",
        organizationMembership: {
          organizationId: actor.organizationId,
          status: "ACTIVE",
          id: { not: actor.membershipId },
        },
      },
      include: { organizationMembership: { include: { user: { select: { displayName: true } } } } },
    });
    const query = q?.trim().toLowerCase() ?? "";
    const byId = new Map<string, { id: string; displayName: string }>();
    for (const row of peers) {
      const membership = row.organizationMembership;
      if (membership.status !== "ACTIVE" || membership.organizationId !== actor.organizationId) {
        continue;
      }
      if (membership.id === actor.membershipId) {
        continue;
      }
      const displayName = membership.user.displayName;
      if (query && !displayName.toLowerCase().includes(query)) {
        continue;
      }
      if (!byId.has(membership.id)) {
        byId.set(membership.id, { id: membership.id, displayName });
      }
    }
    return {
      items: [...byId.values()].sort((left, right) => left.displayName.localeCompare(right.displayName, "pt")),
    };
  }

  private async ensureActorTeamConversations(actor: ActorBinding): Promise<void> {
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        organizationMembershipId: actor.membershipId,
        status: "ACTIVE",
        team: { organizationId: actor.organizationId },
      },
      select: { teamId: true },
    });
    for (const membership of memberships) {
      await this.ensureTeamConversation(actor, membership.teamId);
    }
  }

  private async ensureTeamConversation(actor: ActorBinding, teamId: string): Promise<ConversationRow> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId: actor.organizationId },
    });
    if (!team) {
      this.access.omit("Team is not accessible");
    }
    const membership = await this.prisma.teamMembership.findUnique({
      where: {
        teamId_organizationMembershipId: {
          teamId: team.id,
          organizationMembershipId: actor.membershipId,
        },
      },
    });
    if (membership?.status !== "ACTIVE") {
      this.access.omit("Team is not accessible");
    }
    assertConversationShape({ kind: "TEAM", teamId: team.id });
    const existing = await this.prisma.conversation.findFirst({
      where: { organizationId: actor.organizationId, kind: "TEAM", teamId: team.id },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.create({
          data: {
            organizationId: actor.organizationId,
            kind: "TEAM",
            teamId: team.id,
          },
        });
        await this.audit.insert(
          {
            organizationId: actor.organizationId,
            actorUserId: actor.session.userId,
            eventType: "TEAM_CONVERSATION_CREATED",
            resourceType: "conversation",
            resourceId: conversation.id,
            correlationId: currentCorrelationId(),
            payload: redactSecrets({ kind: "TEAM", teamId: team.id }),
          },
          tx,
        );
        await this.foundation.appendOutbox(
          OUTBOX_EVENT_TYPES.TeamConversationCreated,
          {
            organizationId: actor.organizationId,
            conversationId: conversation.id,
            teamId: team.id,
          },
          currentCorrelationId(),
          tx,
        );
        return conversation;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.conversation.findFirst({
          where: { organizationId: actor.organizationId, kind: "TEAM", teamId: team.id },
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private async loadAuthorizedConversations(
    actor: ActorBinding,
    kindFilter?: string,
  ): Promise<Array<{ conversation: ConversationRow; access: "read_only" | "read_write"; teamArchived: boolean }>> {
    const kind = kindFilter === "DIRECT" || kindFilter === "TEAM" ? (kindFilter as ConversationKind) : undefined;
    const rows = await this.prisma.conversation.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(kind ? { kind } : {}),
        OR: [
          { kind: "DIRECT", OR: [{ participantLowId: actor.membershipId }, { participantHighId: actor.membershipId }] },
          {
            kind: "TEAM",
            team: {
              organizationId: actor.organizationId,
              memberships: { some: { organizationMembershipId: actor.membershipId, status: "ACTIVE" } },
            },
          },
        ],
      },
    });
    const out: Array<{ conversation: ConversationRow; access: "read_only" | "read_write"; teamArchived: boolean }> = [];
    for (const conversation of rows) {
      const resolved = await this.access.resolveAccess(actor, conversation);
      if (resolved.access === "none") {
        continue;
      }
      out.push({ conversation, access: resolved.access, teamArchived: resolved.teamArchived });
    }
    return out;
  }

  async toInboxItem(
    actor: ActorBinding,
    conversation: ConversationRow,
    access: "read_only" | "read_write",
    teamArchived: boolean,
  ) {
    const [last, readState, others] = await Promise.all([
      this.prisma.message.findFirst({
        where: { conversationId: conversation.id, organizationId: actor.organizationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.messageReadState.findUnique({
        where: {
          conversationId_organizationMembershipId: {
            conversationId: conversation.id,
            organizationMembershipId: actor.membershipId,
          },
        },
      }),
      this.prisma.message.findMany({
        where: {
          conversationId: conversation.id,
          organizationId: actor.organizationId,
          authorOrganizationMembershipId: { not: actor.membershipId },
          deletedAt: null,
        },
        select: { id: true, createdAt: true, authorOrganizationMembershipId: true, deletedAt: true, editedAt: true },
      }),
    ]);
    const watermark =
      readState?.lastReadMessageId && readState.lastReadCreatedAt
        ? { id: readState.lastReadMessageId, createdAt: readState.lastReadCreatedAt.toISOString() }
        : null;
    const unreadCount = countUnread({
      readerMembershipId: actor.membershipId,
      watermark,
      messages: others.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        authorMembershipId: row.authorOrganizationMembershipId,
        isEditOrTombstone: Boolean(row.deletedAt),
      })),
    });
    const lastDecoded = last && !last.deletedAt ? decodeStoredBody(last.body) : null;
    return {
      id: conversation.id,
      organizationId: conversation.organizationId,
      kind: conversationKind(conversation.kind),
      teamId: conversation.teamId,
      participantLowId: conversation.participantLowId,
      participantHighId: conversation.participantHighId,
      version: conversation.version,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      access,
      teamArchived,
      unreadCount,
      lastMessage: last
        ? {
            id: last.id,
            createdAt: last.createdAt.toISOString(),
            authorOrganizationMembershipId: last.authorOrganizationMembershipId,
            lifecycle: messageLifecycle(last),
            snippet: last.deletedAt ? "" : snippetFromText(lastDecoded?.text ?? ""),
          }
        : null,
    };
  }
}
