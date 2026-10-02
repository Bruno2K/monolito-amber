import { newIdempotencyKey } from "./planning";
import type { AmberProblem } from "./types";

export type CalendarViewId = "month" | "week" | "day" | "agenda";
export type CalendarEffectiveRole = "OWNER" | "EDITOR" | "VIEWER";
export type CalendarAccessKind = "USER" | "TEAM";
export type CalendarGrantRole = "VIEWER" | "EDITOR";
export type CalendarEventKind = "MANUAL" | "REFERENCED";
export type CalendarReferenceType = "TASK" | "MILESTONE" | "DELIVERABLE" | "GATE";
export type MyScheduleSourceKind = "OWNED_CALENDAR" | "DIRECT_GRANT" | "TEAM_GRANT" | "AUTHORIZED_PROJECT_DATE";

export const CALENDAR_VIEWS: readonly { id: CalendarViewId; label: string }[] = [
  { id: "month", label: "Mês" },
  { id: "week", label: "Semana" },
  { id: "day", label: "Dia" },
  { id: "agenda", label: "Agenda" },
];

export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export const SCHEDULE_TOGGLE_KEYS = [
  "includeOwned",
  "includeDirect",
  "includeTeam",
  "includeProjectDates",
] as const;
export type ScheduleToggleKey = (typeof SCHEDULE_TOGGLE_KEYS)[number];

export const SCHEDULE_TOGGLE_LABELS: Record<ScheduleToggleKey, string> = {
  includeOwned: "Calendários próprios",
  includeDirect: "Compartilhados comigo",
  includeTeam: "Via equipe",
  includeProjectDates: "Datas de projeto autorizadas",
};

export const SCHEDULE_TOGGLE_STORAGE_KEY = "amber.calendar.schedule-toggles";

export interface CalendarRecord {
  id: string;
  organizationId: string;
  ownerOrganizationMembershipId: string;
  name: string;
  description: string;
  timeZone: string;
  status: "ACTIVE" | "ARCHIVED" | string;
  archivedAt: string | null;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  effectiveRole: CalendarEffectiveRole | null;
  accessPaths: Array<{ kind: CalendarAccessKind; role: CalendarGrantRole }>;
}

export interface CalendarGrantRecord {
  id: string;
  organizationId: string;
  calendarId: string;
  principalKind: CalendarAccessKind;
  organizationMembershipId: string | null;
  teamId: string | null;
  role: CalendarGrantRole;
  revokedAt: string | null;
  createdByOrganizationMembershipId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CalendarShareTarget {
  principalKind: CalendarAccessKind;
  organizationMembershipId: string | null;
  teamId: string | null;
  displayName: string;
  email: string | null;
}

export interface CalendarEventRecord {
  id: string;
  organizationId?: string;
  calendarId: string | null;
  kind: CalendarEventKind | string;
  title: string;
  description: string;
  allDay: boolean;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  timeZone: string | null;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  linkedProjectId: string | null;
  referenceType: CalendarReferenceType | string | null;
  referenceId: string | null;
  createdByOrganizationMembershipId?: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  sourceKind?: MyScheduleSourceKind;
  sourceIdentity?: string;
}

export interface ScheduleToggles {
  includeOwned: boolean;
  includeDirect: boolean;
  includeTeam: boolean;
  includeProjectDates: boolean;
}

export interface CalendarListResponse {
  items: CalendarRecord[];
  total: number;
}

export interface CalendarGrantListResponse {
  items: CalendarGrantRecord[];
  ownerIntrinsic: boolean;
}

export interface CalendarEventListResponse {
  items: CalendarEventRecord[];
  nextCursor: string | null;
}

export type CalendarSurfaceState =
  | "loading"
  | "empty"
  | "filtered-empty"
  | "error"
  | "no-permission"
  | "revoked"
  | "inactive"
  | "archived"
  | "ready";

export function parseCalendarView(value: string | null | undefined): CalendarViewId {
  if (value === "week" || value === "day" || value === "agenda" || value === "month") {
    return value;
  }
  return "month";
}

export function isOwnedCalendar(calendar: Pick<CalendarRecord, "effectiveRole">): boolean {
  return calendar.effectiveRole === "OWNER";
}

export function isArchivedCalendar(calendar: Pick<CalendarRecord, "status" | "archivedAt">): boolean {
  return calendar.status === "ARCHIVED" || Boolean(calendar.archivedAt);
}

export function canMutateManualEvents(calendar: Pick<CalendarRecord, "effectiveRole" | "status" | "archivedAt">): boolean {
  if (isArchivedCalendar(calendar)) {
    return false;
  }
  return calendar.effectiveRole === "OWNER" || calendar.effectiveRole === "EDITOR";
}

export function canAdminGrants(calendar: Pick<CalendarRecord, "effectiveRole" | "status" | "archivedAt">): boolean {
  return !isArchivedCalendar(calendar) && calendar.effectiveRole === "OWNER";
}

export function canRenameOrArchive(calendar: Pick<CalendarRecord, "effectiveRole" | "status" | "archivedAt">): boolean {
  return !isArchivedCalendar(calendar) && calendar.effectiveRole === "OWNER";
}

export function provenanceKind(calendar: Pick<CalendarRecord, "effectiveRole" | "accessPaths">): "owned" | "direct" | "team" {
  if (calendar.effectiveRole === "OWNER") {
    return "owned";
  }
  if (calendar.accessPaths.some((path) => path.kind === "USER")) {
    return "direct";
  }
  return "team";
}

export function provenanceLabel(calendar: Pick<CalendarRecord, "effectiveRole" | "accessPaths">): string {
  if (calendar.effectiveRole === "OWNER") {
    return "Proprietário";
  }
  const hasDirect = calendar.accessPaths.some((path) => path.kind === "USER");
  const hasTeam = calendar.accessPaths.some((path) => path.kind === "TEAM");
  const role = calendar.effectiveRole === "EDITOR" ? "Editor" : "Visualizador";
  if (hasDirect && hasTeam) {
    return `${role} · direto e via equipe`;
  }
  if (hasTeam) {
    return `${role} · herdado via equipe`;
  }
  return `${role} · compartilhamento direto`;
}

export function grantRowKind(grant: Pick<CalendarGrantRecord, "principalKind">): "direct" | "team" {
  return grant.principalKind === "TEAM" ? "team" : "direct";
}

export function inheritedGrantNotEditable(input: {
  actorIsOwner: boolean;
  grant: Pick<CalendarGrantRecord, "principalKind" | "revokedAt">;
}): boolean {
  if (input.grant.revokedAt) {
    return true;
  }
  if (!input.actorIsOwner) {
    return true;
  }
  return false;
}

export function viewerEditorCapabilityCopy(role: CalendarGrantRole): string {
  if (role === "EDITOR") {
    return "Editor pode criar, editar e excluir eventos manuais. Não pode compartilhar, alterar concessões nem arquivar o calendário.";
  }
  return "Visualizador pode ler o calendário. Não pode alterar eventos, concessões ou o calendário.";
}

export function revokeEffectCopy(input: {
  remainingRole: CalendarGrantRole | "OWNER" | null;
  principalLabel: string;
}): string {
  if (input.remainingRole === "OWNER") {
    return `Revogar remove só este caminho. ${input.principalLabel} continua como proprietário.`;
  }
  if (input.remainingRole === "EDITOR") {
    return `Revogar remove só este caminho. ${input.principalLabel} continua com acesso de Editor por outro caminho.`;
  }
  if (input.remainingRole === "VIEWER") {
    return `Revogar remove só este caminho. ${input.principalLabel} continua com acesso de Visualizador por outro caminho.`;
  }
  return `Revogar este caminho remove o acesso imediatamente. ${input.principalLabel} deixa de ver o calendário se não houver outro caminho válido.`;
}

export function referencedSourceHref(event: Pick<CalendarEventRecord, "kind" | "linkedProjectId" | "referenceType" | "referenceId">): string | null {
  if (event.kind !== "REFERENCED" || !event.linkedProjectId || !event.referenceId) {
    return null;
  }
  switch (event.referenceType) {
    case "TASK":
      return `/projects/${event.linkedProjectId}/planner?inspect=${event.referenceId}`;
    case "MILESTONE":
      return `/projects/${event.linkedProjectId}/planner?view=milestones&milestone=${event.referenceId}`;
    case "DELIVERABLE":
      return `/projects/${event.linkedProjectId}/deliverables`;
    case "GATE":
      return `/projects/${event.linkedProjectId}/overview`;
    default:
      return `/projects/${event.linkedProjectId}/overview`;
  }
}

export function referenceTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "TASK":
      return "Tarefa";
    case "MILESTONE":
      return "Marco";
    case "DELIVERABLE":
      return "Entrega";
    case "GATE":
      return "Gate";
    default:
      return "Origem";
  }
}

export function sourceKindLabel(kind: MyScheduleSourceKind | undefined): string {
  switch (kind) {
    case "OWNED_CALENDAR":
      return "Calendário próprio";
    case "DIRECT_GRANT":
      return "Compartilhado diretamente";
    case "TEAM_GRANT":
      return "Via equipe";
    case "AUTHORIZED_PROJECT_DATE":
      return "Data de projeto";
    default:
      return "Calendário";
  }
}

export function defaultScheduleToggles(): ScheduleToggles {
  return {
    includeOwned: true,
    includeDirect: true,
    includeTeam: true,
    includeProjectDates: true,
  };
}

export function parseScheduleToggles(raw: unknown): ScheduleToggles {
  const fallback = defaultScheduleToggles();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }
  const record = raw as Record<string, unknown>;
  return {
    includeOwned: record.includeOwned !== false,
    includeDirect: record.includeDirect !== false,
    includeTeam: record.includeTeam !== false,
    includeProjectDates: record.includeProjectDates !== false,
  };
}

export function readScheduleToggles(): ScheduleToggles {
  if (typeof window === "undefined") {
    return defaultScheduleToggles();
  }
  try {
    const raw = window.localStorage.getItem(SCHEDULE_TOGGLE_STORAGE_KEY);
    return raw ? parseScheduleToggles(JSON.parse(raw)) : defaultScheduleToggles();
  } catch {
    return defaultScheduleToggles();
  }
}

export function writeScheduleToggles(toggles: ScheduleToggles): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SCHEDULE_TOGGLE_STORAGE_KEY, JSON.stringify(toggles));
}

export function scheduleQueryFromToggles(toggles: ScheduleToggles): string {
  const params = new URLSearchParams();
  for (const key of SCHEDULE_TOGGLE_KEYS) {
    params.set(key, toggles[key] ? "true" : "false");
  }
  return params.toString();
}

export function classifyCalendarHttp(status: number, problem?: AmberProblem | null): CalendarSurfaceState {
  if (status === 401) {
    return "revoked";
  }
  if (status === 403 || status === 404) {
    const detail = `${problem?.detail ?? ""} ${problem?.code ?? ""}`.toLowerCase();
    if (detail.includes("inactive") || detail.includes("inativ") || detail.includes("frozen") || detail.includes("congel")) {
      return "inactive";
    }
    return status === 404 ? "revoked" : "no-permission";
  }
  return "error";
}

export function calendarStateCopy(state: CalendarSurfaceState): { title: string; detail: string } {
  switch (state) {
    case "loading":
      return { title: "Carregando", detail: "Carregando calendários autorizados…" };
    case "empty":
      return { title: "Nenhum calendário", detail: "Crie um calendário privado. A organização sozinha não lista calendários de outras pessoas." };
    case "filtered-empty":
      return { title: "Nenhum calendário corresponde à busca", detail: "Ajuste a busca. Resultados mostram só calendários que você possui ou que estão compartilhados agora." };
    case "error":
      return { title: "Não foi possível carregar", detail: "Tente novamente. Nada além dos calendários autorizados é revelado." };
    case "no-permission":
      return { title: "Acesso negado", detail: "Este calendário não está disponível para a sua sessão." };
    case "revoked":
      return { title: "Acesso encerrado", detail: "O compartilhamento foi revogado ou o link não é mais válido." };
    case "inactive":
      return { title: "Somente leitura", detail: "O proprietário está inativo. Eventos e concessões não podem ser alterados até a reativação." };
    case "archived":
      return { title: "Calendário arquivado", detail: "O histórico permanece visível. Eventos e concessões não podem ser alterados." };
    default:
      return { title: "Calendários", detail: "" };
  }
}

export function zonedParts(
  value: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  let hour = Number.parseInt(read("hour"), 10);
  if (hour === 24) {
    hour = 0;
  }
  return {
    year: Number.parseInt(read("year"), 10),
    month: Number.parseInt(read("month"), 10),
    day: Number.parseInt(read("day"), 10),
    hour,
    minute: Number.parseInt(read("minute"), 10),
    weekday: weekdayMap[read("weekday")] ?? 0,
  };
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function partsYmd(parts: { year: number; month: number; day: number }): string {
  return ymd(parts.year, parts.month, parts.day);
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return ymd(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(isoDate: string, months: number): string {
  const [year, month] = isoDate.split("-").map(Number);
  const index = (year ?? 1970) * 12 + ((month ?? 1) - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return ymd(nextYear, nextMonth, 1);
}

export function todayInZone(timeZone: string, now = new Date()): string {
  return partsYmd(zonedParts(now, timeZone));
}

export function monthGridStart(isoDate: string): string {
  const first = startOfMonth(isoDate);
  const [year, month, day] = first.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const weekday = (utc.getUTCDay() + 6) % 7;
  return addDaysIso(first, -weekday);
}

export function monthGridDays(isoDate: string): string[] {
  const start = monthGridStart(isoDate);
  return Array.from({ length: 42 }, (_, index) => addDaysIso(start, index));
}

export function weekDays(isoDate: string): string[] {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const weekday = (utc.getUTCDay() + 6) % 7;
  const start = addDaysIso(isoDate, -weekday);
  return Array.from({ length: 7 }, (_, index) => addDaysIso(start, index));
}

export function formatMonthHeading(isoDate: string, locale = "pt-BR"): string {
  const [year, month] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
  const formatted = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatDayHeading(isoDate: string, locale = "pt-BR"): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function eventLocalRange(
  event: Pick<CalendarEventRecord, "allDay" | "startsAt" | "endsAt" | "timeZone" | "allDayStartDate" | "allDayEndDate">,
  fallbackZone: string,
): { start: string; end: string; startHour: number; startMinute: number; endHour: number; endMinute: number } | null {
  if (event.allDay) {
    const start = event.allDayStartDate?.slice(0, 10);
    if (!start) {
      return null;
    }
    return {
      start,
      end: event.allDayEndDate?.slice(0, 10) ?? start,
      startHour: 0,
      startMinute: 0,
      endHour: 23,
      endMinute: 59,
    };
  }
  const startAt = toDate(event.startsAt);
  if (!startAt) {
    return null;
  }
  const zone = event.timeZone || fallbackZone;
  const startParts = zonedParts(startAt, zone);
  const endAt = toDate(event.endsAt) ?? startAt;
  const endParts = zonedParts(endAt, zone);
  return {
    start: partsYmd(startParts),
    end: partsYmd(endParts),
    startHour: startParts.hour,
    startMinute: startParts.minute,
    endHour: endParts.hour,
    endMinute: endParts.minute,
  };
}

export function eventOverlapsDate(event: CalendarEventRecord, isoDate: string, fallbackZone: string): boolean {
  const range = eventLocalRange(event, fallbackZone);
  if (!range) {
    return false;
  }
  return range.start <= isoDate && isoDate <= range.end;
}

export function formatEventTime(event: CalendarEventRecord, fallbackZone: string): string {
  if (event.allDay) {
    return "Dia inteiro";
  }
  const range = eventLocalRange(event, fallbackZone);
  if (!range) {
    return "";
  }
  return `${pad2(range.startHour)}:${pad2(range.startMinute)}`;
}

export function eventAccessibleName(event: CalendarEventRecord, fallbackZone: string): string {
  const when = formatEventTime(event, fallbackZone);
  const kind = event.kind === "REFERENCED" ? `referenciado ${referenceTypeLabel(event.referenceType)}` : "manual";
  return `${event.title}, ${when || "sem horário"}, ${kind}`;
}

export function windowIsoForView(view: CalendarViewId, anchorDate: string, timeZone: string): { from: string; to: string } {
  void timeZone;
  const days =
    view === "day" ? [anchorDate] : view === "week" || view === "agenda" ? weekDays(anchorDate) : monthGridDays(anchorDate);
  const first = days[0] ?? anchorDate;
  const last = days[days.length - 1] ?? anchorDate;
  return {
    from: `${addDaysIso(first, -1)}T00:00:00.000Z`,
    to: `${addDaysIso(last, 2)}T00:00:00.000Z`,
  };
}

export function localDateTimeValue(isoDate: string, hour: number, minute: number): string {
  return `${isoDate}T${pad2(hour)}:${pad2(minute)}:00`;
}

export function datetimeLocalInput(isoDate: string, hour: number, minute: number): string {
  return `${isoDate}T${pad2(hour)}:${pad2(minute)}`;
}

export function calendarIdempotencyKey(prefix: string): string {
  return newIdempotencyKey(prefix);
}

export function grantDisplayName(
  grant: CalendarGrantRecord,
  targets: readonly CalendarShareTarget[],
): string {
  if (grant.principalKind === "USER") {
    const match = targets.find((row) => row.organizationMembershipId === grant.organizationMembershipId);
    return match?.displayName || match?.email || "Pessoa";
  }
  const match = targets.find((row) => row.teamId === grant.teamId);
  return match?.displayName || "Equipe";
}

export function asScheduleEvent(item: Partial<CalendarEventRecord> & { title: string; sourceIdentity?: string }): CalendarEventRecord {
  return {
    id: item.id || item.sourceIdentity || item.title,
    organizationId: item.organizationId,
    calendarId: item.calendarId ?? null,
    kind: item.kind || (item.referenceType ? "REFERENCED" : "MANUAL"),
    title: item.title,
    description: item.description ?? "",
    allDay: Boolean(item.allDay),
    startsAt: item.startsAt ?? null,
    endsAt: item.endsAt ?? null,
    timeZone: item.timeZone ?? null,
    allDayStartDate: item.allDayStartDate ?? null,
    allDayEndDate: item.allDayEndDate ?? null,
    linkedProjectId: item.linkedProjectId ?? null,
    referenceType: item.referenceType ?? null,
    referenceId: item.referenceId ?? null,
    version: item.version ?? 1,
    sourceKind: item.sourceKind,
    sourceIdentity: item.sourceIdentity,
  };
}

export function hoursInDay(): number[] {
  return Array.from({ length: 24 }, (_, hour) => hour);
}

export const FIGMA_CALENDAR_NODES = {
  hub: "261:7675",
  month: "261:7783",
  week: "261:7887",
  day: "261:7991",
  editor: "262:8118",
  share: "262:8222",
  states: "264:8332",
  narrow: "264:8436",
  a11y: "264:8540",
} as const;
