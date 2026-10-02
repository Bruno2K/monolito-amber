"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  canUpdateTask,
  dateInputToIso,
  formatPlanningDate,
  ganttBarOffset,
  isoDateInput,
  newIdempotencyKey,
  resolveGanttDateEdit,
  scheduleLaneKindLabel,
  scheduleRiskLabel,
  type PlanningSchedule,
  type PlanningScheduleLane,
} from "../../lib/planning";
import { PlanningEmpty } from "./PlanningStates";

function weekLabels(rangeStart: string, rangeEnd: string): Array<{ key: string; label: string; left: number; width: number }> {
  const start = Date.parse(rangeStart);
  const end = Date.parse(rangeEnd);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return [];
  }
  const span = end - start;
  const labels: Array<{ key: string; label: string; left: number; width: number }> = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() < end) {
    const chunkStart = cursor.getTime();
    const chunkEnd = Math.min(end, chunkStart + 7 * 86_400_000);
    const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
    labels.push({
      key: cursor.toISOString(),
      label: `${formatter.format(new Date(chunkStart))} – ${formatter.format(new Date(chunkEnd - 86_400_000))}`,
      left: ((chunkStart - start) / span) * 100,
      width: ((chunkEnd - chunkStart) / span) * 100,
    });
    cursor.setTime(chunkEnd);
  }
  return labels;
}

export function TaskGantt({
  projectId,
  schedule,
  selectedId,
  readOnly,
  permissions,
  filtered,
  onOpen,
  onChanged,
}: {
  projectId: string;
  schedule: PlanningSchedule;
  selectedId: string | null;
  readOnly: boolean;
  permissions: string[];
  filtered: boolean;
  onOpen: (taskId: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const canUpdate = canUpdateTask(permissions) && schedule.canEditTaskDates && !readOnly;
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shiftSuccessors, setShiftSuccessors] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editTaskId, setEditTaskId] = useState(selectedId ?? schedule.lanes.find((row) => row.kind === "TASK")?.id ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (selectedId && schedule.lanes.some((row) => row.kind === "TASK" && row.id === selectedId)) {
      setEditTaskId(selectedId);
    }
  }, [selectedId, schedule.lanes]);

  useEffect(() => {
    if (!focusId) {
      return;
    }
    document.getElementById(`gantt-dates-${focusId}`)?.focus();
    setFocusId(null);
  }, [focusId, schedule.lanes]);

  const weeks = useMemo(
    () => weekLabels(schedule.dateRange.start, schedule.dateRange.end),
    [schedule.dateRange.end, schedule.dateRange.start],
  );
  const timelineMinWidth = Math.max(720, weeks.length * 88);
  const taskById = useMemo(() => {
    const map = new Map<string, PlanningScheduleLane>();
    for (const lane of schedule.lanes) {
      if (lane.kind === "TASK") {
        map.set(lane.id, lane);
      }
    }
    return map;
  }, [schedule.lanes]);

  function announce(message: string) {
    setAnnouncement(message);
  }

  async function saveTaskDates(lane: PlanningScheduleLane, plannedStartAt: string, dueDate: string, propagate: boolean) {
    const intent = resolveGanttDateEdit({ kind: lane.kind, shiftSuccessors: propagate, propagate });
    if (intent.kind === "reject") {
      setError(intent.message);
      announce(intent.message);
      return;
    }
    if (!canUpdate) {
      setError("Editar datas requer task.update.");
      return;
    }
    if (lane.version == null) {
      setError("Versão da tarefa ausente — recarregue o cronograma.");
      return;
    }
    setSavingId(lane.id);
    setError(null);
    const result = await api(`/api/v1/projects/${projectId}/tasks/${lane.id}`, {
      method: "PATCH",
      headers: { "Idempotency-Key": newIdempotencyKey("gantt-date") },
      body: JSON.stringify({
        plannedStartAt: dateInputToIso(plannedStartAt) ?? null,
        dueDate: dateInputToIso(dueDate) ?? null,
        expectedVersion: lane.version,
      }),
    });
    setSavingId(null);
    if (!result.ok) {
      setError(result.problem.detail || "Não foi possível atualizar as datas.");
      announce(result.problem.detail || "Conflito ao salvar datas.");
      return;
    }
    announce(`Datas de ${lane.title} atualizadas. Sucessores e pais não foram deslocados.`);
    setFocusId(lane.id);
    await onChanged();
  }

  function scrollToToday() {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const start = Date.parse(schedule.dateRange.start);
    const end = Date.parse(schedule.dateRange.end);
    const today = Date.now();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, (today - start) / (end - start)));
    node.scrollLeft = Math.max(0, ratio * (node.scrollWidth - node.clientWidth) - 80);
    announce("Escala alinhada a hoje. Isto não altera datas.");
  }

  if (schedule.lanes.length === 0) {
    return <PlanningEmpty filtered={filtered} />;
  }

  return (
    <div className="gantt-shell" data-surface="gantt" data-node-id="242:6744">
      <p className="gantt-derived-note">
        Cronograma é projeção das mesmas Tarefas, Fases, Entregas, Pacotes e Marcos. Arrastar ou editar datas da
        Tarefa atualiza o objeto de origem — não cria outro cronograma e não desloca sucessores.
      </p>
      {error ? (
        <p className="gantt-alert" role="alert">
          {error}
        </p>
      ) : (
        <p className="gantt-status" role="status" aria-live="polite">
          {announcement}
        </p>
      )}
      <div className="gantt-toolbar">
        <button type="button" className="btn secondary" onClick={scrollToToday}>
          Hoje
        </button>
        <span className="muted">
          {new Date(schedule.dateRange.start).toISOString().slice(0, 10)} →{" "}
          {new Date(schedule.dateRange.end).toISOString().slice(0, 10)}
          {schedule.truncated ? ` · limitado a ${schedule.take} registros` : ""}
        </span>
      </div>
      {canUpdate ? (
        <form
          className="gantt-edit-actions"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const chosen = String(data.get("taskId") ?? editTaskId);
            const chosenLane = schedule.lanes.find((row) => row.kind === "TASK" && row.id === chosen);
            if (!chosenLane) {
              setError("Selecione uma tarefa autorizada.");
              return;
            }
            void saveTaskDates(
              chosenLane,
              String(data.get(`start-${chosen}`) ?? ""),
              String(data.get(`due-${chosen}`) ?? ""),
              shiftSuccessors,
            );
          }}
        >
          <label>
            <span className="sr-only">Tarefa a editar</span>
            <select
              name="taskId"
              aria-label="Tarefa cujas datas serão salvas"
              value={editTaskId}
              onChange={(event) => setEditTaskId(event.target.value)}
            >
              {schedule.lanes
                .filter((row) => row.kind === "TASK")
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
            </select>
          </label>
          {schedule.lanes
            .filter((row) => row.kind === "TASK" && row.id === editTaskId)
            .map((lane) => (
              <span key={`${lane.id}-${lane.version ?? 0}-${lane.start ?? ""}-${lane.end ?? ""}`} className="gantt-date-fields">
                <label>
                  <span className="sr-only">Início planejado de {lane.title}</span>
                  <input
                    id={`gantt-dates-${lane.id}`}
                    name={`start-${lane.id}`}
                    type="date"
                    defaultValue={isoDateInput(lane.start)}
                    disabled={savingId === lane.id}
                  />
                </label>
                <label>
                  <span className="sr-only">Prazo de {lane.title}</span>
                  <input
                    name={`due-${lane.id}`}
                    type="date"
                    defaultValue={isoDateInput(lane.end)}
                    disabled={savingId === lane.id}
                  />
                </label>
              </span>
            ))}
          <label className="gantt-shift">
            <input
              type="checkbox"
              checked={shiftSuccessors}
              onChange={(event) => setShiftSuccessors(event.target.checked)}
            />
            Também deslocar sucessores
          </label>
          <button type="submit" className="btn" disabled={Boolean(savingId)}>
            Salvar datas da tarefa
          </button>
        </form>
      ) : (
        <p className="muted">Edição de datas desabilitada — requer task.update e projeto ativo.</p>
      )}
      <div className="gantt-board-scroll" ref={scrollRef}>
        <div
          className="gantt-board"
          role="region"
          aria-label="Cronograma Gantt"
          style={{ minWidth: 280 + timelineMinWidth }}
        >
          <div className="gantt-hierarchy">
            <div className="gantt-hierarchy-head">Hierarquia</div>
            {schedule.lanes.map((lane) => {
              const active = lane.kind === "TASK" && lane.id === selectedId;
              return (
                <div
                  key={`${lane.kind}-${lane.id}`}
                  className={`gantt-hierarchy-row${active ? " is-active" : ""}`}
                  style={{ paddingLeft: 12 + lane.depth * 16 }}
                  data-lane-kind={lane.kind}
                  data-source-id={lane.sourceId}
                  data-domain={lane.domain}
                >
                  <span className="gantt-kind">{scheduleLaneKindLabel(lane.kind)}</span>
                  {lane.kind === "TASK" ? (
                    <button
                      type="button"
                      className="gantt-title-btn"
                      onClick={() => onOpen(lane.id)}
                      aria-expanded={active}
                    >
                      {lane.title}
                    </button>
                  ) : (
                    <span className="gantt-title">{lane.code ? `${lane.code} · ${lane.title}` : lane.title}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="gantt-timeline" style={{ minWidth: timelineMinWidth }}>
            <div className="gantt-scale" aria-hidden="true">
              {weeks.map((week) => (
                <span key={week.key} className="gantt-scale-cell" style={{ left: `${week.left}%`, width: `${week.width}%` }}>
                  {week.label}
                </span>
              ))}
            </div>
            <div className="gantt-rows">
              {schedule.lanes.map((lane) => {
                const bar = ganttBarOffset({
                  start: lane.start,
                  end: lane.end,
                  rangeStart: schedule.dateRange.start,
                  rangeEnd: schedule.dateRange.end,
                });
                const risk = scheduleRiskLabel(lane);
                const name = `${scheduleLaneKindLabel(lane.kind)} ${lane.title}${risk ? `. ${risk}` : ""}`;
                return (
                  <div
                    key={`bar-${lane.kind}-${lane.id}`}
                    className="gantt-row"
                    data-lane-kind={lane.kind}
                    data-source-id={lane.sourceId}
                  >
                    {bar ? (
                      lane.kind === "MILESTONE" ? (
                        <button
                          type="button"
                          className="gantt-diamond"
                          style={{ left: `${bar.left}%` }}
                          aria-label={name}
                          title={risk || lane.title}
                        >
                          <span aria-hidden="true">◆</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`gantt-bar gantt-bar-${lane.kind.toLowerCase()}${lane.late ? " is-late" : ""}`}
                          style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                          aria-label={name}
                          draggable={lane.kind === "TASK" && canUpdate && !reduceMotion}
                          onClick={() => {
                            if (lane.kind === "TASK") {
                              onOpen(lane.id);
                            }
                          }}
                          onDragStart={(event) => {
                            if (lane.kind !== "TASK") {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.setData("text/plain", lane.id);
                          }}
                          onDragEnd={() => {
                            if (shiftSuccessors) {
                              const rejected = resolveGanttDateEdit({ kind: "TASK", shiftSuccessors: true });
                              if (rejected.kind === "reject") {
                                setError(rejected.message);
                                announce(rejected.message);
                              }
                            }
                          }}
                        >
                          <time dateTime={lane.start ?? undefined}>{formatPlanningDate(lane.start)}</time>
                          <span aria-hidden="true">–</span>
                          <time dateTime={lane.end ?? undefined}>{formatPlanningDate(lane.end)}</time>
                        </button>
                      )
                    ) : (
                      <span className="gantt-undated">Sem datas</span>
                    )}
                    {risk ? <span className="gantt-row-risk">{risk}</span> : null}
                  </div>
                );
              })}
              <svg className="gantt-links" aria-hidden="true">
                {schedule.links.map((link) => {
                  const pred = taskById.get(link.predecessorTaskId);
                  const succ = taskById.get(link.successorTaskId);
                  if (!pred || !succ) {
                    return null;
                  }
                  const predBar = ganttBarOffset({
                    start: pred.start,
                    end: pred.end,
                    rangeStart: schedule.dateRange.start,
                    rangeEnd: schedule.dateRange.end,
                  });
                  const succBar = ganttBarOffset({
                    start: succ.start,
                    end: succ.end,
                    rangeStart: schedule.dateRange.start,
                    rangeEnd: schedule.dateRange.end,
                  });
                  if (!predBar || !succBar) {
                    return null;
                  }
                  const predIndex = schedule.lanes.findIndex((lane) => lane.kind === "TASK" && lane.id === pred.id);
                  const succIndex = schedule.lanes.findIndex((lane) => lane.kind === "TASK" && lane.id === succ.id);
                  if (predIndex < 0 || succIndex < 0) {
                    return null;
                  }
                  const y1 = 40 + predIndex * 40 + 16;
                  const y2 = 40 + succIndex * 40 + 16;
                  const x1 = predBar.left + predBar.width;
                  const x2 = succBar.left;
                  return (
                    <line
                      key={link.id}
                      x1={`${x1}%`}
                      y1={y1}
                      x2={`${x2}%`}
                      y2={y2}
                      className="gantt-link"
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
      <ul className="gantt-legend">
        <li>Crítico — bloqueio explícito (estado Bloqueada)</li>
        <li>Em risco — atraso derivado ou predecessor incompleto (não é Bloqueada)</li>
        <li>Arrastar datas atualiza só a Tarefa de origem</li>
      </ul>
      <div className="gantt-table-wrap">
        <table className="deliverables-table gantt-table">
          <caption>Tabela de datas do cronograma — alternativa ao arraste</caption>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Registro</th>
              <th scope="col">Início</th>
              <th scope="col">Término</th>
              <th scope="col">Risco / bloqueio</th>
            </tr>
          </thead>
          <tbody>
            {schedule.lanes.map((lane) => (
              <tr key={`table-${lane.kind}-${lane.id}-${lane.version ?? "0"}-${lane.start ?? ""}-${lane.end ?? ""}`} data-lane-kind={lane.kind} data-source-id={lane.sourceId}>
                <td>{scheduleLaneKindLabel(lane.kind)}</td>
                <td>
                  <strong>{lane.title}</strong>
                  <span className="gantt-domain">{lane.domain}</span>
                </td>
                <td>
                  <time dateTime={lane.start ?? undefined}>{formatPlanningDate(lane.start)}</time>
                </td>
                <td>
                  <time dateTime={lane.end ?? undefined}>{formatPlanningDate(lane.end)}</time>
                </td>
                <td>{scheduleRiskLabel(lane) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
