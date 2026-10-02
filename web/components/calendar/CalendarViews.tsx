import {
  CALENDAR_VIEWS,
  eventAccessibleName,
  eventOverlapsDate,
  FIGMA_CALENDAR_NODES,
  formatDayHeading,
  formatEventTime,
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
      {CALENDAR_VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`calendar-tab-${item.id}`}
          aria-selected={view === item.id}
          aria-controls={`calendar-panel-${item.id}`}
          className={view === item.id ? "planner-tab is-active" : "planner-tab"}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
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
  return (
    <div
      className="calendar-month"
      data-node-id={FIGMA_CALENDAR_NODES.month}
      role="grid"
      aria-labelledby="calendar-tab-month"
      id="calendar-panel-month"
    >
      <div className="calendar-weekdays" role="row">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} role="columnheader" className="calendar-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="calendar-month-grid">
        {days.map((isoDate) => {
          const inMonth = isoDate.startsWith(monthPrefix);
          const dayEvents = events.filter((item) => eventOverlapsDate(item, isoDate, timeZone));
          return (
            <div key={isoDate} className={inMonth ? "calendar-day-cell" : "calendar-day-cell is-outside"} role="gridcell">
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
                      <span className="sr-only">{eventAccessibleName(item, timeZone)} em {isoDate}</span>
                      <span aria-hidden="true">
                        {formatEventTime(item, timeZone)} {item.title}
                      </span>
                    </button>
                  </li>
                ))}
                {dayEvents.length > 3 ? <li className="calendar-more">+{dayEvents.length - 3}</li> : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
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
    <div className="calendar-week" data-node-id={FIGMA_CALENDAR_NODES.week} id="calendar-panel-week" role="grid" aria-labelledby="calendar-tab-week">
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
      <div className="calendar-week-scroll">
        <div className="calendar-week-head" role="row">
          <div className="calendar-time-gutter" />
          {days.map((isoDate) => (
            <div key={isoDate} role="columnheader" className="calendar-week-day">
              {formatDayHeading(isoDate)}
            </div>
          ))}
        </div>
        {hours.map((hour) => (
          <div key={hour} className="calendar-week-row" role="row">
            <div className="calendar-time-gutter">{pad2(hour)}:00</div>
            {days.map((isoDate) => {
              const slotEvents = events.filter((item) => {
                if (item.allDay || !eventOverlapsDate(item, isoDate, timeZone)) {
                  return false;
                }
                const time = formatEventTime(item, timeZone);
                return time.startsWith(pad2(hour));
              });
              return (
                <button
                  key={`${isoDate}-${hour}`}
                  type="button"
                  className="calendar-slot"
                  onClick={() => onSelectSlot(isoDate, hour)}
                  aria-label={`${formatDayHeading(isoDate)} ${pad2(hour)}:00`}
                >
                  {slotEvents.map((item) => (
                    <span
                      key={item.id || item.sourceIdentity}
                      className={item.kind === "REFERENCED" ? "calendar-chip is-referenced" : "calendar-chip"}
                      onClick={(click) => {
                        click.stopPropagation();
                        onOpenEvent(item);
                      }}
                      role="presentation"
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
    <div className="calendar-day" data-node-id={FIGMA_CALENDAR_NODES.day} id="calendar-panel-day">
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
      <div className="calendar-day-scroll">
        {hours.map((hour) => {
          const slotEvents = dayEvents.filter((item) => !item.allDay && formatEventTime(item, timeZone).startsWith(pad2(hour)));
          return (
            <button
              key={hour}
              type="button"
              className="calendar-day-slot"
              onClick={() => onSelectSlot(anchorDate, hour)}
              aria-label={`${formatDayHeading(anchorDate)} ${pad2(hour)}:00`}
            >
              <span className="calendar-time-gutter">{pad2(hour)}:00</span>
              <span className="calendar-day-slot-body">
                {slotEvents.map((item) => (
                  <span
                    key={item.id || item.sourceIdentity}
                    className={item.kind === "REFERENCED" ? "calendar-chip is-referenced" : "calendar-chip"}
                    onClick={(click) => {
                      click.stopPropagation();
                      onOpenEvent(item);
                    }}
                    role="presentation"
                  >
                    <span className="sr-only">{eventAccessibleName(item, timeZone)}</span>
                    <span aria-hidden="true">{item.title}</span>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
    <div className="calendar-agenda" id="calendar-panel-agenda" aria-labelledby="calendar-tab-agenda">
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
  );
}
