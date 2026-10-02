"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import {
  addDaysIso,
  addMonths,
  defaultScheduleToggles,
  FIGMA_CALENDAR_NODES,
  formatMonthHeading,
  parseCalendarView,
  readScheduleToggles,
  referencedSourceHref,
  referenceTypeLabel,
  SCHEDULE_TOGGLE_KEYS,
  SCHEDULE_TOGGLE_LABELS,
  scheduleQueryFromToggles,
  sourceKindLabel,
  todayInZone,
  windowIsoForView,
  writeScheduleToggles,
  asScheduleEvent,
  type CalendarEventListResponse,
  type CalendarEventRecord,
  type CalendarViewId,
  type ScheduleToggles,
} from "../../lib/calendar";
import { CalendarStates } from "./CalendarStates";
import { CalendarAgendaView, CalendarDayView, CalendarMonthView, CalendarViewTabs, CalendarWeekView } from "./CalendarViews";

export function MyScheduleView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = parseCalendarView(searchParams.get("view"));
  const [toggles, setToggles] = useState<ScheduleToggles>(defaultScheduleToggles);
  const [items, setItems] = useState<CalendarEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anchorDate, setAnchorDate] = useState(() => todayInZone("America/Sao_Paulo"));
  const [selected, setSelected] = useState<CalendarEventRecord | null>(null);
  const timeZone = "America/Sao_Paulo";

  useEffect(() => {
    setToggles(readScheduleToggles());
  }, []);

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
    setError(null);
    const window = windowIsoForView(view, anchorDate, timeZone);
    const collected: CalendarEventRecord[] = [];
    let cursor: string | null = null;
    do {
      const search = new URLSearchParams({
        from: window.from,
        to: window.to,
        limit: "100",
        ...Object.fromEntries(new URLSearchParams(scheduleQueryFromToggles(toggles))),
      });
      if (cursor) {
        search.set("cursor", cursor);
      }
      const page = await api<CalendarEventListResponse>(`/api/v1/schedule?${search.toString()}`);
      if (!page.ok) {
        setItems([]);
        setError(page.problem.detail || "Não foi possível carregar a agenda.");
        setLoading(false);
        return;
      }
      collected.push(...(page.body.items ?? []).map((item) => asScheduleEvent(item)));
      cursor = page.body.nextCursor;
    } while (cursor);
    setItems(collected);
    setLoading(false);
  }, [anchorDate, timeZone, toggles, view]);

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

  function updateToggle(key: keyof ScheduleToggles, value: boolean) {
    const next = { ...toggles, [key]: value };
    setToggles(next);
    writeScheduleToggles(next);
  }

  function shift(delta: number) {
    if (view === "month") {
      setAnchorDate((current) => addMonths(current, delta));
      return;
    }
    setAnchorDate((current) => addDaysIso(current, view === "week" ? delta * 7 : delta));
  }

  const selectedHref = selected ? referencedSourceHref(selected) : null;
  const heading = useMemo(() => formatMonthHeading(anchorDate), [anchorDate]);

  if (loading && items.length === 0 && !error) {
    return <CalendarStates state="loading" />;
  }
  if (error && items.length === 0) {
    return <CalendarStates state="error" detail={error} onRetry={() => void load()} />;
  }

  return (
    <div className="calendar-schedule" data-node-id={FIGMA_CALENDAR_NODES.a11y}>
      <header className="structure-header">
        <div>
          <h1>Minha Agenda</h1>
          <p>Reúne calendários próprios, compartilhados, via equipe e datas de projeto autorizadas. Os interruptores são preferência — cada consulta revalida o acesso.</p>
        </div>
      </header>

      <div className="calendar-schedule-layout">
        <aside className="calendar-sources" aria-label="Fontes da agenda">
          <h2>Fontes da agenda</h2>
          {SCHEDULE_TOGGLE_KEYS.map((key) => (
            <label key={key} className="calendar-check">
              <input
                type="checkbox"
                checked={toggles[key]}
                onChange={(event) => updateToggle(key, event.target.checked)}
              />
              {SCHEDULE_TOGGLE_LABELS[key]}
            </label>
          ))}
          <p className="muted">Desligar uma fonte não concede nem revoga acesso. Eventos sem autorização atual são omitidos, sem nome, contagem, horário ou cor.</p>
        </aside>

        <div className="calendar-schedule-main">
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

          {view === "month" ? (
            <CalendarMonthView
              anchorDate={anchorDate}
              timeZone={timeZone}
              events={items}
              onSelectDay={(isoDate) => {
                setAnchorDate(isoDate);
                replaceView("day");
              }}
              onOpenEvent={setSelected}
            />
          ) : null}
          {view === "week" ? (
            <CalendarWeekView
              anchorDate={anchorDate}
              timeZone={timeZone}
              events={items}
              onOpenEvent={setSelected}
              onSelectSlot={() => undefined}
            />
          ) : null}
          {view === "day" ? (
            <CalendarDayView
              anchorDate={anchorDate}
              timeZone={timeZone}
              events={items}
              onOpenEvent={setSelected}
              onSelectSlot={() => undefined}
            />
          ) : null}
          {view === "agenda" ? <CalendarAgendaView events={items} timeZone={timeZone} onOpenEvent={setSelected} /> : null}
        </div>
      </div>

      {selected ? (
        <div className="calendar-confirm" role="dialog" aria-labelledby="schedule-item-title">
          <h2 id="schedule-item-title">{selected.title}</h2>
          <p>{sourceKindLabel(selected.sourceKind)} · {selected.kind === "REFERENCED" ? referenceTypeLabel(selected.referenceType) : "Evento manual"}</p>
          {selectedHref ? (
            <p>
              <a className="btn" href={selectedHref}>
                Abrir origem autorizada
              </a>
            </p>
          ) : selected.calendarId ? (
            <p>
              <a className="btn secondary" href={`/calendars/${selected.calendarId}`}>
                Abrir calendário de origem
              </a>
            </p>
          ) : (
            <p className="muted">Sobreposição de agenda. A origem permanece no domínio de planejamento ou no calendário autorizado.</p>
          )}
          <button type="button" className="btn secondary" onClick={() => setSelected(null)}>
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}
