/**
 * Mensagens presentation helpers. Authorization stays on the M5.4 API.
 * These functions only shape records the server already returned.
 */

export const FIGMA_MESSAGE_NODES = {
  inbox: "267:8555",
  conversation: "267:8751",
  composer: "267:8939",
  newConversation: "267:9095",
  team: "269:8967",
  states: "269:9138",
  links: "269:9293",
} as const;

export const MESSAGES_LAYOUT = {
  inboxWidth: 280,
  shellSidebar: 260,
  contentPadding: 48,
} as const;

export const MESSAGE_POLL_MS = 15_000;

export type MessagingKindFilter = "ALL" | "DIRECT" | "TEAM";

export type MessagingSurface =
  | "loading"
  | "empty"
  | "filtered-empty"
  | "error"
  | "no-permission"
  | "revoked"
  | "ready";

export interface DirectoryMember {
  id: string;
  displayName: string;
  email?: string | null;
  status: string;
  type?: string;
}

export interface TeamName {
  id: string;
  name: string;
}

export interface InboxLastMessage {
  id: string;
  createdAt: string;
  authorOrganizationMembershipId: string;
  lifecycle: string;
  snippet: string;
}

export interface InboxItem {
  id: string;
  organizationId: string;
  kind: string;
  teamId: string | null;
  participantLowId: string | null;
  participantHighId: string | null;
  access: string;
  teamArchived: boolean;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessage: InboxLastMessage | null;
}

export interface InboxView extends InboxItem {
  title: string;
  snippet: string;
  peerInactive: boolean;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  authorOrganizationMembershipId: string;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  version: number;
  lifecycle: string;
  resourcePreviews: ResourcePreview[];
}

export interface ResourcePreview {
  type: string;
  id: string;
  authorized: boolean;
  title?: string;
  projectId?: string;
}

export interface SearchHit {
  conversationId: string;
  messageId: string;
  kind: string;
  createdAt: string;
  snippet: string;
}

export type PendingLifecycle = "pending" | "failed" | "retrying";

export interface PendingSend {
  localId: string;
  key: string;
  body: string;
  conversationId: string;
  lifecycle: PendingLifecycle;
}

export interface SendLock {
  conversationId: string;
  organizationId: string;
  generation: number;
  localId: string;
  key: string;
}

const COLLABORATION_CAPTION = "Vínculo de colaboração. Não é uma decisão governada.";

const LINK_TYPE_LABEL: Record<string, string> = {
  PROJECT: "Projeto",
  TASK: "Tarefa",
  MILESTONE: "Marco",
  DELIVERABLE: "Entrega",
  GATE: "Gate",
  DOCUMENT: "Documento",
};

export function isAuthorizationMiss(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export function contentFits(viewportWidth: number, viewportHeight: number): boolean {
  const widthOk = viewportWidth === 1440 || viewportWidth === 1180 || viewportWidth >= 1180;
  const heightOk = viewportHeight === 900 || viewportHeight === 820 || viewportHeight >= 820;
  const chrome =
    MESSAGES_LAYOUT.shellSidebar + MESSAGES_LAYOUT.contentPadding + MESSAGES_LAYOUT.inboxWidth;
  return widthOk && heightOk && viewportWidth > chrome;
}

export function peerMembershipId(
  item: Pick<InboxItem, "participantLowId" | "participantHighId">,
  actorMembershipId: string | null,
): string | null {
  if (!actorMembershipId) {
    return null;
  }
  if (item.participantLowId === actorMembershipId) {
    return item.participantHighId;
  }
  if (item.participantHighId === actorMembershipId) {
    return item.participantLowId;
  }
  return null;
}

export function eligibleDirectPeers(members: readonly DirectoryMember[], actorMembershipId: string | null): DirectoryMember[] {
  return members.filter((member) => member.status === "ACTIVE" && member.id !== actorMembershipId && member.id.length > 0);
}

export function accessibleTeamItems(items: readonly InboxItem[]): InboxItem[] {
  return items.filter((item) => item.kind === "TEAM");
}

export function privacySafeSnippet(last: InboxLastMessage | null): string {
  if (!last) {
    return "Sem mensagens";
  }
  if (last.lifecycle === "TOMBSTONED") {
    return "Mensagem removida";
  }
  const snippet = last.snippet.trim();
  return snippet || "Sem prévia";
}

export function conversationTitle(input: {
  item: Pick<InboxItem, "kind" | "teamId" | "teamArchived" | "participantLowId" | "participantHighId">;
  actorMembershipId: string | null;
  members: readonly DirectoryMember[] | null;
  teams: readonly TeamName[];
}): string {
  if (input.item.kind === "TEAM") {
    const authorized = Boolean(input.item.teamId);
    const name = authorized ? input.teams.find((team) => team.id === input.item.teamId)?.name : undefined;
    if (input.item.teamArchived) {
      return name ? `${name} (arquivada)` : "Equipe arquivada";
    }
    return name ?? "Equipe";
  }
  const peerId = peerMembershipId(input.item, input.actorMembershipId);
  const peer = peerId ? input.members?.find((member) => member.id === peerId) : undefined;
  return peer?.displayName || "Conversa direta";
}

export function directPeerInactive(
  members: readonly DirectoryMember[] | null,
  peerId: string | null,
): boolean {
  if (!members || !peerId) {
    return false;
  }
  const peer = members.find((member) => member.id === peerId);
  return Boolean(peer && peer.status !== "ACTIVE");
}

export function buildInboxViews(input: {
  items: readonly InboxItem[];
  actorMembershipId: string | null;
  members: readonly DirectoryMember[] | null;
  teams: readonly TeamName[];
}): InboxView[] {
  const authorizedTeamIds = new Set(
    input.items.filter((item) => item.kind === "TEAM" && item.teamId).map((item) => item.teamId as string),
  );
  const teams = input.teams.filter((team) => authorizedTeamIds.has(team.id));
  return input.items.map((item) => {
    const peerId = item.kind === "DIRECT" ? peerMembershipId(item, input.actorMembershipId) : null;
    return {
      ...item,
      title: conversationTitle({ item, actorMembershipId: input.actorMembershipId, members: input.members, teams }),
      snippet: privacySafeSnippet(item.lastMessage),
      peerInactive: directPeerInactive(input.members, peerId),
    };
  });
}

export function filterInbox(items: readonly InboxView[], kind: MessagingKindFilter, query: string): InboxView[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (kind !== "ALL" && item.kind !== kind) {
      return false;
    }
    if (!q) {
      return true;
    }
    return `${item.title} ${item.snippet}`.toLowerCase().includes(q);
  });
}

export function authorizedSearchHits<T extends { conversationId: string }>(
  hits: readonly T[],
  authorizedIds: ReadonlySet<string>,
): T[] {
  return hits.filter((hit) => authorizedIds.has(hit.conversationId));
}

export function authorizedUnreadTotal(items: readonly { unreadCount: number }[]): number {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.unreadCount) && item.unreadCount > 0 ? item.unreadCount : 0), 0);
}

export function inboxSurface(input: {
  status: number | null;
  itemCount: number;
  visibleCount: number;
  filtered: boolean;
}): MessagingSurface {
  if (input.status === null) {
    return "loading";
  }
  if (isAuthorizationMiss(input.status)) {
    return "no-permission";
  }
  if (input.status === 0 || input.status >= 400) {
    return "error";
  }
  if (input.itemCount === 0) {
    return "empty";
  }
  if (input.filtered && input.visibleCount === 0) {
    return "filtered-empty";
  }
  return "ready";
}

export function conversationFailure(status: number): "revoked" | "error" {
  return isAuthorizationMiss(status) ? "revoked" : "error";
}

export function isReadOnlyConversation(item: Pick<InboxItem, "access" | "teamArchived">): boolean {
  return item.access !== "read_write" || item.teamArchived;
}

export function canSendMessage(item: Pick<InboxItem, "access" | "teamArchived"> | null): boolean {
  return Boolean(item && item.access === "read_write" && !item.teamArchived);
}

export function canEditOwnMessage(input: {
  access: string;
  teamArchived: boolean;
  authorMembershipId: string;
  actorMembershipId: string | null;
  lifecycle: string;
  deletedAt: string | null;
}): boolean {
  return (
    canSendMessage({ access: input.access, teamArchived: input.teamArchived }) &&
    Boolean(input.actorMembershipId) &&
    input.authorMembershipId === input.actorMembershipId &&
    input.lifecycle !== "TOMBSTONED" &&
    !input.deletedAt
  );
}

export function canTombstoneOwnMessage(input: {
  access: string;
  authorMembershipId: string;
  actorMembershipId: string | null;
  lifecycle: string;
  deletedAt: string | null;
}): boolean {
  return (
    input.access !== "none" &&
    Boolean(input.actorMembershipId) &&
    input.authorMembershipId === input.actorMembershipId &&
    input.lifecycle !== "TOMBSTONED" &&
    !input.deletedAt
  );
}

export function transcriptBody(message: Pick<MessageRecord, "body" | "lifecycle" | "deletedAt">): string | null {
  if (message.deletedAt || message.lifecycle === "TOMBSTONED") {
    return null;
  }
  return message.body;
}

export function authorLabel(
  authorMembershipId: string,
  actorMembershipId: string | null,
  members: readonly DirectoryMember[] | null,
): string {
  if (actorMembershipId && authorMembershipId === actorMembershipId) {
    return "Você";
  }
  return members?.find((member) => member.id === authorMembershipId)?.displayName || "Participante";
}

const OPEN_LABEL: Record<string, string> = {
  PROJECT: "Abrir projeto",
  TASK: "Abrir tarefa",
  MILESTONE: "Abrir marco",
  DELIVERABLE: "Abrir entrega",
};

export function resourcePresentation(preview: ResourcePreview): {
  name: string;
  caption: string;
  href: string | null;
  openLabel: string | null;
} {
  if (!preview.authorized) {
    return { name: "Recurso protegido", caption: COLLABORATION_CAPTION, href: null, openLabel: null };
  }
  const kind = LINK_TYPE_LABEL[preview.type] ?? "Recurso";
  const title = preview.title?.trim();
  const projectId = preview.type === "PROJECT" ? preview.id : preview.projectId;
  const href = authorizedResourceHref(preview.type, preview.id, projectId);
  return {
    name: title ? `${kind}: ${title}` : kind,
    caption: href
      ? COLLABORATION_CAPTION
      : "Vínculo de colaboração. Não é uma decisão governada e não abre uma rota de produto.",
    href,
    openLabel: href ? (OPEN_LABEL[preview.type] ?? null) : null,
  };
}

function authorizedResourceHref(type: string, id: string, projectId: string | undefined): string | null {
  if (type === "PROJECT") {
    return `/projects/${id}/overview`;
  }
  if (!projectId) {
    return null;
  }
  if (type === "TASK") {
    return `/projects/${projectId}/planner?inspect=${encodeURIComponent(id)}`;
  }
  if (type === "MILESTONE") {
    return `/projects/${projectId}/planner?view=milestones&milestone=${encodeURIComponent(id)}`;
  }
  if (type === "DELIVERABLE") {
    return `/projects/${projectId}/deliverables?inspect=${encodeURIComponent(id)}`;
  }
  return null;
}

export function activeConversationMissing(conversationId: string | null, authorizedIds: ReadonlySet<string>): boolean {
  return Boolean(conversationId && !authorizedIds.has(conversationId));
}

export function beginLockedSend(current: SendLock | null, next: SendLock, body: string): { lock: SendLock | null; started: boolean } {
  if (current || body.trim().length === 0) {
    return { lock: current, started: false };
  }
  return { lock: next, started: true };
}

export function releaseSendLock(current: SendLock | null, finished: SendLock): SendLock | null {
  if (
    current &&
    current.conversationId === finished.conversationId &&
    current.organizationId === finished.organizationId &&
    current.generation === finished.generation &&
    current.localId === finished.localId &&
    current.key === finished.key
  ) {
    return null;
  }
  return current;
}

export function mergeTranscriptByVersion(current: readonly MessageRecord[], incoming: readonly MessageRecord[]): MessageRecord[] {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = map.get(message.id);
    if (!existing || message.version > existing.version) {
      map.set(message.id, message);
      continue;
    }
    if (message.version === existing.version) {
      map.set(message.id, { ...existing, resourcePreviews: message.resourcePreviews });
    }
  }
  return [...map.values()].sort(compareMessages);
}

export function draftAfterSuccessfulSend(currentDraft: string, submittedBody: string, sameContext: boolean): string {
  if (!sameContext || currentDraft !== submittedBody) {
    return currentDraft;
  }
  return "";
}

export function applySendFailure(rows: readonly PendingSend[], localId: string, discarded: ReadonlySet<string>): PendingSend[] {
  if (discarded.has(localId)) {
    return rows.filter((row) => row.localId !== localId);
  }
  return rows.map((row) => (row.localId === localId ? { ...row, lifecycle: "failed" } : row));
}

export function acceptCreateResult(input: {
  organizationId: string;
  generation: number;
  requestId: string;
  currentOrganizationId: string | null;
  currentGeneration: number;
  currentRequestId: string | null;
  dialogOpen: boolean;
}): boolean {
  return (
    input.dialogOpen &&
    input.currentOrganizationId === input.organizationId &&
    input.currentGeneration === input.generation &&
    input.currentRequestId === input.requestId
  );
}

export function reconciledTombstone(
  message: Pick<MessageRecord, "lifecycle" | "deletedAt" | "version"> | undefined,
): "done" | "retry" | "unavailable" {
  if (!message) {
    return "unavailable";
  }
  if (message.deletedAt || message.lifecycle === "TOMBSTONED") {
    return "done";
  }
  return "retry";
}

export function discardFailedSends(rows: readonly PendingSend[]): PendingSend[] {
  return rows.filter((row) => row.lifecycle !== "failed");
}

export function reuseSendKey(previous: { key: string; body: string } | null, body: string): string | null {
  if (previous && previous.body === body) {
    return previous.key;
  }
  return null;
}

export function appendUniqueMessage<T extends { id: string }>(items: readonly T[], next: T): T[] {
  if (items.some((item) => item.id === next.id)) {
    return [...items];
  }
  return [...items, next];
}

export function visiblePendingSends(pending: readonly PendingSend[], serverIds: ReadonlySet<string>, resolvedIds: ReadonlyMap<string, string>): PendingSend[] {
  return pending.filter((row) => {
    const resolved = resolvedIds.get(row.localId);
    return !resolved || !serverIds.has(resolved);
  });
}

export function watermarkTarget(messages: readonly { id: string }[]): string | null {
  return messages.length > 0 ? messages[messages.length - 1].id : null;
}

export function nextInboxIndex(current: number, length: number, key: string): number | null {
  if (length <= 0) {
    return null;
  }
  if (key === "ArrowDown") {
    return Math.min(current + 1, length - 1);
  }
  if (key === "ArrowUp") {
    return Math.max(current - 1, 0);
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return length - 1;
  }
  return null;
}

export function composerKeyAction(event: { key: string; shiftKey: boolean }): "send" | "newline" | "ignore" {
  if (event.key === "Enter" && event.shiftKey) {
    return "newline";
  }
  if (event.key === "Enter") {
    return "send";
  }
  return "ignore";
}

export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export interface ProjectPeerRow {
  organizationMembershipId: string;
  displayName: string;
  status: string;
}

export type InboxPageDisposition = "commit" | "deny" | "retry";

export function inboxPageDisposition(status: number): InboxPageDisposition {
  if (status >= 200 && status < 300) {
    return "commit";
  }
  if (isAuthorizationMiss(status)) {
    return "deny";
  }
  return "retry";
}

export function membersFromProjectRows(rows: readonly ProjectPeerRow[], actorMembershipId: string | null): DirectoryMember[] {
  const seen = new Set<string>();
  const members: DirectoryMember[] = [];
  for (const row of rows) {
    const id = row.organizationMembershipId.trim();
    if (!id || id === actorMembershipId || seen.has(id)) {
      continue;
    }
    seen.add(id);
    members.push({ id, displayName: row.displayName, status: row.status });
  }
  return members;
}

export function peersFromProjectMembers(rows: readonly ProjectPeerRow[], actorMembershipId: string | null): DirectoryMember[] {
  const seen = new Set<string>();
  const peers: DirectoryMember[] = [];
  for (const row of rows) {
    if (row.status !== "ACTIVE") {
      continue;
    }
    const id = row.organizationMembershipId.trim();
    if (!id || id === actorMembershipId || seen.has(id)) {
      continue;
    }
    seen.add(id);
    peers.push({ id, displayName: row.displayName, status: "ACTIVE" });
  }
  peers.sort((left, right) => left.displayName.localeCompare(right.displayName, "pt"));
  return peers;
}

export function compareMessages(left: Pick<MessageRecord, "createdAt" | "id">, right: Pick<MessageRecord, "createdAt" | "id">): number {
  if (left.createdAt < right.createdAt) {
    return -1;
  }
  if (left.createdAt > right.createdAt) {
    return 1;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

export function appendInboxItems<T extends { id: string }>(existing: readonly T[], page: readonly T[]): { items: T[]; added: number } {
  const seen = new Set(existing.map((item) => item.id));
  const items = [...existing];
  let added = 0;
  for (const item of page) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    items.push(item);
    added += 1;
  }
  return { items, added };
}

export function appendTranscriptPage(existing: readonly MessageRecord[], page: readonly MessageRecord[]): { messages: MessageRecord[]; added: number } {
  const seen = new Set(existing.map((message) => message.id));
  const messages = [...existing];
  let added = 0;
  for (const message of page) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    messages.push(message);
    added += 1;
  }
  messages.sort(compareMessages);
  return { messages, added };
}

/** Stop when the cursor repeats, the page adds nothing, or the server has no further page. */
export function nextTranscriptCursor(previousCursor: string | null, nextCursor: string | null, added: number): string | null {
  if (!nextCursor || nextCursor === previousCursor || added === 0) {
    return null;
  }
  return nextCursor;
}

export function acceptAsyncResult<T>(input: {
  generation: number;
  currentGeneration: number;
  revokedGeneration: number | null;
  value: T;
}): T | null {
  if (input.generation !== input.currentGeneration) {
    return null;
  }
  if (input.revokedGeneration !== null && input.generation <= input.revokedGeneration) {
    return null;
  }
  return input.value;
}

export function beginSend(inFlight: boolean, body: string): { inFlight: boolean; started: boolean } {
  if (inFlight || body.trim().length === 0) {
    return { inFlight, started: false };
  }
  return { inFlight: true, started: true };
}

export function stateCopy(state: MessagingSurface): { title: string; detail: string } {
  switch (state) {
    case "loading":
      return { title: "Carregando mensagens", detail: "Buscando apenas conversas autorizadas." };
    case "empty":
      return { title: "Nenhuma conversa", detail: "Inicie uma conversa direta ou abra o chat de uma equipe acessível." };
    case "filtered-empty":
      return { title: "Nenhum resultado", detail: "Nenhuma conversa autorizada corresponde a este filtro." };
    case "error":
      return { title: "Não foi possível carregar", detail: "A lista pode ser tentada de novo. Nada foi alterado." };
    case "no-permission":
      return { title: "Sem acesso a Mensagens", detail: "A Organization ativa não devolveu conversas para esta sessão." };
    case "revoked":
      return { title: "Conversa indisponível", detail: "O acesso foi revogado ou a conversa não está mais visível. O conteúdo foi removido desta tela." };
    default:
      return { title: "Mensagens", detail: "" };
  }
}
