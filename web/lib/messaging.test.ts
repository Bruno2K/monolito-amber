import { describe, expect, it } from "vitest";
import {
  appendUniqueMessage,
  authorizedSearchHits,
  authorizedUnreadTotal,
  buildInboxViews,
  canEditOwnMessage,
  canSendMessage,
  canTombstoneOwnMessage,
  composerKeyAction,
  contentFits,
  conversationFailure,
  eligibleDirectPeers,
  filterInbox,
  inboxSurface,
  nextInboxIndex,
  peerMembershipId,
  privacySafeSnippet,
  resourcePresentation,
  reuseSendKey,
  transcriptBody,
  visiblePendingSends,
  watermarkTarget,
  type InboxItem,
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
        { id: "other-org", displayName: "Fora", status: "ACTIVE" },
      ].filter((member) => member.id !== "other-org" || member.status === "ACTIVE"),
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
});
