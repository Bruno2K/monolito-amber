import { describe, expect, it } from "vitest";
import { DenyByDefaultError, MessagingStateError } from "./errors.js";
import {
  assertConversationShape,
  assertMaySend,
  chatIsSystemOfRecordForGovernedDecisions,
  compareMessageCursor,
  conversationVisibleInDirectory,
  countUnread,
  directConversationAccess,
  directConversationPairKey,
  inaccessibleConversationLeaksCount,
  messageCreatesUnread,
  messagingParticipationGrantsProjectAccess,
  newMembershipInheritsDirectHistory,
  roleGrantsMessageContent,
  sameDirectPair,
  searchSnippetMayRevealInaccessibleConversation,
  teamConversationAccess,
  teamMembershipGrantsProjectAccessViaChat,
} from "./messaging.js";

describe("M5.1 Messaging contract", () => {
  it("identifies Direct conversations by unordered membership pair", () => {
    const forward = directConversationPairKey("bbb", "aaa");
    const reverse = directConversationPairKey("aaa", "bbb");
    expect(sameDirectPair(forward, reverse)).toBe(true);
    expect(forward).toEqual({ low: "aaa", high: "bbb" });
    expect(() => directConversationPairKey("aaa", "aaa")).toThrow(MessagingStateError);
    expect(newMembershipInheritsDirectHistory("old-id", "new-id")).toBe(false);
    expect(newMembershipInheritsDirectHistory("same", "same")).toBe(true);
  });

  it("rejects malformed DIRECT/TEAM shapes", () => {
    expect(() =>
      assertConversationShape({
        kind: "DIRECT",
        participantLowId: "aaa",
        participantHighId: "bbb",
      }),
    ).not.toThrow();
    expect(() =>
      assertConversationShape({
        kind: "DIRECT",
        participantLowId: "bbb",
        participantHighId: "aaa",
      }),
    ).toThrow(MessagingStateError);
    expect(() => assertConversationShape({ kind: "TEAM", teamId: "t1" })).not.toThrow();
    expect(() =>
      assertConversationShape({ kind: "TEAM", teamId: "t1", participantLowId: "aaa" }),
    ).toThrow(MessagingStateError);
  });

  it("revokes Direct/Team access immediately and keeps archived Team read-only", () => {
    const pair = directConversationPairKey("m1", "m2");
    expect(
      directConversationAccess({ actorMembershipId: "m1", actorMembershipStatus: "ACTIVE", pair }),
    ).toBe("read_write");
    expect(
      directConversationAccess({ actorMembershipId: "m1", actorMembershipStatus: "SUSPENDED", pair }),
    ).toBe("none");
    expect(
      directConversationAccess({ actorMembershipId: "stranger", actorMembershipStatus: "ACTIVE", pair }),
    ).toBe("none");
    expect(
      teamConversationAccess({
        actorMembershipStatus: "ACTIVE",
        teamMembershipActive: true,
        teamArchived: false,
      }),
    ).toBe("read_write");
    expect(
      teamConversationAccess({
        actorMembershipStatus: "ACTIVE",
        teamMembershipActive: true,
        teamArchived: true,
      }),
    ).toBe("read_only");
    expect(
      teamConversationAccess({
        actorMembershipStatus: "ACTIVE",
        teamMembershipActive: false,
        teamArchived: false,
      }),
    ).toBe("none");
    expect(conversationVisibleInDirectory("none")).toBe(false);
    expect(inaccessibleConversationLeaksCount()).toBe(false);
  });

  it("counts unread only from others after the watermark", () => {
    const watermark = { createdAt: "2026-10-02T10:00:00.000Z", id: "m2" };
    expect(
      messageCreatesUnread({
        authorMembershipId: "me",
        readerMembershipId: "me",
        message: { createdAt: "2026-10-02T11:00:00.000Z", id: "m9" },
        watermark,
      }),
    ).toBe(false);
    expect(
      messageCreatesUnread({
        authorMembershipId: "other",
        readerMembershipId: "me",
        message: { createdAt: "2026-10-02T11:00:00.000Z", id: "m9" },
        watermark,
        isEditOrTombstone: true,
      }),
    ).toBe(false);
    expect(
      countUnread({
        readerMembershipId: "me",
        watermark,
        messages: [
          { id: "m1", createdAt: "2026-10-02T09:00:00.000Z", authorMembershipId: "other" },
          { id: "m2", createdAt: "2026-10-02T10:00:00.000Z", authorMembershipId: "other" },
          { id: "m4", createdAt: "2026-10-02T11:00:00.000Z", authorMembershipId: "me" },
          { id: "m5", createdAt: "2026-10-02T11:00:00.000Z", authorMembershipId: "other" },
        ],
      }),
    ).toBe(1);
    expect(
      compareMessageCursor(
        { createdAt: "2026-10-02T10:00:00.000Z", id: "a" },
        { createdAt: "2026-10-02T10:00:00.000Z", id: "b" },
      ),
    ).toBeLessThan(0);
  });

  it("denies send without write access and keeps chat out of governed SoT", () => {
    expect(() => assertMaySend("none")).toThrow(DenyByDefaultError);
    expect(() => assertMaySend("read_only")).toThrow(DenyByDefaultError);
    expect(chatIsSystemOfRecordForGovernedDecisions()).toBe(false);
    expect(messagingParticipationGrantsProjectAccess()).toBe(false);
    expect(teamMembershipGrantsProjectAccessViaChat()).toBe(false);
    expect(roleGrantsMessageContent("ORGANIZATION_ADMINISTRATOR")).toBe(false);
    expect(searchSnippetMayRevealInaccessibleConversation()).toBe(false);
  });
});
