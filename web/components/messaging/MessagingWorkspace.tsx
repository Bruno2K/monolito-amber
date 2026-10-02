"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import type { ApiResult, ProjectRow } from "../../lib/types";
import {
  FIGMA_MESSAGE_NODES,
  MESSAGE_POLL_MS,
  acceptAsyncResult,
  appendInboxItems,
  appendTranscriptPage,
  appendUniqueMessage,
  authorLabel,
  authorizedSearchHits,
  authorizedUnreadTotal,
  beginSend,
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
  isReadOnlyConversation,
  nextInboxIndex,
  nextTranscriptCursor,
  membersFromProjectRows,
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
  type ProjectPeerRow,
  type SearchHit,
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
  const projectKey = shell.projects.map((project) => project.id).join(",");
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
  const sendingRef = useRef(false);
  const inboxCommitted = useRef(false);
  const seenOrg = useRef<string | null | undefined>(undefined);
  const projectsRef = useRef<ProjectRow[]>(shell.projects);
  projectsRef.current = shell.projects;
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

  function rememberInbox(next: InboxItem[]) {
    inboxRef.current = next;
    setInbox(next);
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
    threadRevokedGen.current = generation;
    threadGen.current = generation + 1;
    if (conversationRef.current !== id) {
      return;
    }
    const nextInbox = inboxRef.current.filter((row) => row.id !== id);
    rememberInbox(nextInbox);
    setMessages([]);
    setActive(null);
    setPending([]);
    setDraft("");
    setSendError(null);
    setFailedSend(null);
    setSending(false);
    sendingRef.current = false;
    setRefreshError(null);
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
      inboxCommitted.current = true;
      rememberInbox(collected);
      setInboxCursor(null);
      setInboxStatus(200);
      setInboxDetail(undefined);
      setInboxWarning(null);
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
      const [memberResult, teamResult] = await Promise.all([
        request<DirectoryMember[]>(`/api/v1/organizations/${orgId}/members`, controller.signal),
        request<{ items: TeamName[] }>(`/api/v1/organizations/${orgId}/teams`, controller.signal),
      ]);
      if (memberResult === "aborted" || teamResult === "aborted" || generation !== directoryGen.current) {
        return;
      }
      if (teamResult.ok) {
        setTeams(teamResult.body.items);
      } else if (!isAuthorizationMiss(teamResult.status)) {
        setTeams([]);
      } else {
        setTeams([]);
      }
      if (memberResult.ok) {
        setDirectory({
          kind: "ready",
          peers: memberResult.body.map((peer) => ({
            id: peer.id,
            displayName: peer.displayName,
            status: peer.status,
          })),
        });
        return;
      }
      if (!isAuthorizationMiss(memberResult.status)) {
        setDirectory({ kind: "error", detail: memberResult.problem.detail });
        return;
      }
      const rows: ProjectPeerRow[] = [];
      for (const project of projectsRef.current) {
        const listed = await request<ProjectPeerRow[]>(`/api/v1/projects/${project.id}/members`, controller.signal);
        if (listed === "aborted" || generation !== directoryGen.current) {
          return;
        }
        if (listed.ok) {
          rows.push(...listed.body);
          continue;
        }
        if (isAuthorizationMiss(listed.status)) {
          continue;
        }
        setDirectory({ kind: "error", detail: listed.problem.detail });
        return;
      }
      setDirectory({ kind: "ready", peers: membersFromProjectRows(rows, actorMembershipId) });
    })();
    return () => controller.abort();
  }, [orgId, actorMembershipId, projectKey, directoryNonce]);

  useEffect(() => {
    const generation = ++threadGen.current;
    threadRevokedGen.current = null;
    watermarkSent.current = null;
    setActive(null);
    setMessages([]);
    setPending([]);
    setResolvedIds(new Map());
    setDraft("");
    setSendError(null);
    setFailedSend(null);
    setSending(false);
    sendingRef.current = false;
    setRefreshError(null);
    setDialog(null);
    setDialogError(null);
    setDialogPending(false);
    if (!conversationId) {
      setThreadState("idle");
      setThreadDetail(undefined);
      return;
    }
    setThreadState("loading");
    setThreadDetail(undefined);
    const controller = new AbortController();
    void loadTranscript(conversationId, generation, controller.signal, "replace");
    return () => controller.abort();
  }, [conversationId, threadNonce]);

  async function loadTranscript(id: string, generation: number, signal: AbortSignal, mode: "replace" | "refresh") {
    const conversationResult = await request<InboxItem>(`/api/v1/conversations/${id}`, signal);
    if (conversationResult === "aborted" || !threadIsCurrent(generation, id)) {
      return;
    }
    if (!conversationResult.ok) {
      if (isAuthorizationMiss(conversationResult.status)) {
        revokeThread(generation, id, conversationResult.problem.detail);
        return;
      }
      if (mode === "refresh") {
        setRefreshError(conversationResult.problem.detail);
        return;
      }
      setThreadState(conversationFailure(conversationResult.status));
      setThreadDetail(conversationResult.problem.detail);
      setMessages([]);
      setActive(null);
      return;
    }
    let transcript: MessageRecord[] = [];
    let cursor: string | null = null;
    let page = 0;
    while (page < TRANSCRIPT_PAGE_GUARD) {
      const path = `/api/v1/conversations/${id}/messages?pageSize=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const pageResult = await request<MessagePage>(path, signal);
      if (pageResult === "aborted" || !threadIsCurrent(generation, id)) {
        return;
      }
      if (!pageResult.ok) {
        if (isAuthorizationMiss(pageResult.status)) {
          revokeThread(generation, id, pageResult.problem.detail);
          return;
        }
        if (mode === "refresh") {
          setRefreshError(pageResult.problem.detail);
          return;
        }
        setThreadState("error");
        setThreadDetail(pageResult.problem.detail);
        setMessages([]);
        setActive(null);
        return;
      }
      const appended = appendTranscriptPage(transcript, pageResult.body.items);
      transcript = appended.messages;
      cursor = nextTranscriptCursor(cursor, pageResult.body.nextCursor, appended.added);
      page += 1;
      if (!cursor) {
        break;
      }
    }
    if (!threadIsCurrent(generation, id)) {
      return;
    }
    if (cursor) {
      if (mode === "refresh") {
        setRefreshError("A transcrição não foi carregada por completo.");
        return;
      }
      setThreadState("error");
      setThreadDetail("A transcrição não foi carregada por completo.");
      setMessages([]);
      setActive(null);
      return;
    }
    setActive(conversationResult.body);
    setMessages(transcript);
    setThreadState("ready");
    setThreadDetail(undefined);
    setRefreshError(null);
    const target = watermarkTarget(transcript);
    if (!target || watermarkSent.current === `${id}:${target}`) {
      return;
    }
    const read = await request(`/api/v1/conversations/${id}/read-state`, signal, {
      method: "PUT",
      body: JSON.stringify({ lastReadMessageId: target }),
    });
    if (read === "aborted" || !threadIsCurrent(generation, id)) {
      return;
    }
    if (!read.ok) {
      if (isAuthorizationMiss(read.status)) {
        revokeThread(generation, id, read.problem.detail);
        return;
      }
      setRefreshError(read.problem.detail);
      return;
    }
    watermarkSent.current = `${id}:${target}`;
    rememberInbox(inboxRef.current.map((row) => (row.id === id ? { ...row, unreadCount: 0 } : row)));
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
        inboxCommitted.current = true;
        rememberInbox(collected);
        setInboxStatus(200);
        setInboxWarning(null);
      })();
      const id = conversationRef.current;
      if (id && threadStateRef.current === "ready") {
        const generation = threadGen.current;
        void loadTranscript(id, generation, controller.signal, "refresh");
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

  async function startDirect(membershipId: string) {
    const key = newIdempotencyKey("direct");
    const controller = new AbortController();
    setDialogPending(true);
    setDialogError(null);
    const result = await request<InboxItem>("/api/v1/conversations/direct", controller.signal, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ organizationMembershipId: membershipId }),
    });
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
    const key = newIdempotencyKey("team");
    const controller = new AbortController();
    setDialogPending(true);
    const result = await request<InboxItem>("/api/v1/conversations/team", controller.signal, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ teamId }),
    });
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

  async function send(targetId: string, generation: number, body: string, key: string, localId: string) {
    const controller = new AbortController();
    setSendError(null);
    setPending((rows) =>
      rows.some((row) => row.localId === localId) ? rows : [...rows, { localId, key, body, conversationId: targetId }],
    );
    const result = await request<MessageRecord>(`/api/v1/conversations/${targetId}/messages`, controller.signal, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ body }),
    });
    sendingRef.current = false;
    setSending(false);
    if (result === "aborted" || !threadIsCurrent(generation, targetId)) {
      setPending((rows) => rows.filter((row) => row.conversationId === conversationRef.current));
      return;
    }
    if (!result.ok) {
      if (isAuthorizationMiss(result.status)) {
        revokeThread(generation, targetId, result.problem.detail);
        return;
      }
      setFailedSend({ key, body });
      setSendError(result.problem.detail || "Não foi possível enviar.");
      setAnnounce("Falha ao enviar. Você pode tentar de novo sem duplicar a mensagem.");
      return;
    }
    setPending((rows) => rows.filter((row) => row.localId !== localId));
    setResolvedIds((current) => new Map(current).set(localId, result.body.id));
    setMessages((rows) => appendUniqueMessage(rows, result.body));
    setFailedSend(null);
    setDraft("");
    setAnnounce("Mensagem enviada.");
    setInboxNonce((value) => value + 1);
  }

  function submitDraft() {
    const body = draft.trim();
    const decision = beginSend(sendingRef.current, body);
    if (!decision.started || !conversationId || !canSendMessage(active)) {
      return;
    }
    sendingRef.current = true;
    setSending(true);
    const key = reuseSendKey(failedSend, body) ?? newIdempotencyKey("msg");
    void send(conversationId, threadGen.current, body, key, `pending-${key}`);
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
      setDialogError(result.problem.detail || "Não foi possível editar.");
      return;
    }
    setMessages((rows) => rows.map((row) => (row.id === result.body.id ? result.body : row)));
    closeDialog();
    setAnnounce("Mensagem editada.");
  }

  async function confirmTombstone() {
    if (!dialog || dialog.type !== "tombstone" || !conversationId) {
      return;
    }
    const targetId = conversationId;
    const generation = threadGen.current;
    setDialogPending(true);
    const controller = new AbortController();
    const result = await request<MessageRecord>(
      `/api/v1/conversations/${targetId}/messages/${dialog.message.id}/tombstone`,
      controller.signal,
      {
        method: "POST",
        headers: { "Idempotency-Key": dialog.key },
        body: JSON.stringify({ expectedVersion: dialog.message.version }),
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
                                {view.href ? <a href={view.href}>Abrir projeto</a> : null}
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
                  <article key={row.localId} className="messages-bubble is-own is-pending" aria-busy="true" data-pending="true">
                    <header>
                      <span className="messages-author">Você</span>
                      <span>Enviando</span>
                    </header>
                    <p className="messages-body">{row.body}</p>
                  </article>
                ))}
              </div>
              {sendError ? (
                <p className="messages-inline-error" role="alert">
                  {sendError}{" "}
                  {failedSend ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (!conversationId) {
                          return;
                        }
                        const decision = beginSend(sendingRef.current, failedSend.body);
                        if (!decision.started) {
                          return;
                        }
                        sendingRef.current = true;
                        setSending(true);
                        setDraft(failedSend.body);
                        void send(conversationId, threadGen.current, failedSend.body, failedSend.key, `pending-${failedSend.key}`);
                      }}
                    >
                      Tentar novamente
                    </button>
                  ) : null}
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
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (failedSend && event.target.value.trim() !== failedSend.body) {
                        setFailedSend(null);
                      }
                    }}
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
            {dialog?.type === "tombstone" ? (
              <button type="button" className="btn" onClick={() => void confirmTombstone()}>
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
