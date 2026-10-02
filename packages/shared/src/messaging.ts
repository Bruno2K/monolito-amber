import { DenyByDefaultError, MessagingStateError } from "./errors.js";
import { isUsableMembership } from "./membership.js";
import type { MembershipStatus } from "./tenancy.js";

/**
 * M5 Messaging contract — executable tables for Conversation, Message, and
 * per-user read-state. Persistence/API/UX are M5.4/M5.5.
 * Access is participation/TeamMembership based. Role templates do not grant
 * Direct or Team message content.
 */

export const CONVERSATION_KINDS = ["DIRECT", "TEAM"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const MESSAGE_LIFECYCLE = ["VISIBLE", "EDITED", "TOMBSTONED"] as const;
export type MessageLifecycle = (typeof MESSAGE_LIFECYCLE)[number];

export const CONVERSATION_FIELDS = [
  "organizationId",
  "kind",
  "teamId",
  "participantLowId",
  "participantHighId",
  "version",
  "createdAt",
  "updatedAt",
] as const;

export const MESSAGE_FIELDS = [
  "organizationId",
  "conversationId",
  "authorOrganizationMembershipId",
  "body",
  "createdAt",
  "editedAt",
  "deletedAt",
  "version",
] as const;

export const MESSAGE_READ_STATE_FIELDS = [
  "conversationId",
  "organizationMembershipId",
  "lastReadMessageId",
  "lastReadCreatedAt",
  "updatedAt",
] as const;

export interface DirectPair {
  low: string;
  high: string;
}

/** Unordered pair of immutable OrganizationMembership IDs. */
export function directConversationPairKey(a: string, b: string): DirectPair {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) {
    throw new MessagingStateError("Direct conversation requires two OrganizationMembership IDs");
  }
  if (left === right) {
    throw new MessagingStateError("Direct conversation cannot be a self-pair");
  }
  return left < right ? { low: left, high: right } : { low: right, high: left };
}

export function sameDirectPair(a: DirectPair, b: DirectPair): boolean {
  return a.low === b.low && a.high === b.high;
}

/** A newly created membership ID does not inherit an old Direct conversation. */
export function newMembershipInheritsDirectHistory(previousMembershipId: string, nextMembershipId: string): boolean {
  return previousMembershipId === nextMembershipId;
}

export function assertConversationShape(input: {
  kind: ConversationKind;
  teamId?: string | null;
  participantLowId?: string | null;
  participantHighId?: string | null;
}): void {
  if (input.kind === "DIRECT") {
    if (input.teamId) {
      throw new MessagingStateError("DIRECT conversation must not bind a Team");
    }
    if (!input.participantLowId || !input.participantHighId) {
      throw new MessagingStateError("DIRECT conversation requires the unordered membership pair");
    }
    const pair = directConversationPairKey(input.participantLowId, input.participantHighId);
    if (pair.low !== input.participantLowId || pair.high !== input.participantHighId) {
      throw new MessagingStateError("DIRECT participant IDs must be stored in lexicographic order");
    }
    return;
  }
  if (!input.teamId) {
    throw new MessagingStateError("TEAM conversation requires teamId");
  }
  if (input.participantLowId || input.participantHighId) {
    throw new MessagingStateError("TEAM conversation must not store a Direct pair");
  }
}

export type ConversationAccess = "none" | "read_only" | "read_write";

export function directConversationAccess(input: {
  actorMembershipId: string;
  actorMembershipStatus: MembershipStatus;
  pair: DirectPair;
}): ConversationAccess {
  const isParticipant = input.actorMembershipId === input.pair.low || input.actorMembershipId === input.pair.high;
  if (!isParticipant || !isUsableMembership(input.actorMembershipStatus)) {
    return "none";
  }
  return "read_write";
}

/**
 * TEAM access follows current TeamMembership. Archived Team is read-only
 * retained history (R-1.5). Removal is immediate.
 */
export function teamConversationAccess(input: {
  actorMembershipStatus: MembershipStatus;
  teamMembershipActive: boolean;
  teamArchived: boolean;
}): ConversationAccess {
  if (!isUsableMembership(input.actorMembershipStatus) || !input.teamMembershipActive) {
    return "none";
  }
  return input.teamArchived ? "read_only" : "read_write";
}

export function conversationVisibleInDirectory(access: ConversationAccess): boolean {
  return access !== "none";
}

export function inaccessibleConversationLeaksCount(): boolean {
  return false;
}

export function messagingParticipationGrantsProjectAccess(): boolean {
  return false;
}

export function teamMembershipGrantsProjectAccessViaChat(): boolean {
  return false;
}

export function roleGrantsMessageContent(roleKey: string): boolean {
  void roleKey;
  return false;
}

export function chatIsSystemOfRecordForGovernedDecisions(): boolean {
  return false;
}

export type MessageCursor = { createdAt: string; id: string };

export function compareMessageCursor(a: MessageCursor, b: MessageCursor): number {
  if (a.createdAt < b.createdAt) {
    return -1;
  }
  if (a.createdAt > b.createdAt) {
    return 1;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}

/**
 * Unread = authorized Messages from *others* after the user watermark.
 * Own sends, edits, and tombstones do not create unread.
 */
export function messageCreatesUnread(input: {
  authorMembershipId: string;
  readerMembershipId: string;
  message: MessageCursor;
  watermark: MessageCursor | null;
  isEditOrTombstone?: boolean;
}): boolean {
  if (input.authorMembershipId === input.readerMembershipId) {
    return false;
  }
  if (input.isEditOrTombstone) {
    return false;
  }
  if (!input.watermark) {
    return true;
  }
  return compareMessageCursor(input.message, input.watermark) > 0;
}

export function countUnread(input: {
  readerMembershipId: string;
  messages: readonly {
    id: string;
    createdAt: string;
    authorMembershipId: string;
    isEditOrTombstone?: boolean;
  }[];
  watermark: MessageCursor | null;
}): number {
  return input.messages.filter((message) =>
    messageCreatesUnread({
      authorMembershipId: message.authorMembershipId,
      readerMembershipId: input.readerMembershipId,
      message: { id: message.id, createdAt: message.createdAt },
      watermark: input.watermark,
      isEditOrTombstone: message.isEditOrTombstone,
    }),
  ).length;
}

export function assertAuthorMayMutateOwnMessage(input: {
  actorMembershipId: string;
  authorMembershipId: string;
  conversationAccess: ConversationAccess;
  action: "edit" | "tombstone";
}): void {
  if (input.conversationAccess === "none") {
    throw new DenyByDefaultError("Conversation is not accessible");
  }
  if (input.conversationAccess === "read_only" && input.action !== "tombstone") {
    throw new MessagingStateError("Archived Team conversation is read-only");
  }
  if (input.actorMembershipId !== input.authorMembershipId) {
    throw new DenyByDefaultError("Only the author may edit or tombstone a message in M5");
  }
}

export function assertMaySend(access: ConversationAccess): void {
  if (access !== "read_write") {
    throw new DenyByDefaultError("Send requires current Conversation write access");
  }
}

export function searchSnippetMayRevealInaccessibleConversation(): boolean {
  return false;
}

export function deepLinkPreviewRequiresTargetAuthorization(): boolean {
  return true;
}

export const MESSAGING_AUDIT_EVENTS = [
  "DIRECT_CONVERSATION_CREATED",
  "TEAM_CONVERSATION_CREATED",
  "MESSAGE_EDITED",
  "MESSAGE_DELETED",
] as const;

export const MESSAGE_SENT_IS_AUDIT_EVENT = false;

export const MESSAGING_MUTATIONS_REQUIRE_IDEMPOTENCY = [
  "find_or_create_direct",
  "ensure_team_conversation",
  "send_message",
  "edit_message",
  "tombstone_message",
] as const;

export const MESSAGING_MUTATIONS_REQUIRE_CAS = ["edit_message", "tombstone_message"] as const;
