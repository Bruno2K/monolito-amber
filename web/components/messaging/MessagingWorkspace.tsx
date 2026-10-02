"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import type { ApiResult } from "../../lib/types";
import {
  FIGMA_MESSAGE_NODES,
  MESSAGE_POLL_MS,
  acceptAsyncResult,
  activeConversationMissing,
  appendInboxItems,
  appendTranscriptPage,
  appendUniqueMessage,
  authorLabel,
  authorizedSearchHits,
  authorizedUnreadTotal,
  beginLockedSend,
  buildInboxViews,
  canEditOwnMessage,
  canSendMessage,
  canTombstoneOwnMessage,
  composerKeyAction,
  conversationFailure,
  eligibleDirectPeers,
  filterInbox,
  formatMessageTime,
  inboxPageDisposition,
  inboxSurface,
  isAuthorizationMiss,
  acceptCreateResult,
  applySendFailure,
  acceptTranscriptRefresh,
  draftAfterSuccessfulSend,
  normalizeComposerBody,
  isReadOnlyConversation,
  mergeTranscriptByVersion,
  nextInboxIndex,
  nextTranscriptCursor,
  nextTombstoneAttempt,
  releaseSendLock,
  resourcePresentation,
  reuseSendKey,
  transcriptBody,
  visiblePendingSends,
  watermarkTarget,
  type DirectoryMember,
  type InboxItem,
  type MessageRecord,
  type MessagingKindFilter,
  type MessagingSurface,
  type PendingSend,
  type SearchHit,
  type SendLock,
  type TeamName,
} from "../../lib/messaging";
import { newIdempotencyKey } from "../../lib/planning";
import { useShell } from "../session/ShellProvider";
import { MessagingState } from "./MessagingStates";

interface InboxPage {
  items: InboxItem[];
  nextCursor: string | null;
}

interface MessagePage {
  items: MessageRecord[];
  nextCursor: string | null;
}

type DialogMode =
  | { type: "create" }
  | { type: "edit"; message: MessageRecord }
  | { type: "tombstone"; message: MessageRecord; key: string }
  | { type: "edit-conflict"; messageId: string; detail: string }
  | { type: "tombstone-conflict"; messageId: string; key: string; version: number; detail: string }
  | null;

type DirectoryState =
  | { kind: "loading" }
  | { kind: "ready"; peers: DirectoryMember[] }
  | { kind: "error"; detail: string };

type RequestOutcome<T> = ApiResult<T> | "aborted";

const TRANSCRIPT_PAGE_GUARD = 100;
const INBOX_PAGE_GUARD = 20;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function networkResult<T>(): ApiResult<T> {
  return {
    ok: false,
    status: 0,
    body: null,
    problem: {
      status: 0,
      code: "NETWORK",
      title: "Network",
      detail: "Não foi possível contactar o servidor.",
    },
  };
}

async function request<T>(path: string, signal: AbortSignal, init?: RequestInit): Promise<RequestOutcome<T>> {
  try {
    return await api<T>(path, { ...init, signal });
  } catch (error) {
    if (isAbortError(error)) {
      return "aborted";
    }
    return networkResult();
  }
}

export function MessagingWorkspace({ conversationId }: { conversationId: string | null }) {
  const router = useRouter();
  const { state: shell } = useShell();
  const orgId = shell.session?.activeOrganizationId ?? null;
  const actorMembershipId =
    shell.organizations.find((org) => org.id === orgId)?.membershipId ?? shell.session?.membership?.id ?? null;
  const titleId = useId();
  const liveId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const inboxGen = useRef(0);
  const threadGen = useRef(0);
  const threadRevokedGen = useRef<number | null>(null);
  const searchGen = useRef(0);
  const directoryGen = useRef(0);
  const conversationRef = useRef<string | null>(conversationId);
  const inboxRef = useRef<InboxItem[]>([]);
  const sendLock = useRef<SendLock | null>(null);
  const orgRef = useRef(orgId);
  const createGen = useRef(0);
  const createRequest = useRef<string | null>(null);
  const createAbort = useRef<AbortController | null>(null);
  const dialogOpen = useRef(false);
  const discardedSends = useRef(new Set<string>());
  const messagesRef = useRef<MessageRecord[]>([]);
  const transcriptSeq = useRef(0);
  const transcriptAbort = useRef<AbortController | null>(null);
  orgRef.current = orgId;
  const inboxCommitted = useRef(false);
  const seenOrg = useRef<string | null | undefined>(undefined);
  conversationRef.current = conversationId;

  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const [inboxStatus, setInboxStatus] = useState<number | null>(null);
  const [inboxDetail, setInboxDetail] = useState<string | undefined>();
  const [inboxWarning, setInboxWarning] = useState<string | null>(null);
  const [directory, setDirectory] = useState<DirectoryState>({ kind: "loading" });
  const [teams, setTeams] = useState<TeamName[]>([]);
  const [kind, setKind] = useState<MessagingKindFilter>("ALL");
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [active, setActive] = useState<InboxItem | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [threadState, setThreadState] = useState<MessagingSurface | "idle">("idle");
  const [threadDetail, setThreadDetail] = useState<string | undefined>();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingSend[]>([]);
  const [resolvedIds, setResolvedIds] = useState<Map<string, string>>(new Map());
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedSend, setFailedSend] = useState<{ key: string; body: string } | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [dialogDraft, setDialogDraft] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [peerQuery, setPeerQuery] = useState("");
  const [announce, setAnnounce] = useState("");
  const [directoryNonce, setDirectoryNonce] = useState(0);
  const [inboxNonce, setInboxNonce] = useState(0);
  const [threadNonce, setThreadNonce] = useState(0);
  const [searchNonce, setSearchNonce] = useState(0);
  const watermarkSent = useRef<string | null>(null);
  messagesRef.current = messages;
  dialogOpen.current = dialog !== null;
  const [scopeOrg, setScopeOrg] = useState(orgId);
  if (scopeOrg !== orgId) {
    setScopeOrg(orgId);
    inboxGen.current += 1;
    threadGen.current += 1;
    searchGen.current += 1;
    directoryGen.current += 1;
    createGen.current += 1;
    createRequest.current = null;
    createAbort.current?.abort();
    transcriptAbort.current?.abort();
    transcriptSeq.current += 1;
    messagesRef.current = [];
    dialogOpen.current = false;
    sendLock.current = null;
    discardedSends.current = new Set();
    inboxCommitted.current = false;
    inboxRef.current = [];
    setInbox([]);
    setSearchHits([]);
    setMessages([]);
    setActive(null);
    setPending([]);
    setDraft("");
    setDirectory({ kind: "loading" });
    setTeams([]);
    setDialog(null);
    setSendError(null);
    setFailedSend(null);
    setSending(false);
    setRefreshError(null);
    setThreadState(conversationId ? "loading" : "idle");
  }

  function rememberInbox(next: InboxItem[]) {
    inboxRef.current = next;
    setInbox(next);
  }

  function commitAuthorizedInbox(items: InboxItem[]) {
    inboxCommitted.current = true;
    rememberInbox(items);
    setInboxCursor(null);
    setInboxStatus(200);
    setInboxDetail(undefined);
    setInboxWarning(null);
    const allowed = new Set(items.map((item) => item.id));
    setSearchHits((hits) => hits.filter((hit) => allowed.has(hit.conversationId)));
    const id = conversationRef.current;
    if (activeConversationMissing(id, allowed)) {
      revokeThread(threadGen.current, id as string, "A conversa não está mais na caixa autorizada.");
    }
  }

  function finishSend(lock: SendLock) {
    const next = releaseSendLock(sendLock.current, lock);
    if (next === sendLock.current && next !== null) {
      return;
    }
    sendLock.current = next;
    if (next === null) {
      setSending(false);
    }
  }

  function threadIsCurrent(generation: number, id: string): boolean {
    return (
      acceptAsyncResult({
        generation,
        currentGeneration: threadGen.current,
        revokedGeneration: threadRevokedGen.current,
        value: true,
      }) === true && conversationRef.current === id
    );
  }

  function revokeThread(generation: number, id: string, detail?: string) {
    transcriptAbort.current?.abort();
    transcriptSeq.current += 1;
    threadRevokedGen.current = generation;
    threadGen.current = generation + 1;
    if (conversationRef.current !== id) {
      return;
    }
    const nextInbox = inboxRef.current.filter((row) => row.id !== id);
    rememberInbox(nextInbox);
    messagesRef.current = [];
    setMessages([]);
    setActive(null);
    setPending([]);
    discardedSends.current = new Set();
    setDraft("");
    setSendError(null);
    setFailedSend(null);
    setSending(false);
    sendLock.current = null;
    setRefreshError(null);
    setDialog(null);
    setThreadState("revoked");
    setThreadDetail(detail);
    setSearchHits((hits) => hits.filter((hit) => hit.conversationId !== id));
    setAnnounce("Conversa indisponível. O conteúdo protegido foi removido.");
  }

  useEffect(() => {
    if (seenOrg.current !== orgId) {
      seenOrg.current = orgId;
      inboxCommitted.current = false;
    }
    const generation = ++inboxGen.current;
    const controller = new AbortController();
    if (!inboxCommitted.current) {
      setInboxStatus(null);
      setInboxWarning(null);
      rememberInbox([]);
      setSearchHits([]);
    }

    void (async () => {
      const collected: InboxItem[] = [];
      let cursor: string | null = null;
      let page = 0;
      while (page < INBOX_PAGE_GUARD) {
        const inboxPath: string = `/api/v1/conversations?pageSize=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const result = await request<InboxPage>(inboxPath, controller.signal);
        if (result === "aborted" || generation !== inboxGen.current) {
          return;
        }
        if (!result.ok) {
          const disposition = inboxPageDisposition(result.status);
          if (disposition === "deny") {
            inboxCommitted.current = false;
            rememberInbox([]);
            setSearchHits([]);
            setInboxCursor(null);
            setInboxStatus(result.status);
            setInboxDetail(result.problem.detail);
            setInboxWarning(null);
            return;
          }
          if (!inboxCommitted.current) {
            rememberInbox([]);
            setInboxStatus(result.status);
            setInboxDetail(result.problem.detail);
          } else {
            setInboxWarning(result.problem.detail);
          }
          return;
        }
        const pageItems = appendInboxItems(collected, result.body.items);
        collected.splice(0, collected.length, ...pageItems.items);
        cursor = nextTranscriptCursor(cursor, result.body.nextCursor, pageItems.added);
        page += 1;
        if (!cursor) {
          break;
        }
      }
      if (generation !== inboxGen.current) {
        return;
      }
      if (cursor) {
        rememberInbox([]);
        setInboxStatus(503);
        setInboxDetail("A caixa de entrada não foi carregada por completo.");
        return;
      }
      commitAuthorizedInbox(collected);
    })();

    return () => controller.abort();
  }, [orgId, inboxNonce]);

  useEffect(() => {
    const generation = ++directoryGen.current;
    const controller = new AbortController();
    setDirectory({ kind: "loading" });
    void (async () => {
      if (!orgId) {
        if (generation === directoryGen.current) {
          setDirectory({ kind: "ready", peers: [] });
        }
        return;
      }
      const [candidateResult, teamResult] = await Promise.all([
        request<{ items: Array<{ id: string; displayName: string }> }>("/api/v1/conversations/direct-candidates", controller.signal),
        request<{ items: TeamName[] }>(`/api/v1/organizations/${orgId}/teams`, controller.signal),
      ]);
      if (candidateResult === "aborted" || teamResult === "aborted" || generation !== directoryGen.current) {
        return;
      }
      setTeams(teamResult.ok ? teamResult.body.items : []);
      if (!candidateResult.ok) {
        setDirectory({
          kind: "error",
          detail: isAuthorizationMiss(candidateResult.status)
            ? "Pessoas elegíveis indisponíveis para esta sessão."
            : candidateResult.problem.detail,
        });
        return;
      }
      setDirectory({
        kind: "ready",
        peers: candidateResult.body.items.map((peer) => ({
          id: peer.id,
          displayName: peer.displayName,
          status: "ACTIVE",
        })),
      });
    })();
    return () => controller.abort();
  }, [orgId, actorMembershipId, directoryNonce]);

  useEffect(() => {
    const generation = ++threadGen.current;
    threadRevokedGen.current = null;
    watermarkSent.current = null;
    setActive(null);
    setMessages([]);
    setPending([]);
    discardedSends.current = new Set();
    setResolvedIds(new Map());
    setDraft("");
    setSendError(null);
    setFailedSend(null);
    setSending(false);
    sendLock.current = null;
    setRefreshError(null);
    setDialog(null);
    setDialogError(null);
    setDialogPending(false);
    if (!conversationId) {
      transcriptAbort.current?.abort();
      transcriptSeq.current += 1;
      setThreadState("idle");
      setThreadDetail(undefined);
      return;
    }
    setThreadState("loading");
    setThreadDetail(undefined);
    const request = beginTranscriptRequest();
    void loadTranscript(conversationId, generation, request.signal, "replace", request.requestSeq, request.organizationId);
    return () => {
      transcriptAbort.current?.abort();
      transcriptSeq.current += 1;
    };
  }, [conversationId, threadNonce, orgId]);

  function beginTranscriptRequest(): { requestSeq: number; signal: AbortSignal; organizationId: string | null } {
    transcriptAbort.current?.abort();
    const controller = new AbortController();
    transcriptAbort.current = controller;
    return { requestSeq: ++transcriptSeq.current, signal: controller.signal, organizationId: orgRef.current };
  }

  function transcriptRequestCurrent(requestSeq: number, generation: number, id: string, organizationId: string | null): boolean {
    return acceptTranscriptRefresh({
      requestSeq,
      latestSeq: transcriptSeq.current,
      generation,
      currentGeneration: threadGen.current,
      revokedGeneration: threadRevokedGen.current,
      organizationId,
      currentOrganizationId: orgRef.current,
      conversationId: id,
      currentConversationId: conversationRef.current,
    });
  }

  async function loadTranscript(
    id: string,
    generation: number,
    signal: AbortSignal,
    mode: "replace" | "refresh",
    requestSeq: number,
    organizationId: string | null,
  ): Promise<{ status: "ready"; messages: MessageRecord[] } | { status: "stale" | "denied" | "failed" }> {
    const stillCurrent = () => transcriptRequestCurrent(requestSeq, generation, id, organizationId);
    const conversationResult = await request<InboxItem>(`/api/v1/conversations/${id}`, signal);
    if (conversationResult === "aborted" || !stillCurrent()) {
      return { status: "stale" };
    }
    if (!conversationResult.ok) {
      if (isAuthorizationMiss(conversationResult.status)) {
        revokeThread(generation, id, conversationResult.problem.detail);
        return { status: "denied" };
      }
      if (mode === "refresh") {
        setRefreshError(conversationResult.problem.detail);
        return { status: "failed" };
      }
      setThreadState(conversationFailure(conversationResult.status));
      setThreadDetail(conversationResult.problem.detail);
      messagesRef.current = [];
      setMessages([]);
      setActive(null);
      return { status: "failed" };
    }
    let transcript: MessageRecord[] = [];
    let cursor: string | null = null;
    let page = 0;
    while (page < TRANSCRIPT_PAGE_GUARD) {
      const path = `/api/v1/conversations/${id}/messages?pageSize=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const pageResult = await request<MessagePage>(path, signal);
      if (pageResult === "aborted" || !stillCurrent()) {
        return { status: "stale" };
      }
      if (!pageResult.ok) {
        if (isAuthorizationMiss(pageResult.status)) {
          revokeThread(generation, id, pageResult.problem.detail);
          return { status: "denied" };
        }
        if (mode === "refresh") {
          setRefreshError(pageResult.problem.detail);
          return { status: "failed" };
        }
        setThreadState("error");
        setThreadDetail(pageResult.problem.detail);
        messagesRef.current = [];
        setMessages([]);
        setActive(null);
        return { status: "failed" };
      }
      const appended = appendTranscriptPage(transcript, pageResult.body.items);
      transcript = appended.messages;
      cursor = nextTranscriptCursor(cursor, pageResult.body.nextCursor, appended.added);
      page += 1;
      if (!cursor) {
        break;
      }
    }
    if (!stillCurrent()) {
      return { status: "stale" };
    }
    if (cursor) {
      if (mode === "refresh") {
        setRefreshError("A transcrição não foi carregada por completo.");
        return { status: "failed" };
      }
      setThreadState("error");
      setThreadDetail("A transcrição não foi carregada por completo.");
      messagesRef.current = [];
      setMessages([]);
      setActive(null);
      return { status: "failed" };
    }
    const merged = mode === "refresh" ? mergeTranscriptByVersion(messagesRef.current, transcript) : transcript;
    if (!stillCurrent()) {
      return { status: "stale" };
    }
    messagesRef.current = merged;
    setMessages(merged);
    setActive(conversationResult.body);
    setThreadState("ready");
    setThreadDetail(undefined);
    setRefreshError(null);
    const target = watermarkTarget(transcript);
    if (!target || watermarkSent.current === `${id}:${target}`) {
      return { status: "ready", messages: merged };
    }
    const read = await request(`/api/v1/conversations/${id}/read-state`, signal, {
      method: "PUT",
      body: JSON.stringify({ lastReadMessageId: target }),
    });
    if (read === "aborted" || !stillCurrent()) {
      return { status: "ready", messages: merged };
    }
    if (!read.ok) {
      if (isAuthorizationMiss(read.status)) {
        revokeThread(generation, id, read.problem.detail);
        return { status: "denied" };
      }
      setRefreshError(read.problem.detail);
      return { status: "ready", messages: merged };
    }
    watermarkSent.current = `${id}:${target}`;
    rememberInbox(inboxRef.current.map((row) => (row.id === id ? { ...row, unreadCount: 0 } : row)));
    return { status: "ready", messages: merged };
  }

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      const inboxGeneration = ++inboxGen.current;
      void (async () => {
        const collected: InboxItem[] = [];
        let cursor: string | null = null;
        let page = 0;
        while (page < INBOX_PAGE_GUARD) {
          const inboxPath: string = `/api/v1/conversations?pageSize=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
          const result = await request<InboxPage>(inboxPath, controller.signal);
          if (result === "aborted" || inboxGeneration !== inboxGen.current) {
            return;
          }
          if (!result.ok) {
            if (inboxPageDisposition(result.status) === "deny") {
              inboxCommitted.current = false;
              rememberInbox([]);
              setSearchHits([]);
              setInboxStatus(result.status);
              setInboxDetail(result.problem.detail);
              setInboxWarning(null);
              return;
            }
            setInboxWarning(result.problem.detail);
            return;
          }
          const pageItems = appendInboxItems(collected, result.body.items);
          collected.splice(0, collected.length, ...pageItems.items);
          cursor = nextTranscriptCursor(cursor, result.body.nextCursor, pageItems.added);
          page += 1;
          if (!cursor) {
            break;
          }
        }
        if (inboxGeneration !== inboxGen.current || cursor) {
          return;
        }
        commitAuthorizedInbox(collected);
      })();
      const id = conversationRef.current;
      if (id && threadStateRef.current === "ready") {
        const request = beginTranscriptRequest();
        void loadTranscript(id, threadGen.current, request.signal, "refresh", request.requestSeq, request.organizationId);
      }
    };
    const timer = window.setInterval(refresh, MESSAGE_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      controller.abort();
    };
  }, [conversationId, orgId]);

  const threadStateRef = useRef(threadState);
  threadStateRef.current = threadState;

  useEffect(() => {
    const generation = ++searchGen.current;
    const controller = new AbortController();
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchError(null);
      return () => controller.abort();
    }
    const handle = window.setTimeout(() => {
      void request<{ items: SearchHit[] }>(
        `/api/v1/conversations/search?q=${encodeURIComponent(q)}&pageSize=50`,
        controller.signal,
      ).then((result) => {
        if (result === "aborted" || generation !== searchGen.current) {
          return;
        }
        if (!result.ok) {
          setSearchHits([]);
          setSearchError(isAuthorizationMiss(result.status) ? null : result.problem.detail);
          return;
        }
        const allowed = new Set(inboxRef.current.map((item) => item.id));
        setSearchHits(authorizedSearchHits(result.body.items, allowed));
        setSearchError(null);
      });
    }, 250);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [query, inbox, orgId, searchNonce]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) {
      return;
    }
    if (dialog && !node.open) {
      node.showModal();
    }
    if (!dialog && node.open) {
      node.close();
      openerRef.current?.focus();
    }
  }, [dialog]);

  const views = useMemo(
    () =>
      buildInboxViews({
        items: inbox,
        actorMembershipId,
        members: directory.kind === "ready" ? directory.peers : null,
        teams,
      }),
    [inbox, actorMembershipId, directory, teams],
  );
  const visible = useMemo(() => filterInbox(views, kind, query), [views, kind, query]);
  const filtered = kind !== "ALL" || query.trim().length > 0;
  const surface = inboxSurface({
    status: inboxStatus,
    itemCount: views.length,
    visibleCount: visible.length,
    filtered,
  });
  const unread = authorizedUnreadTotal(visible);
  const peers = useMemo(() => {
    if (directory.kind !== "ready") {
      return [];
    }
    const eligible = eligibleDirectPeers(directory.peers, actorMembershipId);
    const q = peerQuery.trim().toLowerCase();
    return q ? eligible.filter((peer) => peer.displayName.toLowerCase().includes(q)) : eligible;
  }, [directory, peerQuery, actorMembershipId]);
  const teamChats = views.filter((item) => item.kind === "TEAM");
  const serverIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);
  const shownPending = visiblePendingSends(
    pending.filter((row) => row.conversationId === conversationId),
    serverIds,
    resolvedIds,
  );
  const readOnly = active ? isReadOnlyConversation(active) : false;
  const activeView = views.find((item) => item.id === active?.id);

  function openDialog(next: DialogMode, opener: HTMLElement | null) {
    openerRef.current = opener;
    setDialogError(null);
    setDialogPending(false);
    if (next?.type === "edit") {
      setDialogDraft(next.message.body ?? "");
    }
    setDialog(next);
  }

  function closeDialog() {
    createGen.current += 1;
    createRequest.current = null;
    createAbort.current?.abort();
    dialogOpen.current = false;
    setDialog(null);
    setDialogError(null);
    setDialogPending(false);
  }

  async function openConversation(id: string) {
    if (id === conversationId) {
      setThreadNonce((value) => value + 1);
      return;
    }
    router.push(`/messages/${id}`);
  }

  function beginCreate(kind: "direct" | "team"): { controller: AbortController; attempt: { organizationId: string; generation: number; requestId: string } } | null {
    if (!orgId) {
      return null;
    }
    createAbort.current?.abort();
    const controller = new AbortController();
    createAbort.current = controller;
    const attempt = {
      organizationId: orgId,
      generation: ++createGen.current,
      requestId: newIdempotencyKey(kind),
    };
    createRequest.current = attempt.requestId;
    dialogOpen.current = true;
    return { controller, attempt };
  }

  function createStillCurrent(attempt: { organizationId: string; generation: number; requestId: string }): boolean {
    return acceptCreateResult({
      organizationId: attempt.organizationId,
      generation: attempt.generation,
      requestId: attempt.requestId,
      currentOrganizationId: orgRef.current,
      currentGeneration: createGen.current,
      currentRequestId: createRequest.current,
      dialogOpen: dialogOpen.current,
    });
  }

  async function startDirect(membershipId: string) {
    const started = beginCreate("direct");
    if (!started) {
      return;
    }
    setDialogPending(true);
    setDialogError(null);
    const result = await request<InboxItem>("/api/v1/conversations/direct", started.controller.signal, {
      method: "POST",
      headers: { "Idempotency-Key": started.attempt.requestId },
      body: JSON.stringify({ organizationMembershipId: membershipId }),
    });
    if (!createStillCurrent(started.attempt)) {
      return;
    }
    setDialogPending(false);
    if (result === "aborted") {
      return;
    }
    if (!result.ok) {
      setDialogError(isAuthorizationMiss(result.status) ? "Participante indisponível." : result.problem.detail);
      return;
    }
    closeDialog();
    setAnnounce("Conversa direta aberta.");
    setInboxNonce((value) => value + 1);
    await openConversation(result.body.id);
  }

  async function openTeam(teamId: string) {
    const started = beginCreate("team");
    if (!started) {
      return;
    }
    setDialogPending(true);
    const result = await request<InboxItem>("/api/v1/conversations/team", started.controller.signal, {
      method: "POST",
      headers: { "Idempotency-Key": started.attempt.requestId },
      body: JSON.stringify({ teamId }),
    });
    if (!createStillCurrent(started.attempt)) {
      return;
    }
    setDialogPending(false);
    if (result === "aborted") {
      return;
    }
    if (!result.ok) {
      setDialogError(isAuthorizationMiss(result.status) ? "Equipe indisponível." : result.problem.detail);
      return;
    }
    closeDialog();
    setAnnounce("Conversa da equipe aberta.");
    setInboxNonce((value) => value + 1);
    await openConversation(result.body.id);
  }

  async function send(lock: SendLock, body: string, submittedRaw: string) {
    const controller = new AbortController();
    setSendError(null);
    setPending((rows) => {
      if (rows.some((row) => row.localId === lock.localId)) {
        return rows.map((row) => (row.localId === lock.localId ? { ...row, lifecycle: "retrying" } : row));
      }
      return [...rows, { localId: lock.localId, key: lock.key, body, conversationId: lock.conversationId, lifecycle: "pending" }];
    });
    const result = await request<MessageRecord>(`/api/v1/conversations/${lock.conversationId}/messages`, controller.signal, {
      method: "POST",
      headers: { "Idempotency-Key": lock.key },
      body: JSON.stringify({ body }),
    });
    finishSend(lock);
    const sameContext = threadIsCurrent(lock.generation, lock.conversationId) && orgRef.current === lock.organizationId;
    if (result === "aborted" || !sameContext) {
      setPending((rows) => rows.filter((row) => row.conversationId === conversationRef.current && row.localId !== lock.localId));
      return;
    }
    if (!result.ok) {
      if (isAuthorizationMiss(result.status)) {
        revokeThread(lock.generation, lock.conversationId, result.problem.detail);
        return;
      }
      setPending((rows) => applySendFailure(rows, lock.localId, discardedSends.current));
      setFailedSend({ key: lock.key, body });
      setSendError(result.problem.detail || "Não foi possível enviar.");
      setAnnounce("Falha ao enviar. Você pode tentar de novo sem duplicar a mensagem.");
      return;
    }
    setPending((rows) => rows.filter((row) => row.localId !== lock.localId));
    setResolvedIds((current) => new Map(current).set(lock.localId, result.body.id));
    setMessages((rows) => appendUniqueMessage(rows, result.body));
    setFailedSend((current) => (current?.key === lock.key ? null : current));
    setDraft((current) => draftAfterSuccessfulSend(current, submittedRaw, sameContext));
    setAnnounce("Mensagem enviada.");
    setInboxNonce((value) => value + 1);
  }

  function retryFailed(row: PendingSend) {
    if (!conversationId || !orgId || !canSendMessage(active) || row.conversationId !== conversationId) {
      return;
    }
    const lock: SendLock = {
      conversationId: row.conversationId,
      organizationId: orgId,
      generation: threadGen.current,
      localId: row.localId,
      key: row.key,
    };
    const decision = beginLockedSend(sendLock.current, lock, row.body);
    if (!decision.started || !decision.lock) {
      return;
    }
    discardedSends.current.delete(row.localId);
    sendLock.current = decision.lock;
    setSending(true);
    const rawAtRetry = draft;
    const submittedRaw = normalizeComposerBody(rawAtRetry) === row.body ? rawAtRetry : `${rawAtRetry}\u0000`;
    void send(decision.lock, row.body, submittedRaw);
  }

  function submitDraft() {
    const raw = draft;
    const body = normalizeComposerBody(raw);
    if (!body) {
      return;
    }
    if (!conversationId || !orgId || !canSendMessage(active)) {
      return;
    }
    const key = reuseSendKey(failedSend, body) ?? newIdempotencyKey("msg");
    const lock: SendLock = {
      conversationId,
      organizationId: orgId,
      generation: threadGen.current,
      localId: `pending-${key}`,
      key,
    };
    const decision = beginLockedSend(sendLock.current, lock, body);
    if (!decision.started || !decision.lock) {
      return;
    }
    sendLock.current = decision.lock;
    setSending(true);
    void send(decision.lock, body, raw);
  }

  async function saveEdit() {
    if (!dialog || dialog.type !== "edit" || !conversationId) {
      return;
    }
    const targetId = conversationId;
    const generation = threadGen.current;
    const body = dialogDraft.trim();
    if (!body) {
      setDialogError("A mensagem não pode ficar vazia.");
      return;
    }
    setDialogPending(true);
    const controller = new AbortController();
    const result = await request<MessageRecord>(`/api/v1/conversations/${targetId}/messages/${dialog.message.id}`, controller.signal, {
      method: "PATCH",
      body: JSON.stringify({ body, expectedVersion: dialog.message.version }),
    });
    setDialogPending(false);
    if (result === "aborted" || !threadIsCurrent(generation, targetId)) {
      return;
    }
    if (!result.ok) {
      if (isAuthorizationMiss(result.status)) {
        closeDialog();
        revokeThread(generation, targetId, result.problem.detail);
        return;
      }
      if (result.status === 409 || result.status === 0) {
        const detail =
          result.status === 0
            ? "A resposta da edição não foi confirmada."
            : result.problem.detail || "A versão da mensagem mudou.";
        setDialogPending(true);
        const request = beginTranscriptRequest();
        const reconciled = await loadTranscript(
          targetId,
          generation,
          request.signal,
          "refresh",
          request.requestSeq,
          request.organizationId,
        );
        setDialogPending(false);
        if (!threadIsCurrent(generation, targetId) || reconciled.status === "stale" || reconciled.status === "denied") {
          return;
        }
        if (reconciled.status !== "ready") {
          setDialogError(`${detail} A versão atual não foi carregada, então a edição antiga não será reenviada.`);
          return;
        }
        setDialog({ type: "edit-conflict", messageId: dialog.message.id, detail });
        return;
      }
      setDialogError(result.problem.detail || "Não foi possível editar.");
      return;
    }
    setMessages((rows) => rows.map((row) => (row.id === result.body.id ? result.body : row)));
    closeDialog();
    setAnnounce("Mensagem editada.");
  }

  async function confirmTombstone() {
    if (!dialog || (dialog.type !== "tombstone" && dialog.type !== "tombstone-conflict") || !conversationId) {
      return;
    }
    const targetId = conversationId;
    const generation = threadGen.current;
    const messageId = dialog.type === "tombstone" ? dialog.message.id : dialog.messageId;
    const expectedVersion = dialog.type === "tombstone" ? dialog.message.version : dialog.version;
    const key = dialog.key;
    setDialogPending(true);
    const controller = new AbortController();
    const result = await request<MessageRecord>(
      `/api/v1/conversations/${targetId}/messages/${messageId}/tombstone`,
      controller.signal,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ expectedVersion }),
      },
    );
    setDialogPending(false);
    if (result === "aborted" || !threadIsCurrent(generation, targetId)) {
      return;
    }
    if (!result.ok) {
      if (isAuthorizationMiss(result.status)) {
        closeDialog();
        revokeThread(generation, targetId, result.problem.detail);
        return;
      }
      if (result.status === 409 || result.status === 0) {
        const detail =
          result.status === 0
            ? "A resposta da remoção não foi confirmada."
            : result.problem.detail || "A versão da mensagem mudou.";
        const messageId = dialog.type === "tombstone" ? dialog.message.id : dialog.messageId;
        const key = dialog.key;
        setDialogPending(true);
        const request = beginTranscriptRequest();
        const reconciled = await loadTranscript(
          targetId,
          generation,
          request.signal,
          "refresh",
          request.requestSeq,
          request.organizationId,
        );
        setDialogPending(false);
        if (!threadIsCurrent(generation, targetId) || reconciled.status === "stale" || reconciled.status === "denied") {
          return;
        }
        if (reconciled.status !== "ready") {
          setDialogError(`${detail} A versão atual não foi carregada, então a remoção antiga não será reenviada.`);
          return;
        }
        const latest = reconciled.messages.find((message) => message.id === messageId);
        const attempt = nextTombstoneAttempt({
          refresh: "ready",
          message: latest,
          previousVersion: expectedVersion,
          idempotencyKey: key,
        });
        if (attempt.action === "done") {
          closeDialog();
          setAnnounce("Mensagem removida. O texto original não permanece na transcrição.");
          return;
        }
        if (attempt.action !== "retry" || attempt.version === null) {
          setDialogError(`${detail} A mensagem atual não está disponível.`);
          return;
        }
        setDialog({ type: "tombstone-conflict", messageId, key: attempt.key, version: attempt.version, detail });
        return;
      }
      setDialogError(result.problem.detail || "Não foi possível remover.");
      return;
    }
    setMessages((rows) => rows.map((row) => (row.id === result.body.id ? { ...result.body, body: null, resourcePreviews: [] } : row)));
    closeDialog();
    setAnnounce("Mensagem removida. O texto original não permanece na transcrição.");
    setInboxNonce((value) => value + 1);
  }

  function onInboxKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextInboxIndex(index, visible.length, event.key);
    if (next === null) {
      return;
    }
    event.preventDefault();
    rowRefs.current[next]?.focus();
  }

  if (surface === "loading" || surface === "error" || surface === "no-permission") {
    return (
      <MessagingState
        state={surface}
        detail={inboxDetail}
        onRetry={surface === "error" ? () => setInboxNonce((value) => value + 1) : undefined}
      />
    );
  }

  return (
    <section className="messages-page" data-node-id={FIGMA_MESSAGE_NODES.inbox} aria-labelledby={titleId}>
      <div className="messages-toolbar">
        <h1 id={titleId}>Mensagens</h1>
        <button
          type="button"
          className="btn"
          data-node-id={FIGMA_MESSAGE_NODES.newConversation}
          onClick={(event) => openDialog({ type: "create" }, event.currentTarget)}
        >
          Nova conversa
        </button>
      </div>
      <p className="messages-hint">
        {unread > 0 ? `${unread} não ${unread === 1 ? "lida" : "lidas"} em conversas visíveis.` : "Nenhuma não lida nas conversas visíveis."}{" "}
        Chat é colaboração, não o registro de decisões.
      </p>
      {inboxWarning ? (
        <p className="messages-inline-error" role="alert">
          {inboxWarning}{" "}
          <button type="button" className="btn" onClick={() => setInboxNonce((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : null}
      <div id={liveId} className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
      <div className="messages-layout">
        <nav className="messages-inbox" aria-label="Conversas autorizadas">
          <div className="messages-inbox-tools">
            <label className="sr-only" htmlFor="messages-search">
              Filtrar conversas autorizadas
            </label>
            <input
              id="messages-search"
              className="messages-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar conversas"
              type="search"
            />
            <div className="messages-filters" role="group" aria-label="Tipo de conversa">
              {(
                [
                  ["ALL", "Todas"],
                  ["DIRECT", "Diretas"],
                  ["TEAM", "Equipes"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {surface === "empty" || surface === "filtered-empty" ? (
            <MessagingState state={surface} level="h2" />
          ) : (
            <ul className="messages-list">
              {visible.map((item, index) => (
                <li key={item.id}>
                  <button
                    ref={(node) => {
                      rowRefs.current[index] = node;
                    }}
                    type="button"
                    className="messages-row"
                    aria-current={item.id === conversationId ? "true" : undefined}
                    onClick={() => void openConversation(item.id)}
                    onKeyDown={(event) => onInboxKeyDown(event, index)}
                  >
                    <span className="messages-kind">{item.kind === "TEAM" ? "Equipe" : "Direta"}</span>
                    {item.unreadCount > 0 ? (
                      <span className="messages-unread" aria-label={`${item.unreadCount} não lidas`}>
                        {item.unreadCount}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="messages-row-title">{item.title}</span>
                    <time className="messages-time" dateTime={item.lastMessage?.createdAt ?? item.updatedAt}>
                      {formatMessageTime(item.lastMessage?.createdAt ?? item.updatedAt)}
                    </time>
                    <span className="messages-snippet">{item.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {inboxCursor ? (
            <p>
              <button type="button" className="btn secondary" onClick={() => setInboxNonce((value) => value + 1)}>
                Atualizar lista
              </button>
            </p>
          ) : null}
          {searchError ? (
            <p role="alert">
              {searchError}{" "}
              <button type="button" className="btn secondary" onClick={() => setSearchNonce((value) => value + 1)}>
                Tentar busca novamente
              </button>
            </p>
          ) : null}
          {searchHits.length > 0 ? (
            <ul className="messages-list" aria-label="Trechos autorizados">
              {searchHits.map((hit) => (
                <li key={hit.messageId}>
                  <button type="button" className="messages-row" onClick={() => void openConversation(hit.conversationId)}>
                    <span className="messages-kind">{hit.kind === "TEAM" ? "Equipe" : "Direta"}</span>
                    <span className="messages-snippet">{hit.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>
        <section className="messages-thread" aria-label="Conversa" data-node-id={FIGMA_MESSAGE_NODES.conversation}>
          {threadState === "loading" ? (
            <div className="messages-thread-loading" data-state="loading" aria-busy="true" aria-live="polite">
              <p>Carregando conversa</p>
              <span className="messages-pane-skel" />
              <span className="messages-pane-skel" />
              <span className="messages-pane-skel" />
            </div>
          ) : !conversationId || threadState === "idle" ? (
            <MessagingState state="empty" detail="Selecione uma conversa autorizada." level="h2" />
          ) : threadState === "revoked" || threadState === "error" ? (
            <MessagingState
              state={threadState}
              detail={threadDetail}
              level="h2"
              onRetry={threadState === "error" ? () => setThreadNonce((value) => value + 1) : undefined}
            />
          ) : !active ? (
            <MessagingState state="empty" detail="Selecione uma conversa autorizada." level="h2" />
          ) : (
            <>
              <header className="messages-thread-head">
                <h2>{activeView?.title ?? (active.kind === "TEAM" ? "Equipe" : "Conversa direta")}</h2>
                <p className="messages-kind">{active.kind === "TEAM" ? "Equipe" : "Direta"}</p>
                {readOnly ? (
                  <p className="messages-banner" role="status" data-state="archived">
                    Somente leitura. Equipes arquivadas não aceitam novas mensagens.
                  </p>
                ) : null}
                {activeView?.peerInactive ? (
                  <p className="messages-banner" role="status" data-state="inactive">
                    O outro participante não está ativo. O envio segue o contrato atual da conversa.
                  </p>
                ) : null}
                {refreshError ? (
                  <p className="messages-inline-error" role="alert">
                    {refreshError}{" "}
                    <button type="button" className="btn" onClick={() => setThreadNonce((value) => value + 1)}>
                      Tentar novamente
                    </button>
                  </p>
                ) : null}
              </header>
              <div className="messages-transcript" role="log" aria-relevant="additions" aria-label="Mensagens">
                {messages.length === 0 && shownPending.length === 0 ? <p>Nenhuma mensagem ainda.</p> : null}
                {messages.map((message) => {
                  const body = transcriptBody(message);
                  const own = message.authorOrganizationMembershipId === actorMembershipId;
                  return (
                    <article
                      key={message.id}
                      className={`messages-bubble${own ? " is-own" : ""}`}
                      data-message-id={message.id}
                      data-lifecycle={message.lifecycle}
                    >
                      <header>
                        <span className="messages-author">
                          {authorLabel(message.authorOrganizationMembershipId, actorMembershipId, directory.kind === "ready" ? directory.peers : null)}
                        </span>
                        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                      </header>
                      {body === null ? <p className="messages-tombstone">Mensagem removida</p> : <p className="messages-body">{body}</p>}
                      {message.lifecycle === "EDITED" && body !== null ? <p className="messages-caption">Editada</p> : null}
                      {body !== null
                        ? message.resourcePreviews.map((preview) => {
                            const view = resourcePresentation(preview);
                            return (
                              <div key={`${preview.type}:${preview.id}`} className="messages-link" data-node-id={FIGMA_MESSAGE_NODES.links}>
                                <span>{view.name}</span>
                                <span className="messages-caption">{view.caption}</span>
                                {view.href && view.openLabel ? <a href={view.href}>{view.openLabel}</a> : null}
                              </div>
                            );
                          })
                        : null}
                      <div className="messages-actions">
                        {canEditOwnMessage({
                          access: active.access,
                          teamArchived: active.teamArchived,
                          authorMembershipId: message.authorOrganizationMembershipId,
                          actorMembershipId,
                          lifecycle: message.lifecycle,
                          deletedAt: message.deletedAt,
                        }) ? (
                          <button
                            type="button"
                            className="btn secondary"
                            aria-label="Editar a sua mensagem"
                            onClick={(event) => openDialog({ type: "edit", message }, event.currentTarget)}
                          >
                            Editar
                          </button>
                        ) : null}
                        {canTombstoneOwnMessage({
                          access: active.access,
                          authorMembershipId: message.authorOrganizationMembershipId,
                          actorMembershipId,
                          lifecycle: message.lifecycle,
                          deletedAt: message.deletedAt,
                        }) ? (
                          <button
                            type="button"
                            className="btn secondary"
                            aria-label="Remover a sua mensagem"
                            onClick={(event) =>
                              openDialog(
                                { type: "tombstone", message, key: newIdempotencyKey("tombstone") },
                                event.currentTarget,
                              )
                            }
                          >
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {shownPending.map((row) => (
                  <article
                    key={row.localId}
                    className={`messages-bubble is-own${row.lifecycle === "failed" ? "" : " is-pending"}`}
                    aria-busy={row.lifecycle === "failed" ? undefined : true}
                    data-pending={row.lifecycle === "failed" ? undefined : "true"}
                    data-send-state={row.lifecycle}
                  >
                    <header>
                      <span className="messages-author">Você</span>
                      <span>{row.lifecycle === "failed" ? "Falha ao enviar" : "Enviando"}</span>
                    </header>
                    <p className="messages-body">{row.body}</p>
                    {row.lifecycle === "failed" ? (
                      <div className="messages-actions">
                        <button type="button" className="btn" onClick={() => retryFailed(row)}>
                          Tentar novamente
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            discardedSends.current.add(row.localId);
                            setPending((rows) => rows.filter((item) => item.localId !== row.localId));
                            setFailedSend((current) => (current?.key === row.key ? null : current));
                            setSendError(null);
                            setAnnounce("Envio descartado.");
                          }}
                        >
                          Descartar
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {sendError ? (
                <p className="messages-inline-error" role="alert">
                  {sendError}
                </p>
              ) : null}
              {canSendMessage(active) ? (
                <form
                  className="messages-composer"
                  data-node-id={FIGMA_MESSAGE_NODES.composer}
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitDraft();
                  }}
                >
                  <label className="sr-only" htmlFor="message-composer">
                    Mensagem
                  </label>
                  <textarea
                    id="message-composer"
                    value={draft}
                    aria-keyshortcuts="Enter Shift+Enter"
                    aria-describedby="composer-hint"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (composerKeyAction(event) === "send") {
                        event.preventDefault();
                        submitDraft();
                      }
                    }}
                  />
                  <div className="messages-composer-row">
                    <p id="composer-hint" className="messages-hint">
                      Enter envia. Shift+Enter quebra a linha.
                    </p>
                    <button type="submit" className="btn" disabled={sending}>
                      {sending ? "Enviando" : "Enviar"}
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </section>
      </div>
      <dialog
        ref={dialogRef}
        className="messages-dialog"
        aria-labelledby="messages-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
      >
        {dialog?.type === "create" ? (
          <>
            <h2 id="messages-dialog-title">Nova conversa</h2>
            <p className="messages-hint">Somente pessoas ativas da Organization e equipes que você já acessa.</p>
            <h3>Direta</h3>
            {directory.kind === "loading" ? <p role="status">Carregando pessoas elegíveis.</p> : null}
            {directory.kind === "error" ? (
              <p role="alert">
                {directory.detail}{" "}
                <button type="button" className="btn" onClick={() => setDirectoryNonce((value) => value + 1)}>
                  Tentar novamente
                </button>
              </p>
            ) : null}
            {directory.kind === "ready" ? (
              <>
                <label className="sr-only" htmlFor="peer-search">
                  Buscar pessoa
                </label>
                <input id="peer-search" value={peerQuery} onChange={(event) => setPeerQuery(event.target.value)} placeholder="Nome" />
                <ul className="messages-picker">
                  {peers.map((peer) => (
                    <li key={peer.id}>
                      <button type="button" className="messages-row" onClick={() => void startDirect(peer.id)} disabled={dialogPending}>
                        <span className="messages-row-title">{peer.displayName}</span>
                        <span className="messages-kind">Direta</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {peers.length === 0 ? <p>Nenhuma pessoa elegível.</p> : null}
              </>
            ) : null}
            <h3 data-node-id={FIGMA_MESSAGE_NODES.team}>Equipe</h3>
            <ul className="messages-picker">
              {teamChats.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="messages-row"
                    disabled={dialogPending || !item.teamId}
                    onClick={() => item.teamId && void openTeam(item.teamId)}
                  >
                    <span className="messages-row-title">{item.title}</span>
                    <span className="messages-kind">{item.teamArchived ? "Somente leitura" : "Equipe"}</span>
                  </button>
                </li>
              ))}
            </ul>
            {teamChats.length === 0 ? <p>Nenhuma equipe acessível.</p> : null}
          </>
        ) : null}
        {dialog?.type === "edit-conflict" ? (
          <>
            <h2 id="messages-dialog-title">Edição não confirmada</h2>
            <p>{dialog.detail} A versão antiga não será reenviada.</p>
            <div className="messages-dialog-actions">
              <button type="button" className="btn secondary" onClick={closeDialog}>
                Fechar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const latest = messages.find((message) => message.id === dialog.messageId);
                  if (latest && transcriptBody(latest) !== null) {
                    openDialog({ type: "edit", message: latest }, openerRef.current);
                    return;
                  }
                  closeDialog();
                }}
              >
                Editar versão atual
              </button>
            </div>
          </>
        ) : null}
        {dialog?.type === "edit" ? (
          <>
            <h2 id="messages-dialog-title">Editar mensagem</h2>
            <label className="sr-only" htmlFor="edit-body">
              Texto da mensagem
            </label>
            <textarea id="edit-body" value={dialogDraft} onChange={(event) => setDialogDraft(event.target.value)} />
            <div className="messages-dialog-actions">
              <button type="button" className="btn secondary" onClick={closeDialog}>
                Cancelar
              </button>
              <button type="button" className="btn" disabled={dialogPending} onClick={() => void saveEdit()}>
                {dialogPending ? "Salvando" : "Salvar"}
              </button>
            </div>
          </>
        ) : null}
        {dialog?.type === "tombstone-conflict" ? (
          <>
            <h2 id="messages-dialog-title">Remoção não confirmada</h2>
            <p>{dialog.detail} A versão antiga não será reenviada.</p>
            <div className="messages-dialog-actions">
              <button type="button" className="btn secondary" onClick={closeDialog}>
                Fechar
              </button>
              <button type="button" className="btn" disabled={dialogPending} onClick={() => void confirmTombstone()}>
                Remover versão atual
              </button>
            </div>
          </>
        ) : null}
        {dialog?.type === "tombstone" ? (
          <>
            <h2 id="messages-dialog-title">Remover mensagem</h2>
            <p>A mensagem permanece atribuída a você, sem o texto original.</p>
            <div className="messages-dialog-actions">
              <button type="button" className="btn secondary" onClick={closeDialog}>
                Cancelar
              </button>
              <button type="button" className="btn" disabled={dialogPending} onClick={() => void confirmTombstone()}>
                {dialogPending ? "Removendo" : "Remover"}
              </button>
            </div>
          </>
        ) : null}
        {dialogError ? (
          <p role="alert" className="messages-inline-error">
            {dialogError}{" "}
            {dialog?.type === "edit" ? (
              <button type="button" className="btn" onClick={() => void saveEdit()}>
                Tentar novamente
              </button>
            ) : null}
          </p>
        ) : null}
        {dialog?.type === "create" ? (
          <div className="messages-dialog-actions">
            <button type="button" className="btn secondary" onClick={closeDialog}>
              Fechar
            </button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
