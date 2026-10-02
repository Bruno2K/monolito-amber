"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Drawer } from "../ui";
import { api } from "../../lib/api";
import {
  calendarIdempotencyKey,
  datetimeLocalInput,
  FIGMA_CALENDAR_NODES,
  localDateTimeValue,
  referencedSourceHref,
  referenceTypeLabel,
  type CalendarEventRecord,
  type CalendarRecord,
} from "../../lib/calendar";
import { useInspectorEscape } from "../../lib/use-inspector-escape";
import { useShell } from "../session/ShellProvider";

export function CalendarEventEditor({
  open,
  calendar,
  event,
  draftDate,
  draftHour,
  readOnly,
  onClose,
  onChanged,
}: {
  open: boolean;
  calendar: CalendarRecord | null;
  event: CalendarEventRecord | null;
  draftDate: string | null;
  draftHour: number | null;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { state } = useShell();
  const creating = !event;
  const referenced = event?.kind === "REFERENCED";
  const locked = readOnly || referenced;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [allDayStart, setAllDayStart] = useState("");
  const [allDayEnd, setAllDayEnd] = useState("");
  const [linkedProjectId, setLinkedProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useInspectorEscape(open, () => onClose());

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setConfirmDelete(false);
    if (event) {
      setTitle(event.title);
      setDescription(event.description ?? "");
      setAllDay(event.allDay);
      setAllDayStart(event.allDayStartDate ?? draftDate ?? "");
      setAllDayEnd(event.allDayEndDate ?? event.allDayStartDate ?? draftDate ?? "");
      setLinkedProjectId(event.linkedProjectId ?? "");
      if (!event.allDay && event.startsAt) {
        const start = new Date(event.startsAt);
        const zone = event.timeZone || calendar?.timeZone || "UTC";
        const startParts = new Intl.DateTimeFormat("sv-SE", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(start);
        setStartLocal(startParts.replace(" ", "T"));
        if (event.endsAt) {
          const endParts = new Intl.DateTimeFormat("sv-SE", {
            timeZone: zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(new Date(event.endsAt));
          setEndLocal(endParts.replace(" ", "T"));
        } else {
          setEndLocal(startParts.replace(" ", "T"));
        }
      } else {
        const iso = draftDate ?? event.allDayStartDate ?? "";
        setStartLocal(datetimeLocalInput(iso, draftHour ?? 9, 0));
        setEndLocal(datetimeLocalInput(iso, (draftHour ?? 9) + 1, 0));
      }
      return;
    }
    const iso = draftDate ?? "";
    setTitle("");
    setDescription("");
    setAllDay(false);
    setLinkedProjectId("");
    setAllDayStart(iso);
    setAllDayEnd(iso);
    setStartLocal(datetimeLocalInput(iso, draftHour ?? 9, 0));
    setEndLocal(datetimeLocalInput(iso, (draftHour ?? 9) + 1, 0));
  }, [open, event, draftDate, draftHour, calendar?.timeZone]);

  const sourceHref = event ? referencedSourceHref(event) : null;

  async function onSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!calendar || locked) {
      return;
    }
    setBusy(true);
    setError(null);
    const timeZone = calendar.timeZone;
    const payload = allDay
      ? {
          title: title.trim(),
          description: description.trim(),
          allDay: true,
          allDayStartDate: allDayStart,
          allDayEndDate: allDayEnd || allDayStart,
          linkedProjectId: linkedProjectId || undefined,
        }
      : {
          title: title.trim(),
          description: description.trim(),
          allDay: false,
          timeZone,
          localStartsAt: localDateTimeValue(startLocal.slice(0, 10), Number(startLocal.slice(11, 13) || 0), Number(startLocal.slice(14, 16) || 0)),
          localEndsAt: localDateTimeValue(endLocal.slice(0, 10), Number(endLocal.slice(11, 13) || 0), Number(endLocal.slice(14, 16) || 0)),
          linkedProjectId: linkedProjectId || undefined,
        };
    const result = creating
      ? await api<CalendarEventRecord>(`/api/v1/calendars/${calendar.id}/events`, {
          method: "POST",
          headers: { "Idempotency-Key": calendarIdempotencyKey("cal-evt") },
          body: JSON.stringify({ kind: "MANUAL", ...payload }),
        })
      : await api<CalendarEventRecord>(`/api/v1/calendars/${calendar.id}/events/${event.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, expectedVersion: event.version }),
        });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem.detail || "Não foi possível salvar o evento manual.");
      return;
    }
    await onChanged();
    onClose();
  }

  async function onDelete() {
    if (!calendar || !event || locked) {
      return;
    }
    setBusy(true);
    const result = await api(`/api/v1/calendars/${calendar.id}/events/${event.id}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": calendarIdempotencyKey("cal-evt-del") },
      body: JSON.stringify({ expectedVersion: event.version }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem.detail || "Não foi possível excluir o evento.");
      return;
    }
    await onChanged();
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose}>
      <aside className="structure-inspector calendar-editor" data-node-id={FIGMA_CALENDAR_NODES.editor} role="dialog" aria-labelledby="calendar-event-title">
        <div className="inspector-header">
          <h2 id="calendar-event-title">{referenced ? "Evento referenciado" : creating ? "Criar evento" : "Editar evento"}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Fechar
          </button>
        </div>
        {referenced ? (
          <div className="calendar-referenced-note">
            <p>Este evento reflete a origem autorizada. O calendário não altera Tarefa, Entrega, Marco ou Gate.</p>
            {sourceHref ? (
              <p>
                <a className="btn secondary" href={sourceHref}>
                  Abrir {referenceTypeLabel(event?.referenceType)} de origem
                </a>
              </p>
            ) : (
              <p className="muted">Origem autorizada sem atalho de projeto.</p>
            )}
            <p>
              <strong>{event?.title}</strong>
            </p>
          </div>
        ) : (
          <form className="inspector-form" onSubmit={(formEvent) => void onSubmit(formEvent)}>
            <label>
              Título
              <input value={title} onChange={(item) => setTitle(item.target.value)} required disabled={locked} />
            </label>
            <label>
              Descrição
              <textarea value={description} onChange={(item) => setDescription(item.target.value)} disabled={locked} />
            </label>
            <label className="calendar-check">
              <input type="checkbox" checked={allDay} onChange={(item) => setAllDay(item.target.checked)} disabled={locked} />
              Evento de dia inteiro
            </label>
            {allDay ? (
              <>
                <label>
                  Início
                  <input type="date" value={allDayStart} onChange={(item) => setAllDayStart(item.target.value)} required disabled={locked} />
                </label>
                <label>
                  Fim
                  <input type="date" value={allDayEnd} onChange={(item) => setAllDayEnd(item.target.value)} disabled={locked} />
                </label>
              </>
            ) : (
              <>
                <label>
                  Início
                  <input type="datetime-local" value={startLocal} onChange={(item) => setStartLocal(item.target.value)} required disabled={locked} />
                </label>
                <label>
                  Fim
                  <input type="datetime-local" value={endLocal} onChange={(item) => setEndLocal(item.target.value)} disabled={locked} />
                </label>
              </>
            )}
            <label>
              Projeto vinculado (opcional, não concede acesso)
              <select value={linkedProjectId} onChange={(item) => setLinkedProjectId(item.target.value)} disabled={locked}>
                <option value="">Nenhum</option>
                {state.projects
                  .filter((row) => !row.archivedAt)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="muted">Evento de calendário. Pode vincular um projeto autorizado, mas não altera Tarefa, Entrega, Marco ou Gate.</p>
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
            <div className="inspector-actions">
              <button type="button" className="btn secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn" disabled={busy || locked || title.trim().length === 0}>
                {creating ? "Criar evento" : "Salvar"}
              </button>
            </div>
          </form>
        )}
        {!creating && !referenced && !readOnly ? (
          <div className="planner-confirm">
            {confirmDelete ? (
              <>
                <p>Excluir o evento manual não altera registros de projeto.</p>
                <div className="inspector-actions">
                  <button type="button" className="btn secondary" onClick={() => setConfirmDelete(false)}>
                    Manter evento
                  </button>
                  <button type="button" className="btn" onClick={() => void onDelete()} disabled={busy}>
                    Confirmar exclusão
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn secondary" onClick={() => setConfirmDelete(true)}>
                Excluir evento
              </button>
            )}
          </div>
        ) : null}
      </aside>
    </Drawer>
  );
}
