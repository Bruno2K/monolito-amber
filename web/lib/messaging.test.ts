import { describe, expect, it } from "vitest";
import {
  acceptAsyncResult,
  acceptCreateResult,
  applySendFailure,
  appendInboxItems,
  appendTranscriptPage,
  appendUniqueMessage,
  authorizedSearchHits,
  authorizedUnreadTotal,
  activeConversationMissing,
  beginLockedSend,
  beginSend,
  buildInboxViews,
  canEditOwnMessage,
  canSendMessage,
  canTombstoneOwnMessage,
  composerKeyAction,
  contentFits,
  acceptTranscriptRefresh,
  draftAfterSuccessfulSend,
  mutationMayConsumeTranscript,
  nextTombstoneAttempt,
  settleReadState,
  transcriptAfterReadState,
  normalizeComposerBody,
  discardFailedSends,
  conversationFailure,
  eligibleDirectPeers,
  filterInbox,
  inboxPageDisposition,
  inboxSurface,
  mergeTranscriptByVersion,
  membersFromProjectRows,
  nextInboxIndex,
  nextTranscriptCursor,
  peersFromProjectMembers,
  peerMembershipId,
  privacySafeSnippet,
  reconciledTombstone,
  releaseSendLock,
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
      visiblePendingSends(
        [{ localId: "local", key: "same", body: "oi", raw: "oi", conversationId: "c", lifecycle: "pending" }],
        new Set(["m1"]),
        new Map([["local", "m1"]]),
      ),
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
      openLabel: null,
    });
    const project = resourcePresentation({ type: "PROJECT", id: "p1", authorized: true, title: "Aurora" });
    expect(project.href).toBe("/projects/p1/overview");
    expect(project.openLabel).toBe("Abrir projeto");
    expect(resourcePresentation({ type: "TASK", id: "t1", authorized: true, title: "Tarefa" }).href).toBeNull();
    expect(resourcePresentation({ type: "TASK", id: "t1", authorized: true, title: "Tarefa" }).openLabel).toBeNull();
    const task = resourcePresentation({ type: "TASK", id: "t1", authorized: true, title: "Tarefa", projectId: "p1" });
    expect(task.href).toBe("/projects/p1/planner?inspect=t1");
    expect(task.openLabel).toBe("Abrir tarefa");
    const milestone = resourcePresentation({ type: "MILESTONE", id: "m1", authorized: true, projectId: "p1" });
    expect(milestone.href).toBe("/projects/p1/planner?view=milestones&milestone=m1");
    expect(milestone.openLabel).toBe("Abrir marco");
    const deliverable = resourcePresentation({ type: "DELIVERABLE", id: "d1", authorized: true, projectId: "p1" });
    expect(deliverable.href).toBe("/projects/p1/deliverables?inspect=d1");
    expect(deliverable.openLabel).toBe("Abrir entrega");
    expect(resourcePresentation({ type: "GATE", id: "g1", authorized: true, title: "Gate", projectId: "p1" }).href).toBeNull();
    expect(resourcePresentation({ type: "DOCUMENT", id: "doc", authorized: true, title: "Doc", projectId: "p1" }).href).toBeNull();
    expect(
      resourcePresentation({ type: "TASK", id: "t1", authorized: false, title: "Sigiloso", projectId: "p1" }),
    ).toEqual({
      name: "Recurso protegido",
      caption: "Vínculo de colaboração. Não é uma decisão governada.",
      href: null,
      openLabel: null,
    });
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

  it("revokes an open conversation omitted by a complete inbox and ignores an incomplete set", () => {
    const allowed = new Set(["kept"]);
    expect(activeConversationMissing("open", allowed)).toBe(true);
    expect(activeConversationMissing("kept", allowed)).toBe(false);
    expect(activeConversationMissing(null, allowed)).toBe(false);
  });

  it("releases only the matching send lock after A resolves while B is pending", () => {
    const lockA = { conversationId: "A", organizationId: "org-a", generation: 1, localId: "local-a", key: "key-a" };
    const lockB = { conversationId: "B", organizationId: "org-a", generation: 4, localId: "local-b", key: "key-b" };
    const startedA = beginLockedSend(null, lockA, "from A");
    expect(startedA.started).toBe(true);
    const startedB = beginLockedSend(lockB, lockA, "late");
    expect(startedB).toEqual({ lock: lockB, started: false });
    expect(releaseSendLock(lockB, lockA)).toBe(lockB);
    const repeated = beginLockedSend(lockB, { ...lockB, key: "other" }, "again");
    expect(repeated.started).toBe(false);
    expect(releaseSendLock(lockB, lockB)).toBeNull();
    expect(reuseSendKey({ key: "key-b", body: "again" }, "again")).toBe("key-b");
  });

  it("keeps a newer mutation when an older poll snapshot arrives", () => {
    const sent = message(1);
    const edited = { ...message(2), version: 3, body: "editada" };
    const tombstoned = { ...message(3), version: 2, lifecycle: "TOMBSTONE" as const, body: null, deletedAt: "2026-10-02T13:00:00.000Z" };
    const current = [sent, edited, tombstoned];
    const olderPoll = [
      { ...sent, version: 1 },
      { ...edited, version: 1, body: "antiga" },
      { ...tombstoned, version: 1, lifecycle: "VISIBLE" as const, body: "visível", deletedAt: null },
    ];
    const merged = mergeTranscriptByVersion(current, olderPoll);
    expect(merged.find((row) => row.id === edited.id)?.body).toBe("editada");
    expect(merged.find((row) => row.id === tombstoned.id)?.lifecycle).toBe("TOMBSTONE");
    expect(merged.find((row) => row.id === sent.id)?.id).toBe(sent.id);
    expect(merged).toHaveLength(3);
  });

  it("refreshes authorization previews at the same version without rolling back a newer mutation", () => {
    const authorized = {
      ...message(1),
      resourcePreviews: [{ type: "TASK", id: "t1", authorized: true, title: "Secreto", projectId: "p1" }],
    };
    const unauthorized = {
      ...authorized,
      resourcePreviews: [{ type: "TASK", id: "t1", authorized: false }],
    };
    const revoked = mergeTranscriptByVersion([authorized], [unauthorized]);
    expect(revoked[0]?.resourcePreviews).toEqual([{ type: "TASK", id: "t1", authorized: false }]);
    expect(revoked[0]?.body).toBe(authorized.body);
    const granted = mergeTranscriptByVersion([unauthorized], [authorized]);
    expect(granted[0]?.resourcePreviews[0]?.authorized).toBe(true);
    const edited = { ...authorized, version: 4, body: "editada", resourcePreviews: [] as MessageRecord["resourcePreviews"] };
    const olderAuthorized = { ...authorized, version: 2, body: "antiga" };
    const kept = mergeTranscriptByVersion([edited], [olderAuthorized]);
    expect(kept[0]?.body).toBe("editada");
    expect(kept[0]?.version).toBe(4);
    expect(kept[0]?.resourcePreviews).toEqual([]);
    const tombstoned = { ...message(2), version: 3, lifecycle: "TOMBSTONED", body: null, deletedAt: "2026-10-02T13:00:00.000Z" };
    const restored = mergeTranscriptByVersion([tombstoned], [{ ...tombstoned, version: 1, lifecycle: "VISIBLE", body: "visível", deletedAt: null }]);
    expect(restored[0]?.body).toBeNull();
    expect(restored[0]?.lifecycle).toBe("TOMBSTONED");
    const mixed = mergeTranscriptByVersion([edited, tombstoned], [unauthorized, { ...tombstoned, version: 3, resourcePreviews: unauthorized.resourcePreviews }]);
    expect(mixed.find((row) => row.id === edited.id)?.body).toBe("editada");
    expect(mixed.find((row) => row.id === tombstoned.id)?.resourcePreviews).toEqual(unauthorized.resourcePreviews);
    expect(mixed.find((row) => row.id === tombstoned.id)?.body).toBeNull();
  });

  it("keeps a draft typed during send and preserves a failed row beside a new send", () => {
    expect(draftAfterSuccessfulSend("A", "A", true)).toBe("");
    expect(draftAfterSuccessfulSend("B", "A", true)).toBe("B");
    expect(draftAfterSuccessfulSend("novo", "A", false)).toBe("novo");
    const failed = { localId: "a", key: "key-a", body: "A", raw: "A", conversationId: "c", lifecycle: "pending" as const };
    const afterFail = applySendFailure([failed], "a", new Set());
    expect(afterFail[0]?.lifecycle).toBe("failed");
    const alongside = [
      ...afterFail,
      { localId: "b", key: "key-b", body: "B", raw: "B", conversationId: "c", lifecycle: "pending" as const },
    ];
    expect(alongside.filter((row) => row.lifecycle === "failed")).toHaveLength(1);
    expect(applySendFailure(alongside, "a", new Set(["a"]))).toEqual([alongside[1]]);
    expect(reuseSendKey({ key: "key-a", body: "A" }, "A")).toBe("key-a");
    expect(reconciledTombstone({ lifecycle: "TOMBSTONED", deletedAt: "2026-10-02T13:00:00.000Z", version: 2 })).toBe("done");
    expect(reconciledTombstone({ lifecycle: "EDITED", deletedAt: null, version: 4 })).toBe("retry");
    expect(reconciledTombstone(undefined)).toBe("unavailable");
  });

  it("ignores a Direct or Team create response from the previous Organization", () => {
    const attempt = { organizationId: "org-a", generation: 2, requestId: "req-a" };
    expect(
      acceptCreateResult({
        ...attempt,
        currentOrganizationId: "org-b",
        currentGeneration: 3,
        currentRequestId: "req-b",
        dialogOpen: true,
      }),
    ).toBe(false);
    expect(
      acceptCreateResult({
        ...attempt,
        currentOrganizationId: "org-a",
        currentGeneration: 2,
        currentRequestId: "req-a",
        dialogOpen: false,
      }),
    ).toBe(false);
    expect(
      acceptCreateResult({
        ...attempt,
        currentOrganizationId: "org-a",
        currentGeneration: 2,
        currentRequestId: "req-a",
        dialogOpen: true,
      }),
    ).toBe(true);
  });

  it("discards a failed send when the draft changes and keeps it retryable otherwise", () => {
    const failed = { localId: "p1", key: "same-key", body: "oi", raw: "oi", conversationId: "A", lifecycle: "failed" as const };
    expect(discardFailedSends([failed, { ...failed, localId: "p2", lifecycle: "pending" }])).toEqual([
      { ...failed, localId: "p2", lifecycle: "pending" },
    ]);
    expect(reuseSendKey({ key: failed.key, body: failed.body }, failed.body)).toBe("same-key");
    expect(reuseSendKey({ key: failed.key, body: failed.body }, "novo texto")).toBeNull();
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

  it("ignores an older transcript refresh after a newer revocation response", () => {
    const context = {
      generation: 4,
      currentGeneration: 4,
      revokedGeneration: null,
      organizationId: "org-a",
      currentOrganizationId: "org-a",
      conversationId: "conv-direct",
      currentConversationId: "conv-direct",
    };
    let latestSeq = 0;
    const authorized = {
      ...message(1),
      resourcePreviews: [{ type: "TASK" as const, id: "t1", authorized: true, title: "Secreto", projectId: "p1" }],
    };
    const unauthorized = {
      ...authorized,
      resourcePreviews: [{ type: "TASK" as const, id: "t1", authorized: false }],
    };
    const requestA = ++latestSeq;
    const requestB = ++latestSeq;
    let state: MessageRecord = authorized;
    if (acceptTranscriptRefresh({ ...context, requestSeq: requestB, latestSeq })) {
      state = mergeTranscriptByVersion([state], [unauthorized])[0] ?? state;
    }
    if (acceptTranscriptRefresh({ ...context, requestSeq: requestA, latestSeq })) {
      state = mergeTranscriptByVersion([state], [authorized])[0] ?? state;
    }
    expect(state.resourcePreviews).toEqual([{ type: "TASK", id: "t1", authorized: false }]);
    expect(state.resourcePreviews[0]?.title).toBeUndefined();
    expect(state.resourcePreviews[0]?.projectId).toBeUndefined();

    const requestC = ++latestSeq;
    const requestD = ++latestSeq;
    let inverse: MessageRecord = unauthorized;
    if (acceptTranscriptRefresh({ ...context, requestSeq: requestC, latestSeq })) {
      inverse = authorized;
    }
    if (acceptTranscriptRefresh({ ...context, requestSeq: requestD, latestSeq })) {
      inverse = mergeTranscriptByVersion([inverse], [authorized])[0] ?? inverse;
    }
    expect(inverse.resourcePreviews[0]?.authorized).toBe(true);
    expect(inverse.resourcePreviews[0]?.title).toBe("Secreto");
    expect(
      acceptTranscriptRefresh({
        ...context,
        requestSeq: requestD,
        latestSeq,
        currentOrganizationId: "org-b",
      }),
    ).toBe(false);
    expect(
      acceptTranscriptRefresh({
        ...context,
        requestSeq: requestD,
        latestSeq,
        currentConversationId: "other",
      }),
    ).toBe(false);
  });

  it("clears only the exact raw draft that was submitted", () => {
    expect(normalizeComposerBody(" oi ")).toBe("oi");
    expect(normalizeComposerBody("  a \n\n b  ")).toBe("a \n\n b");
    expect(normalizeComposerBody(" \n ")).toBe("");
    expect(draftAfterSuccessfulSend(" oi ", " oi ", true)).toBe("");
    expect(draftAfterSuccessfulSend("oi agora", " oi ", true)).toBe("oi agora");
    expect(draftAfterSuccessfulSend(" oi ", " oi ", false)).toBe(" oi ");
    expect(draftAfterSuccessfulSend("nova", " oi ", false)).toBe("nova");
  });

  it("reconciles a tombstone from the loaded snapshot instead of the stale version", () => {
    const key = "tombstone-key";
    expect(
      nextTombstoneAttempt({
        refresh: "ready",
        message: { lifecycle: "EDITED", deletedAt: null, version: 5 },
        previousVersion: 4,
        idempotencyKey: key,
      }),
    ).toEqual({ action: "retry", version: 5, key });
    expect(
      nextTombstoneAttempt({
        refresh: "ready",
        message: { lifecycle: "TOMBSTONED", deletedAt: "2026-10-02T13:00:00.000Z", version: 6 },
        previousVersion: 4,
        idempotencyKey: key,
      }).action,
    ).toBe("done");
    expect(
      nextTombstoneAttempt({
        refresh: "ready",
        message: { lifecycle: "TOMBSTONED", deletedAt: "2026-10-02T13:00:00.000Z", version: 3 },
        previousVersion: 3,
        idempotencyKey: key,
      }),
    ).toMatchObject({ action: "done", key });
    expect(
      nextTombstoneAttempt({
        refresh: "ready",
        message: undefined,
        previousVersion: 4,
        idempotencyKey: key,
      }).action,
    ).toBe("unavailable");
    expect(
      nextTombstoneAttempt({
        refresh: "denied",
        message: { lifecycle: "VISIBLE", deletedAt: null, version: 4 },
        previousVersion: 4,
        idempotencyKey: key,
      }),
    ).toEqual({ action: "stop", version: null, key });
    expect(
      nextTombstoneAttempt({
        refresh: "failed",
        message: { lifecycle: "VISIBLE", deletedAt: null, version: 4 },
        previousVersion: 4,
        idempotencyKey: key,
      }).version,
    ).toBeNull();
    expect(
      nextTombstoneAttempt({
        refresh: "stale",
        message: undefined,
        previousVersion: 4,
        idempotencyKey: key,
      }).action,
    ).toBe("stop");
  });
});

  it("retries oi without clearing a trailing-space draft or another context", () => {
    const failed = { localId: "p1", key: "same-key", body: "oi", raw: "oi", conversationId: "A", lifecycle: "failed" as const };
    expect(failed.raw).toBe("oi");
    expect(failed.raw).not.toContain("\u0000");
    expect(JSON.stringify(failed)).not.toContain("\\u0000");
    const modified = "oi ";
    expect(modified).not.toBe(failed.raw);
    expect(draftAfterSuccessfulSend(modified, failed.raw, true)).toBe("oi ");
    expect(draftAfterSuccessfulSend(failed.raw, failed.raw, true)).toBe("");
    expect(draftAfterSuccessfulSend("oi ", failed.raw, false)).toBe("oi ");
    expect(draftAfterSuccessfulSend("outro", failed.raw, false)).toBe("outro");
    expect(reuseSendKey({ key: failed.key, body: failed.body }, failed.body)).toBe("same-key");
    expect(reuseSendKey({ key: failed.key, body: failed.body }, "oi ")).toBeNull();
  });

  it("treats a superseded read-state as stale and keeps a recoverable failure visible", () => {
    const snapshotA = [{ id: "m1", version: 2, lifecycle: "VISIBLE" as const, deletedAt: null }];
    const superseded = settleReadState({ aborted: true, stillCurrent: false, ok: false, status: 0 });
    expect(superseded).toBe("stale");
    const lateA = transcriptAfterReadState(superseded, snapshotA);
    expect(lateA).toEqual({ status: "stale" });
    expect("messages" in lateA).toBe(false);
    expect(mutationMayConsumeTranscript(lateA.status)).toBe(false);
    expect(
      nextTombstoneAttempt({
        refresh: "stale",
        message: snapshotA[0],
        previousVersion: 2,
        idempotencyKey: "edit-key",
      }),
    ).toEqual({ action: "stop", version: null, key: "edit-key" });
    const snapshotB = [{ id: "m1", version: 5, lifecycle: "EDITED" as const, deletedAt: null }];
    const current = transcriptAfterReadState(
      settleReadState({ aborted: false, stillCurrent: true, ok: false, status: 503 }),
      snapshotB,
    );
    expect(current).toEqual({ status: "ready", messages: snapshotB, readState: "recoverable" });
    expect(mutationMayConsumeTranscript("ready")).toBe(true);
    expect(settleReadState({ aborted: true, stillCurrent: true, ok: false, status: 0 })).toBe("aborted");
    expect(settleReadState({ aborted: false, stillCurrent: true, ok: true, status: 204 })).toBe("applied");
    for (const status of [401, 403, 404]) {
      expect(settleReadState({ aborted: false, stillCurrent: true, ok: false, status })).toBe("denied");
      expect(settleReadState({ aborted: false, stillCurrent: false, ok: false, status })).toBe("stale");
    }
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
