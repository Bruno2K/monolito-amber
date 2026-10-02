import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  MessagingStateError,
  assertConversationShape,
  conversationVisibleInDirectory,
  directConversationAccess,
  directConversationPairKey,
  teamConversationAccess,
  type ConversationAccess,
  type ConversationKind,
  type MembershipStatus,
} from "@amber/shared";
import type { RequestSession } from "../auth/session.types";
import { AuthzService, type LoadedAuthzContext } from "../authz/authz.service";
import { PrismaService } from "../prisma/prisma.service";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ActorBinding {
  session: RequestSession;
  context: LoadedAuthzContext;
  membershipId: string;
  organizationId: string;
  membershipStatus: MembershipStatus;
}

export interface ConversationRow {
  id: string;
  organizationId: string;
  kind: string;
  teamId: string | null;
  participantLowId: string | null;
  participantHighId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedConversation {
  conversation: ConversationRow;
  access: Exclude<ConversationAccess, "none">;
  actor: ActorBinding;
  teamArchived: boolean;
}

@Injectable()
export class MessagingAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  omit(detail = "Conversation is not accessible"): never {
    throw new DenyByDefaultError(detail);
  }

  requireUuid(value: string, label = "id"): string {
    if (!UUID_RE.test(value)) {
      this.omit(`${label} is not accessible`);
    }
    return value;
  }

  async requireActor(session: RequestSession): Promise<ActorBinding> {
    const context = await this.authz.loadContext(session);
    if (context.membershipStatus !== "ACTIVE") {
      this.omit("ACTIVE Organization membership is required");
    }
    return {
      session,
      context,
      membershipId: context.membershipId,
      organizationId: context.organizationId,
      membershipStatus: context.membershipStatus,
    };
  }

  async resolveAccess(actor: ActorBinding, conversation: ConversationRow): Promise<{
    access: ConversationAccess;
    teamArchived: boolean;
  }> {
    if (conversation.organizationId !== actor.organizationId) {
      return { access: "none", teamArchived: false };
    }
    const kind = conversation.kind as ConversationKind;
    try {
      assertConversationShape({
        kind,
        teamId: conversation.teamId,
        participantLowId: conversation.participantLowId,
        participantHighId: conversation.participantHighId,
      });
    } catch {
      return { access: "none", teamArchived: false };
    }
    if (kind === "DIRECT") {
      return {
        access: directConversationAccess({
          actorMembershipId: actor.membershipId,
          actorMembershipStatus: actor.membershipStatus,
          pair: directConversationPairKey(conversation.participantLowId!, conversation.participantHighId!),
        }),
        teamArchived: false,
      };
    }
    const team = await this.prisma.team.findFirst({
      where: { id: conversation.teamId!, organizationId: actor.organizationId },
      include: {
        memberships: {
          where: { organizationMembershipId: actor.membershipId },
          take: 1,
        },
      },
    });
    const teamMembership = team?.memberships[0];
    const teamArchived = Boolean(team?.archivedAt);
    return {
      access: teamConversationAccess({
        actorMembershipStatus: actor.membershipStatus,
        teamMembershipActive: teamMembership?.status === "ACTIVE",
        teamArchived,
      }),
      teamArchived,
    };
  }

  async requireConversation(
    session: RequestSession,
    conversationId: string,
    minimum: Exclude<ConversationAccess, "none"> = "read_only",
  ): Promise<ResolvedConversation> {
    const actor = await this.requireActor(session);
    if (!UUID_RE.test(conversationId)) {
      this.omit();
    }
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId: actor.organizationId },
    });
    if (!conversation) {
      this.omit();
    }
    const resolved = await this.resolveAccess(actor, conversation);
    if (resolved.access === "none" || !conversationVisibleInDirectory(resolved.access)) {
      this.omit();
    }
    if (minimum === "read_write" && resolved.access !== "read_write") {
      if (resolved.access === "read_only") {
        throw new MessagingStateError("Archived Team conversation is read-only");
      }
      this.omit();
    }
    return { conversation, access: resolved.access, actor, teamArchived: resolved.teamArchived };
  }

  async loadSameOrgMembership(organizationId: string, membershipId: string) {
    if (!UUID_RE.test(membershipId)) {
      this.omit("Participant is not accessible");
    }
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (!membership) {
      this.omit("Participant is not accessible");
    }
    return membership;
  }
}
