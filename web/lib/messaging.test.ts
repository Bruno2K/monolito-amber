import { describe, expect, it } from "vitest";
import {
  acceptAsyncResult,
  appendInboxItems,
  appendTranscriptPage,
  appendUniqueMessage,
  authorizedSearchHits,
  authorizedUnreadTotal,
  beginSend,
  buildInboxViews,
  canEditOwnMessage,
  canSendMessage,
  canTombstoneOwnMessage,
  composerKeyAction,
  contentFits,
  conversationFailure,
  eligibleDirectPeers,
  filterInbox,
  inboxPageDisposition,
  inboxSurface,
  membersFromProjectRows,
  nextInboxIndex,
  nextTranscriptCursor,
  peersFromProjectMembers,
  peerMembershipId,
  privacySafeSnippet,
  resourcePresentation,
  reuseSendKey,
  transcriptBody,
  visiblePendingSends,
  watermarkTarget,
  type InboxItem,
  type MessageRecord,
} from "./messaging";

const actor = "member-a";
const peer = "member-b";

function direct(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "conv-direct",
    organizationId: "org",
    kind: "DIRECT",
    teamId: null,
    participantLowId: actor,
    participantHighId: peer,
    access: "read_write",
    teamArchived: false,
    unreadCount: 2,
    createdAt: "2026-10-02T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
    lastMessage: {
      id: "m1",
      createdAt: "2026-10-02T12:00:00.000Z",
      authorOrganizationMembershipId: peer,
      lifecycle: "VISIBLE",
      snippet: "Olá",
    },
    ...overrides,
  };
}

function team(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    ...direct(),
    id: "conv-team",
    kind: "TEAM",
    teamId: "team-1",
    participantLowId: null,
    participantHighId: null,
    unreadCount: 1,
    ...overrides,
  };
}

describe("M5.5 messaging presentation", () => {
  it("reuses the peer from the unordered membership pair without inventing a third participant", () => {
    expect(peerMembershipId(direct(), actor)).toBe(peer);
    expect(peerMembershipId({ participantLowId: peer, participantHighId: actor }, actor)).toBe(peer);
    expect(peerMembershipId(direct(), "outsider")).toBeNull();
  });

  it("discovers only active peers and only teams already present in the authorized inbox", () => {
    const peers = eligibleDirectPeers(
      [
        { id: actor, displayName: "Eu", status: "ACTIVE" },
        { id: peer, displayName: "Bia", status: "ACTIVE" },
        { id: "suspended", displayName: "Suspenso", status: "SUSPENDED" },
      ],
      actor,
    );
    expect(peers.map((member) => member.displayName)).toEqual(["Bia"]);
    const views = buildInboxViews({
      items: [direct(), team()],
      actorMembershipId: actor,
      members: [
        { id: peer, displayName: "Bia", status: "ACTIVE" },
        { id: "hidden", displayName: "Oculto", status: "ACTIVE" },
      ],
      teams: [
        { id: "team-1", name: "Estrutura" },
        { id: "team-secret", name: "Secreta" },
      ],
    });
    expect(views.find((item) => item.kind === "DIRECT")?.title).toBe("Bia");
    expect(views.find((item) => item.kind === "TEAM")?.title).toBe("Estrutura");
    expect(views.some((item) => item.title.includes("Secreta") || item.title.includes("Oculto"))).toBe(false);
  });

  it("keeps archived teams read-only and does not reconstruct tombstoned snippets", () => {
    const archived = team({ teamArchived: true, access: "read_only" });
    const views = buildInboxViews({
      items: [
        archived,
        direct({
          lastMessage: {
            id: "gone",
            createdAt: "2026-10-02T12:00:00.000Z",
            authorOrganizationMembershipId: peer,
            lifecycle: "TOMBSTONED",
            snippet: "segredo que não pode voltar",
          },
        }),
      ],
      actorMembershipId: actor,
      members: [{ id: peer, displayName: "Bia", status: "ACTIVE" }],
      teams: [{ id: "team-1", name: "Estrutura" }],
    });
    expect(views[0]?.title).toBe("Estrutura (arquivada)");
    expect(canSendMessage(archived)).toBe(false);
    expect(views[1]?.snippet).toBe("Mensagem removida");
    expect(views[1]?.snippet.includes("segredo")).toBe(false);
    expect(privacySafeSnippet(views[1]?.lastMessage ?? null)).toBe("Mensagem removida");
  });

  it("counts unread only from authorized rows and drops foreign search hits", () => {
    const visible = [direct(), team({ unreadCount: 0 })];
    expect(authorizedUnreadTotal(visible)).toBe(2);
    const hits = authorizedSearchHits(
      [
        { conversationId: "conv-direct", snippet: "Olá" },
        { conversationId: "secret", snippet: "não autorizado" },
      ],
      new Set(visible.map((item) => item.id)),
    );
    expect(hits).toEqual([{ conversationId: "conv-direct", snippet: "Olá" }]);
    const filtered = filterInbox(
      buildInboxViews({ items: visible, actorMembershipId: actor, members: null, teams: [] }),
      "TEAM",
      "",
    );
    expect(filtered).toHaveLength(1);
    expect(inboxSurface({ status: 200, itemCount: 2, visibleCount: 0, filtered: true })).toBe("filtered-empty");
    expect(inboxSurface({ status: 403, itemCount: 0, visibleCount: 0, filtered: false })).toBe("no-permission");
    expect(conversationFailure(404)).toBe("revoked");
  });

  it("sends, edits and tombstones without duplicating or leaking removed text", () => {
    const first = { id: "m1", body: "oi" };
    expect(appendUniqueMessage([first], first)).toHaveLength(1);
    expect(reuseSendKey({ key: "same", body: "oi" }, "oi")).toBe("same");
    expect(reuseSendKey({ key: "same", body: "oi" }, "outro")).toBeNull();
    expect(
      visiblePendingSends([{ localId: "local", key: "same", body: "oi", conversationId: "c" }], new Set(["m1"]), new Map([["local", "m1"]])),
    ).toHaveLength(0);
    expect(transcriptBody({ body: "segredo", lifecycle: "TOMBSTONED", deletedAt: "2026-10-02T12:00:00.000Z" })).toBeNull();
    expect(
      canEditOwnMessage({
        access: "read_write",
        teamArchived: false,
        authorMembershipId: actor,
        actorMembershipId: actor,
        lifecycle: "VISIBLE",
        deletedAt: null,
      }),
    ).toBe(true);
    expect(
      canEditOwnMessage({
        access: "read_only",
        teamArchived: true,
        authorMembershipId: actor,
        actorMembershipId: actor,
        lifecycle: "VISIBLE",
        deletedAt: null,
      }),
    ).toBe(false);
    expect(
      canTombstoneOwnMessage({
        access: "read_only",
        authorMembershipId: actor,
        actorMembershipId: actor,
        lifecycle: "VISIBLE",
        deletedAt: null,
      }),
    ).toBe(true);
    expect(
      canTombstoneOwnMessage({
        access: "read_write",
        authorMembershipId: peer,
        actorMembershipId: actor,
        lifecycle: "VISIBLE",
        deletedAt: null,
      }),
    ).toBe(false);
    expect(watermarkTarget([{ id: "older" }, { id: "newest" }])).toBe("newest");
  });

  it("hides protected resource metadata and only opens an authorized project", () => {
    expect(resourcePresentation({ type: "PROJECT", id: "p1", authorized: false, title: "Sigiloso" })).toEqual({
      name: "Recurso protegido",
      caption: "Vínculo de colaboração. Não é uma decisão governada.",
      href: null,
    });
    expect(resourcePresentation({ type: "PROJECT", id: "p1", authorized: true, title: "Aurora" }).href).toBe("/projects/p1/overview");
    expect(resourcePresentation({ type: "TASK", id: "t1", authorized: true, title: "Tarefa" }).href).toBeNull();
    expect(resourcePresentation({ type: "TASK", id: "t1", authorized: true, title: "Tarefa" }).caption).toContain("colaboração");
  });

  it("fits the narrow desktop and exposes keyboard actions", () => {
    expect(contentFits(1440, 900)).toBe(true);
    expect(contentFits(1180, 820)).toBe(true);
    expect(nextInboxIndex(0, 3, "ArrowDown")).toBe(1);
    expect(nextInboxIndex(2, 3, "End")).toBe(2);
    expect(composerKeyAction({ key: "Enter", shiftKey: false })).toBe("send");
    expect(composerKeyAction({ key: "Enter", shiftKey: true })).toBe("newline");
  });

  it("ignores stale thread results after navigation or revocation", () => {
    expect(acceptAsyncResult({ generation: 1, currentGeneration: 2, revokedGeneration: null, value: "A" })).toBeNull();
    expect(acceptAsyncResult({ generation: 2, currentGeneration: 2, revokedGeneration: null, value: "B" })).toBe("B");
    expect(acceptAsyncResult({ generation: 3, currentGeneration: 4, revokedGeneration: 3, value: "secret" })).toBeNull();
    expect(acceptAsyncResult({ generation: 4, currentGeneration: 4, revokedGeneration: 3, value: "later" })).toBe("later");
  });

  it("follows transcript cursors past the first hundred messages without duplicating or looping", () => {
    const first = Array.from({ length: 100 }, (_, index) => message(index));
    const second = [message(100)];
    const page = appendTranscriptPage(first, second);
    expect(page.messages).toHaveLength(101);
    expect(page.messages[100]?.id).toBe("m-100");
    expect(watermarkTarget(page.messages)).toBe("m-100");
    expect(appendTranscriptPage(page.messages, second).added).toBe(0);
    expect(nextTranscriptCursor(null, "cursor-2", 100)).toBe("cursor-2");
    expect(nextTranscriptCursor("cursor-2", "cursor-2", 1)).toBeNull();
    expect(nextTranscriptCursor("cursor-2", "cursor-3", 0)).toBeNull();
    const inbox = appendInboxItems([{ id: "c1" }], [{ id: "c1" }, { id: "c2" }]);
    expect(inbox.items.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(inbox.added).toBe(1);
  });

  it("fails closed when a later inbox page is unauthorized", () => {
    expect(inboxPageDisposition(200)).toBe("commit");
    expect(inboxPageDisposition(403)).toBe("deny");
    expect(inboxPageDisposition(404)).toBe("deny");
    expect(inboxPageDisposition(500)).toBe("retry");
    expect(inboxPageDisposition(0)).toBe("retry");
    expect(inboxSurface({ status: 403, itemCount: 1, visibleCount: 1, filtered: false })).toBe("no-permission");
    expect(inboxSurface({ status: 503, itemCount: 0, visibleCount: 0, filtered: false })).toBe("error");
    expect(inboxSurface({ status: 0, itemCount: 0, visibleCount: 0, filtered: false })).toBe("error");
  });

  it("starts only one send while a submission is in flight and reuses the failed key", () => {
    let inFlight = false;
    let started = 0;
    for (let press = 0; press < 5; press += 1) {
      const decision = beginSend(inFlight, "oi");
      if (decision.started) {
        started += 1;
        inFlight = true;
      }
    }
    expect(started).toBe(1);
    expect(reuseSendKey({ key: "same", body: "oi" }, "oi")).toBe("same");
    expect(reuseSendKey({ key: "same", body: "oi" }, "alterado")).toBeNull();
  });

  it("discovers active project peers and keeps suspended people out of the picker", () => {
    const rows = [
      { organizationMembershipId: actor, displayName: "Eu", status: "ACTIVE" },
      { organizationMembershipId: peer, displayName: "Seed Contributor A", status: "ACTIVE" },
      { organizationMembershipId: peer, displayName: "Seed Contributor A", status: "ACTIVE" },
      { organizationMembershipId: "suspended", displayName: "Seed Suspended Member A", status: "SUSPENDED" },
      { organizationMembershipId: "removed", displayName: "Seed Removed Member A", status: "REMOVED" },
    ];
    expect(peersFromProjectMembers(rows, actor).map((member) => member.displayName)).toEqual(["Seed Contributor A"]);
    expect(membersFromProjectRows(rows, actor).some((member) => member.status === "SUSPENDED")).toBe(true);
    expect(peersFromProjectMembers(rows, actor).some((member) => member.displayName.includes("Beta"))).toBe(false);
  });
});

function message(index: number): MessageRecord {
  return {
    id: `m-${index}`,
    conversationId: "conv-direct",
    authorOrganizationMembershipId: index % 2 === 0 ? peer : actor,
    body: `corpo ${index}`,
    createdAt: `2026-10-02T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
    editedAt: null,
    deletedAt: null,
    version: 1,
    lifecycle: "VISIBLE",
    resourcePreviews: [],
  };
}
