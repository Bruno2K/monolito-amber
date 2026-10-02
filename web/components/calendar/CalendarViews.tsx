import type { ReactNode } from "react";
import {
  CALENDAR_VIEWS,
  eventAccessibleName,
  eventOverlapsDate,
  FIGMA_CALENDAR_NODES,
  formatDayHeading,
  formatEventTime,
  formatMonthHeading,
  hoursInDay,
  monthGridDays,
  pad2,
  startOfMonth,
  weekDays,
  WEEKDAY_LABELS,
  type CalendarEventRecord,
  type CalendarViewId,
} from "../../lib/calendar";

export function CalendarViewTabs({
  view,
  onChange,
}: {
  view: CalendarViewId;
  onChange: (view: CalendarViewId) => void;
}) {
  return (
    <div className="calendar-tabs" role="tablist" aria-label="Projeção do calendário">
      {CALENDAR_VIEWS.map((item, index) => {
        const selected = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`calendar-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`calendar-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={selected ? "planner-tab is-active" : "planner-tab"}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                return;
              }
              event.preventDefault();
              const delta = event.key === "ArrowRight" ? 1 : -1;
              const next = CALENDAR_VIEWS[(index + delta + CALENDAR_VIEWS.length) % CALENDAR_VIEWS.length];
              if (!next) {
                return;
              }
              onChange(next.id);
              requestAnimationFrame(() => document.getElementById(`calendar-tab-${next.id}`)?.focus());
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function CalendarTabPanel({
  view,
  children,
}: {
  view: CalendarViewId;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`calendar-panel-${view}`}
      aria-labelledby={`calendar-tab-${view}`}
      className="calendar-canvas"
      data-view={view}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function CalendarMonthView({
  anchorDate,
  timeZone,
  events,
  onSelectDay,
  onOpenEvent,
}: {
  anchorDate: string;
  timeZone: string;
  events: CalendarEventRecord[];
  onSelectDay: (isoDate: string) => void;
  onOpenEvent: (event: CalendarEventRecord) => void;
}) {
  const days = monthGridDays(anchorDate);
  const monthPrefix = startOfMonth(anchorDate).slice(0, 7);
  const weeks = Array.from({ length: 6 }, (_, week) => days.slice(week * 7, week * 7 + 7));
  return (
    <CalendarTabPanel view="month">
    <table
      className="calendar-month"
      data-node-id={FIGMA_CALENDAR_NODES.month}
    >
      <caption className="sr-only">{formatMonthHeading(anchorDate)}</caption>
      <thead>
        <tr>
          {WEEKDAY_LABELS.map((label) => (
            <th key={label} scope="col" className="calendar-weekday">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((isoDate) => {
              const inMonth = isoDate.startsWith(monthPrefix);
              const dayEvents = events.filter((item) => eventOverlapsDate(item, isoDate, timeZone));
              return (
                <td key={isoDate} className={inMonth ? "calendar-day-cell" : "calendar-day-cell is-outside"}>
                  <button
                    type="button"
                    className="calendar-day-number"
                    onClick={() => onSelectDay(isoDate)}
                    aria-label={`${formatDayHeading(isoDate)}${dayEvents.length ? `, ${dayEvents.length} evento(s)` : ""}`}
                  >
                    {Number(isoDate.slice(8))}
                  </button>
                  <ul className="calendar-day-events">
                    {dayEvents.slice(0, 3).map((item) => (
                      <li key={item.id || item.sourceIdentity}>
                        <button
                          type="button"
                          className={item.kind === "REFERENCED" ? "calendar-chip is-referenced" : "calendar-chip"}
                          onClick={() => onOpenEvent(item)}
                        >
                          <span className="sr-only">
                            {eventAccessibleName(item, timeZone)} em {isoDate}
                          </span>
                          <span aria-hidden="true">
                            {formatEventTime(item, timeZone)} {item.title}
                          </span>
                        </button>
                      </li>
                    ))}
                    {dayEvents.length > 3 ? <li className="calendar-more">+{dayEvents.length - 3}</li> : null}
                  </ul>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
    </CalendarTabPanel>
  );
}

export function CalendarWeekView({
  anchorDate,
  timeZone,
  events,
  onOpenEvent,
  onSelectSlot,
}: {
  anchorDate: string;
  timeZone: string;
  events: CalendarEventRecord[];
  onOpenEvent: (event: CalendarEventRecord) => void;
  onSelectSlot: (isoDate: string, hour: number) => void;
}) {
  const days = weekDays(anchorDate);
  const hours = hoursInDay();
  return (
    <CalendarTabPanel view="week">
    <div className="calendar-week" data-node-id={FIGMA_CALENDAR_NODES.week}>
      <div className="calendar-allday-row">
        <div className="calendar-time-gutter">Dia inteiro</div>
        {days.map((isoDate) => (
          <div key={isoDate} className="calendar-allday-cell">
            {events
              .filter((item) => item.allDay && eventOverlapsDate(item, isoDate, timeZone))
              .map((item) => (
                <button key={item.id || item.sourceIdentity} type="button" className="calendar-chip" onClick={() => onOpenEvent(item)}>
                  {item.title}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="calendar-week-scroll" tabIndex={0} aria-label="Grade da semana">
        <div className="calendar-week-head">
          <div className="calendar-time-gutter" />
          {days.map((isoDate) => (
            <div key={isoDate} className="calendar-week-day">
              {formatDayHeading(isoDate)}
            </div>
          ))}
        </div>
        {hours.map((hour) => (
          <div key={hour} className="calendar-week-row">
            <div className="calendar-time-gutter">{pad2(hour)}:00</div>
            {days.map((isoDate) => {
              const slotEvents = events.filter((item) => {
                if (item.allDay || !eventOverlapsDate(item, isoDate, timeZone)) {
                  return false;
                }
                const time = formatEventTime(item, timeZone);
                return time.startsWith(pad2(hour));
              });
              const first = slotEvents[0];
              return (
                <button
                  key={`${isoDate}-${hour}`}
                  type="button"
                  className="calendar-slot"
                  onClick={() => (first ? onOpenEvent(first) : onSelectSlot(isoDate, hour))}
                  aria-label={
                    first
                      ? `${eventAccessibleName(first, timeZone)} em ${isoDate}`
                      : `${formatDayHeading(isoDate)} ${pad2(hour)}:00`
                  }
                >
                  {slotEvents.map((item) => (
                    <span
                      key={item.id || item.sourceIdentity}
                      className={item.kind === "REFERENCED" ? "calendar-chip is-referenced" : "calendar-chip"}
                    >
                      {item.title}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
    </CalendarTabPanel>
  );
}

export function CalendarDayView({
  anchorDate,
  timeZone,
  events,
  onOpenEvent,
  onSelectSlot,
}: {
  anchorDate: string;
  timeZone: string;
  events: CalendarEventRecord[];
  onOpenEvent: (event: CalendarEventRecord) => void;
  onSelectSlot: (isoDate: string, hour: number) => void;
}) {
  const hours = hoursInDay();
  const dayEvents = events.filter((item) => eventOverlapsDate(item, anchorDate, timeZone));
  return (
    <CalendarTabPanel view="day">
    <div className="calendar-day" data-node-id={FIGMA_CALENDAR_NODES.day}>
      <h2 className="calendar-day-heading">{formatDayHeading(anchorDate)}</h2>
      <div className="calendar-allday-cell">
        {dayEvents
          .filter((item) => item.allDay)
          .map((item) => (
            <button key={item.id || item.sourceIdentity} type="button" className="calendar-chip" onClick={() => onOpenEvent(item)}>
              {item.title}
            </button>
          ))}
      </div>
      <div className="calendar-day-scroll" tabIndex={0} aria-label="Grade do dia">
        {hours.map((hour) => {
          const slotEvents = dayEvents.filter((item) => !item.allDay && formatEventTime(item, timeZone).startsWith(pad2(hour)));
          const first = slotEvents[0];
          return (
            <button
              key={hour}
              type="button"
              className="calendar-day-slot"
              onClick={() => (first ? onOpenEvent(first) : onSelectSlot(anchorDate, hour))}
              aria-label={
                first
                  ? `${eventAccessibleName(first, timeZone)} em ${anchorDate}`
                  : `${formatDayHeading(anchorDate)} ${pad2(hour)}:00`
              }
            >
              <span className="calendar-time-gutter">{pad2(hour)}:00</span>
              <span className="calendar-day-slot-body">
                {slotEvents.map((item) => (
                  <span
                    key={item.id || item.sourceIdentity}
                    className={item.kind === "REFERENCED" ? "calendar-chip is-referenced" : "calendar-chip"}
                  >
                    {item.title}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
    </CalendarTabPanel>
  );
}

export function CalendarAgendaView({
  events,
  timeZone,
  onOpenEvent,
}: {
  events: CalendarEventRecord[];
  timeZone: string;
  onOpenEvent: (event: CalendarEventRecord) => void;
}) {
  const sorted = [...events].sort((a, b) => String(a.startsAt ?? a.allDayStartDate ?? "").localeCompare(String(b.startsAt ?? b.allDayStartDate ?? "")));
  return (
    <CalendarTabPanel view="agenda">
    <div className="calendar-agenda">
      {sorted.length === 0 ? (
        <p className="muted">Nenhum evento autorizado neste período.</p>
      ) : (
        <ol className="calendar-agenda-list">
          {sorted.map((item) => (
            <li key={item.id || item.sourceIdentity}>
              <button type="button" className="calendar-agenda-item" onClick={() => onOpenEvent(item)}>
                <strong>{item.title}</strong>
                <span>{formatEventTime(item, timeZone)}</span>
                <span>{item.kind === "REFERENCED" ? "Referenciado" : "Manual"}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
    </CalendarTabPanel>
  );
}
