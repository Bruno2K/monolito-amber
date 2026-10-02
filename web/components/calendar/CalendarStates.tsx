import { calendarStateCopy, FIGMA_CALENDAR_NODES, type CalendarSurfaceState } from "../../lib/calendar";

export function CalendarStates({
  state,
  detail,
  onRetry,
  action,
}: {
  state: Exclude<CalendarSurfaceState, "ready">;
  detail?: string;
  onRetry?: () => void;
  action?: { href: string; label: string };
}) {
  const copy = calendarStateCopy(state);
  return (
    <section
      className="state-screen calendar-state"
      data-state={state}
      data-node-id={FIGMA_CALENDAR_NODES.states}
      aria-live={state === "loading" ? "polite" : "assertive"}
      aria-busy={state === "loading" ? true : undefined}
    >
      {state === "loading" ? <div className="calendar-skel" aria-hidden="true" /> : null}
      <h1>{copy.title}</h1>
      <p>{detail ?? copy.detail}</p>
      {onRetry ? (
        <p>
          <button type="button" className="btn" onClick={onRetry}>
            Tentar novamente
          </button>
        </p>
      ) : null}
      {action ? (
        <p>
          <a className="btn" href={action.href}>
            {action.label}
          </a>
        </p>
      ) : null}
    </section>
  );
}
