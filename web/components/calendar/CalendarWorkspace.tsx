"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import {
  addDaysIso,
  addMonths,
  canAdminGrants,
  canMutateManualEvents,
  classifyCalendarHttp,
  FIGMA_CALENDAR_NODES,
  formatMonthHeading,
  isArchivedCalendar,
  parseCalendarView,
  provenanceLabel,
  todayInZone,
  type CalendarEventListResponse,
  type CalendarEventRecord,
  type CalendarRecord,
  type CalendarSurfaceState,
  type CalendarViewId,
  windowIsoForView,
} from "../../lib/calendar";
import { CalendarStates } from "./CalendarStates";
import { CalendarAgendaView, CalendarDayView, CalendarMonthView, CalendarViewTabs, CalendarWeekView } from "./CalendarViews";
import { CalendarEventEditor } from "./CalendarEventEditor";

export function CalendarWorkspace({ calendarId }: { calendarId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = parseCalendarView(searchParams.get("view"));
  const [calendar, setCalendar] = useState<CalendarRecord | null>(null);
  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [surface, setSurface] = useState<CalendarSurfaceState>("loading");
  const [detail, setDetail] = useState<string | undefined>();
  const [anchorDate, setAnchorDate] = useState(() => todayInZone("America/Sao_Paulo"));
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarEventRecord | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [draftHour, setDraftHour] = useState<number | null>(null);

  const timeZone = calendar?.timeZone || "America/Sao_Paulo";
  const archived = calendar ? isArchivedCalendar(calendar) : false;
  const canEdit = calendar ? canMutateManualEvents(calendar) && surface !== "inactive" : false;

  const replaceView = useCallback(
    (next: CalendarViewId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "month") {
        params.delete("view");
      } else {
        params.set("view", next);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const meta = await api<CalendarRecord>(`/api/v1/calendars/${calendarId}`);
    if (!meta.ok) {
      setCalendar(null);
      setEvents([]);
      setSurface(classifyCalendarHttp(meta.status, meta.problem));
      setDetail(meta.problem.detail);
      setLoading(false);
      return;
    }
    setCalendar(meta.body);
    setAnchorDate((current) => current || todayInZone(meta.body.timeZone));
    const window = windowIsoForView(view, anchorDate || todayInZone(meta.body.timeZone), meta.body.timeZone);
    const collected: CalendarEventRecord[] = [];
    let cursor: string | null = null;
    do {
      const search = new URLSearchParams({ from: window.from, to: window.to, limit: "100" });
      if (cursor) {
        search.set("cursor", cursor);
      }
      const page: Awaited<ReturnType<typeof api<CalendarEventListResponse>>> = await api<CalendarEventListResponse>(
        `/api/v1/calendars/${calendarId}/events?${search.toString()}`,
      );
      if (!page.ok) {
        setSurface(classifyCalendarHttp(page.status, page.problem));
        setDetail(page.problem.detail);
        setEvents([]);
        setLoading(false);
        return;
      }
      collected.push(...(page.body.items ?? []));
      cursor = page.body.nextCursor;
    } while (cursor);
    setEvents(collected);
    setSurface(isArchivedCalendar(meta.body) ? "archived" : "ready");
    setDetail(undefined);
    setLoading(false);
  }, [anchorDate, calendarId, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const heading = useMemo(() => {
    if (view === "month") {
      return formatMonthHeading(anchorDate);
    }
    return formatMonthHeading(anchorDate);
  }, [anchorDate, view]);

  function openCreate(isoDate: string, hour?: number) {
    if (!canEdit) {
      return;
    }
    setSelected(null);
    setDraftDate(isoDate);
    setDraftHour(hour ?? 9);
    setEditorOpen(true);
  }

  function openEvent(event: CalendarEventRecord) {
    setSelected(event);
    setDraftDate(null);
    setDraftHour(null);
    setEditorOpen(true);
  }

  function shift(delta: number) {
    if (view === "month") {
      setAnchorDate((current) => addMonths(current, delta));
      return;
    }
    setAnchorDate((current) => addDaysIso(current, view === "week" ? delta * 7 : delta));
  }

  if (loading && !calendar) {
    return <CalendarStates state="loading" />;
  }
  if (!calendar && (surface === "no-permission" || surface === "revoked" || surface === "error" || surface === "inactive")) {
    return (
      <CalendarStates
        state={surface}
        detail={detail}
        onRetry={surface === "error" ? () => void load() : undefined}
        action={{ href: "/calendars", label: "Voltar aos calendários" }}
      />
    );
  }
  if (!calendar) {
    return <CalendarStates state="revoked" action={{ href: "/calendars", label: "Voltar aos calendários" }} />;
  }

  return (
    <div className="calendar-workspace" data-node-id={FIGMA_CALENDAR_NODES.a11y} data-narrow-node={FIGMA_CALENDAR_NODES.narrow}>
      <header className="structure-header calendar-workspace-header">
        <div>
          <h1>
            {calendar.name} · {view === "month" ? "Mês" : view === "week" ? "Semana" : view === "day" ? "Dia" : "Agenda"}
          </h1>
          <p>
            {provenanceLabel(calendar)}. Eventos referenciados só aparecem quando a origem continua autorizada.
          </p>
        </div>
        <div className="calendar-workspace-actions">
          {canAdminGrants(calendar) ? (
            <Link className="btn secondary" href={`/calendars/${calendar.id}/share`}>
              Compartilhar
            </Link>
          ) : null}
          {canEdit ? (
            <button type="button" className="btn" onClick={() => openCreate(anchorDate)}>
              Novo evento
            </button>
          ) : null}
        </div>
      </header>

      {archived ? <CalendarStates state="archived" /> : null}
      {surface === "inactive" ? <CalendarStates state="inactive" /> : null}

      <div className="calendar-toolbar">
        <CalendarViewTabs view={view} onChange={replaceView} />
        <div className="calendar-nav">
          <button type="button" className="btn secondary" onClick={() => setAnchorDate(todayInZone(timeZone))}>
            Hoje
          </button>
          <button type="button" className="btn secondary" onClick={() => shift(-1)} aria-label="Período anterior">
            ‹
          </button>
          <p className="calendar-heading">{heading}</p>
          <button type="button" className="btn secondary" onClick={() => shift(1)} aria-label="Próximo período">
            ›
          </button>
        </div>
      </div>

      <div className="calendar-canvas" data-view={view}>
        {view === "month" ? (
          <CalendarMonthView
            anchorDate={anchorDate}
            timeZone={timeZone}
            events={events}
            onSelectDay={(isoDate) => {
              setAnchorDate(isoDate);
              replaceView("day");
            }}
            onOpenEvent={openEvent}
          />
        ) : null}
        {view === "week" ? (
          <CalendarWeekView
            anchorDate={anchorDate}
            timeZone={timeZone}
            events={events}
            onOpenEvent={openEvent}
            onSelectSlot={openCreate}
          />
        ) : null}
        {view === "day" ? (
          <CalendarDayView
            anchorDate={anchorDate}
            timeZone={timeZone}
            events={events}
            onOpenEvent={openEvent}
            onSelectSlot={openCreate}
          />
        ) : null}
        {view === "agenda" ? <CalendarAgendaView events={events} timeZone={timeZone} onOpenEvent={openEvent} /> : null}
        {events.length === 0 && view === "agenda" ? null : events.length === 0 && view !== "agenda" ? (
          <p className="muted calendar-empty-hint">Nenhum evento autorizado neste período.</p>
        ) : null}
      </div>

      <CalendarEventEditor
        open={editorOpen}
        calendar={calendar}
        event={selected}
        draftDate={draftDate}
        draftHour={draftHour}
        readOnly={!canEdit}
        onClose={() => setEditorOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
