"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import type { ApiResult } from "../../lib/types";
import {
  FIGMA_MESSAGE_NODES,
  MESSAGE_POLL_MS,
  appendUniqueMessage,
  authorLabel,
  authorizedSearchHits,
  authorizedUnreadTotal,
  buildInboxViews,
  canEditOwnMessage,
  canSendMessage,
  canTombstoneOwnMessage,
  composerKeyAction,
  conversationFailure,
  eligibleDirectPeers,
  filterInbox,
  formatMessageTime,
  inboxSurface,
  isAuthorizationMiss,
  isReadOnlyConversation,
  nextInboxIndex,
  resourcePresentation,
  reuseSendKey,
  transcriptBody,
  visiblePendingSends,
  watermarkTarget,
  type DirectoryMember,
  type InboxItem,
  type InboxView,
  type MessageRecord,
  type MessagingKindFilter,
  type MessagingSurface,
  type PendingSend,
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
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const [inboxStatus, setInboxStatus] = useState<number | null>(null);
  const [inboxDetail, setInboxDetail] = useState<string | undefined>();
  const [members, setMembers] = useState<DirectoryMember[] | null>(null);
  const [teams, setTeams] = useState<TeamName[]>([]);
  const [kind, setKind] = useState<MessagingKindFilter>("ALL");
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState<InboxItem | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [threadState, setThreadState] = useState<MessagingSurface | null>(null);
  const [threadDetail, setThreadDetail] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingSend[]>([]);
  const [resolvedIds, setResolvedIds] = useState<Map<string, string>>(new Map());
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedSend, setFailedSend] = useState<{ key: string; body: string } | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [dialogDraft, setDialogDraft] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [peerQuery, setPeerQuery] = useState("");
  const [announce, setAnnounce] = useState("");
  const watermarkSent = useRef<string | null>(null);

  const loadDirectory = useCallback(async () => {
    if (!orgId) {
      return;
    }
    const [memberResult, teamResult] = await Promise.all([
      api<DirectoryMember[]>(`/api/v1/organizations/${orgId}/members`),
      api<{ items: TeamName[] }>(`/api/v1/organizations/${orgId}/teams`),
    ]);
    setMembers(memberResult.ok ? memberResult.body : null);
    setTeams(teamResult.ok ? teamResult.body.items : []);
  }, [orgId]);

  const loadInbox = useCallback(async () => {
    const collected: InboxItem[] = [];
    let cursor: string | null = null;
    let page = 0;
    let status = 200;
    let detail: string | undefined;
    do {
      const inboxPath: string = `/api/v1/conversations?pageSize=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const result: ApiResult<InboxPage> = await api<InboxPage>(inboxPath);
      status = result.status;
      if (!result.ok) {
        detail = result.problem.detail;
        break;
      }
      collected.push(...result.body.items);
      cursor = result.body.nextCursor;
      page += 1;
    } while (cursor && page < 5);
    if (status >= 400 && collected.length === 0) {
      setInboxStatus(status);
      setInboxDetail(detail);
      setInbox([]);
      return;
    }
    setInbox(collected);
    setInboxCursor(cursor);
    setInboxStatus(200);
    setInboxDetail(undefined);
  }, []);

  const forgetConversation = useCallback((id: string, detail?: string) => {
    setInbox((rows) => rows.filter((row) => row.id !== id));
    setMessages([]);
    setActive(null);
    setPending([]);
    setDraft("");
    setSendError(null);
    setFailedSend(null);
    setThreadState("revoked");
    setThreadDetail(detail);
    setAnnounce("Conversa indisponível. O conteúdo protegido foi removido.");
  }, []);

  const loadThread = useCallback(
    async (id: string) => {
      const [conversationResult, messageResult] = await Promise.all([
        api<InboxItem>(`/api/v1/conversations/${id}`),
        api<MessagePage>(`/api/v1/conversations/${id}/messages?pageSize=100`),
      ]);
      if (!conversationResult.ok || isAuthorizationMiss(conversationResult.status)) {
        forgetConversation(id, conversationResult.problem?.detail);
        return;
      }
      if (!messageResult.ok) {
        if (isAuthorizationMiss(messageResult.status)) {
          forgetConversation(id, messageResult.problem.detail);
          return;
        }
        setThreadState(conversationFailure(messageResult.status));
        setThreadDetail(messageResult.problem.detail);
        setMessages([]);
        setActive(conversationResult.body);
        return;
      }
      setActive(conversationResult.body);
      setMessages(messageResult.body.items);
      setThreadState("ready");
      setThreadDetail(undefined);
      const target = watermarkTarget(messageResult.body.items);
      if (target && watermarkSent.current !== `${id}:${target}`) {
        const read = await api(`/api/v1/conversations/${id}/read-state`, {
          method: "PUT",
          body: JSON.stringify({ lastReadMessageId: target }),
        });
        if (!read.ok && isAuthorizationMiss(read.status)) {
          forgetConversation(id, read.problem.detail);
          return;
        }
        if (read.ok) {
          watermarkSent.current = `${id}:${target}`;
          setInbox((rows) => rows.map((row) => (row.id === id ? { ...row, unreadCount: 0 } : row)));
        }
      }
    },
    [forgetConversation],
  );

  useEffect(() => {
    void loadDirectory();
    void loadInbox();
  }, [loadDirectory, loadInbox]);

  useEffect(() => {
    if (!conversationId) {
      setActive(null);
      setMessages([]);
      setThreadState(null);
      return;
    }
    void loadThread(conversationId);
  }, [conversationId, loadThread]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void loadInbox();
      if (conversationId) {
        void loadThread(conversationId);
      }
    }, MESSAGE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, loadInbox, loadThread]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void api<{ items: SearchHit[] }>(`/api/v1/conversations/search?q=${encodeURIComponent(q)}&pageSize=50`).then((result) => {
        if (!result.ok) {
          if (isAuthorizationMiss(result.status)) {
            setSearchHits([]);
          }
          return;
        }
        const allowed = new Set(inbox.map((item) => item.id));
        setSearchHits(authorizedSearchHits(result.body.items, allowed));
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, inbox]);

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
    () => buildInboxViews({ items: inbox, actorMembershipId, members, teams }),
    [inbox, actorMembershipId, members, teams],
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
    const eligible = eligibleDirectPeers(members ?? [], actorMembershipId);
    const q = peerQuery.trim().toLowerCase();
    return q ? eligible.filter((peer) => peer.displayName.toLowerCase().includes(q)) : eligible;
  }, [members, actorMembershipId, peerQuery]);
  const teamChats = views.filter((item) => item.kind === "TEAM");
  const serverIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);
  const shownPending = visiblePendingSends(pending, serverIds, resolvedIds);
  const readOnly = active ? isReadOnlyConversation(active) : false;

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
      await loadThread(id);
      return;
    }
    router.push(`/messages/${id}`);
  }

  async function startDirect(membershipId: string) {
    const key = newIdempotencyKey("direct");
    setDialogPending(true);
    setDialogError(null);
    const result = await api<InboxItem>("/api/v1/conversations/direct", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ organizationMembershipId: membershipId }),
    });
    setDialogPending(false);
    if (!result.ok) {
      setDialogError(isAuthorizationMiss(result.status) ? "Participante indisponível." : result.problem.detail);
      return;
    }
    closeDialog();
    setAnnounce("Conversa direta aberta.");
    await loadInbox();
    await openConversation(result.body.id);
  }

  async function openTeam(teamId: string) {
    const key = newIdempotencyKey("team");
    setDialogPending(true);
    const result = await api<InboxItem>("/api/v1/conversations/team", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ teamId }),
    });
    setDialogPending(false);
    if (!result.ok) {
      setDialogError(isAuthorizationMiss(result.status) ? "Equipe indisponível." : result.problem.detail);
      return;
    }
    closeDialog();
    setAnnounce("Conversa da equipe aberta.");
    await loadInbox();
    await openConversation(result.body.id);
  }

  async function send(body: string, key: string, localId: string) {
    if (!conversationId || !canSendMessage(active)) {
      return;
    }
    setSendError(null);
    setPending((rows) => (rows.some((row) => row.localId === localId) ? rows : [...rows, { localId, key, body, conversationId }]));
    const result = await api<MessageRecord>(`/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ body }),
    });
    if (!result.ok) {
      if (isAuthorizationMiss(result.status)) {
        forgetConversation(conversationId, result.problem.detail);
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
    await loadInbox();
  }

  function submitDraft() {
    const body = draft.trim();
    if (!body || !conversationId) {
      return;
    }
    const key = reuseSendKey(failedSend, body) ?? newIdempotencyKey("msg");
    const localId = failedSend?.body === body ? `pending-${key}` : `pending-${key}`;
    void send(body, key, localId);
  }

  async function saveEdit() {
    if (!dialog || dialog.type !== "edit" || !conversationId) {
      return;
    }
    const body = dialogDraft.trim();
    if (!body) {
      setDialogError("A mensagem não pode ficar vazia.");
      return;
    }
    setDialogPending(true);
    const result = await api<MessageRecord>(`/api/v1/conversations/${conversationId}/messages/${dialog.message.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body, expectedVersion: dialog.message.version }),
    });
    setDialogPending(false);
    if (!result.ok) {
      if (isAuthorizationMiss(result.status)) {
        closeDialog();
        forgetConversation(conversationId, result.problem.detail);
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
    setDialogPending(true);
    const result = await api<MessageRecord>(
      `/api/v1/conversations/${conversationId}/messages/${dialog.message.id}/tombstone`,
      {
        method: "POST",
        headers: { "Idempotency-Key": dialog.key },
        body: JSON.stringify({ expectedVersion: dialog.message.version }),
      },
    );
    setDialogPending(false);
    if (!result.ok) {
      if (isAuthorizationMiss(result.status)) {
        closeDialog();
        forgetConversation(conversationId, result.problem.detail);
        return;
      }
      setDialogError(result.problem.detail || "Não foi possível remover.");
      return;
    }
    setMessages((rows) => rows.map((row) => (row.id === result.body.id ? { ...result.body, body: null, resourcePreviews: [] } : row)));
    closeDialog();
    setAnnounce("Mensagem removida. O texto original não permanece na transcrição.");
    await loadInbox();
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
        onRetry={surface === "error" ? () => void loadInbox() : undefined}
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
              <button type="button" className="btn secondary" onClick={() => void loadInbox()}>
                Atualizar lista
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
          {!conversationId || !active ? (
            threadState === "revoked" ? (
              <MessagingState state="revoked" detail={threadDetail} level="h2" />
            ) : (
              <MessagingState state="empty" detail="Selecione uma conversa autorizada." level="h2" />
            )
          ) : threadState === "revoked" || threadState === "error" ? (
            <MessagingState
              state={threadState}
              detail={threadDetail}
              level="h2"
              onRetry={threadState === "error" && conversationId ? () => void loadThread(conversationId) : undefined}
            />
          ) : (
            <>
              <header className="messages-thread-head">
                <h2>{views.find((item) => item.id === active.id)?.title ?? (active.kind === "TEAM" ? "Equipe" : "Conversa direta")}</h2>
                <p className="messages-kind">{active.kind === "TEAM" ? "Equipe" : "Direta"}</p>
                {readOnly ? (
                  <p className="messages-banner" role="status" data-state="archived">
                    Somente leitura. Equipes arquivadas não aceitam novas mensagens.
                  </p>
                ) : null}
                {views.find((item) => item.id === active.id)?.peerInactive ? (
                  <p className="messages-banner" role="status" data-state="inactive">
                    O outro participante não está ativo. O envio segue o contrato atual da conversa.
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
                          {authorLabel(message.authorOrganizationMembershipId, actorMembershipId, members)}
                        </span>
                        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                      </header>
                      {body === null ? (
                        <p className="messages-tombstone">Mensagem removida</p>
                      ) : (
                        <p className="messages-body">{body}</p>
                      )}
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
                    <button type="button" className="btn" onClick={() => void send(failedSend.body, failedSend.key, `pending-${failedSend.key}`)}>
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
                    <button type="submit" className="btn" disabled={shownPending.length > 0}>
                      {shownPending.length > 0 ? "Enviando" : "Enviar"}
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
            {members === null ? (
              <p role="status">O diretório não está disponível para esta conta.</p>
            ) : (
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
            )}
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
