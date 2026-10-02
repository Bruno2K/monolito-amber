"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  KANBAN_COLUMNS,
  canCompleteTask,
  canUpdateTask,
  compactTaskId,
  contextLabel,
  formatPlanningDate,
  kanbanColumnLabel,
  kanbanRiskExplanation,
  newIdempotencyKey,
  resolveKanbanColumnMove,
  type KanbanColumn,
  type PlanningTaskRow,
} from "../../lib/planning";
import { PlanningEmpty } from "./PlanningStates";

export function TaskKanban({
  projectId,
  tasks,
  columnCounts,
  selectedId,
  readOnly,
  permissions,
  filtered,
  onOpen,
  onChanged,
}: {
  projectId: string;
  tasks: PlanningTaskRow[];
  columnCounts: Record<KanbanColumn, number>;
  selectedId: string | null;
  readOnly: boolean;
  permissions: string[];
  filtered: boolean;
  onOpen: (taskId: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const canUpdate = canUpdateTask(permissions);
  const canComplete = canCompleteTask(permissions);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [blockPrompt, setBlockPrompt] = useState<{ task: PlanningTaskRow; reason: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusId) {
      return;
    }
    document.getElementById(`kanban-card-${focusId}`)?.focus();
    setFocusId(null);
  }, [focusId, tasks]);

  const boardTasks = tasks.filter((row) => row.kanbanColumn);
  const byColumn: Record<KanbanColumn, PlanningTaskRow[]> = {
    PLANEJADAS: [],
    EM_ANDAMENTO: [],
    EM_RISCO: [],
    BLOQUEADAS: [],
  };
  for (const row of boardTasks) {
    if (row.kanbanColumn) {
      byColumn[row.kanbanColumn].push(row);
    }
  }

  function announce(message: string) {
    setAnnouncement(message);
    if (liveRef.current) {
      liveRef.current.textContent = message;
    }
  }

  async function runLifecycle(task: PlanningTaskRow, command: "start" | "block" | "unblock" | "complete", blockedReason?: string) {
    if (readOnly) {
      setError("Projeto arquivado — mutações recusadas.");
      announce("Movimento recusado: projeto em somente leitura.");
      return;
    }
    const permissionOk = command === "complete" ? canComplete : canUpdate;
    if (!permissionOk) {
      const message = command === "complete" ? "Concluir requer task.complete." : "Mover cartão requer task.update.";
      setError(message);
      announce(message);
      return;
    }
    setMovingId(task.id);
    setError(null);
    const body: Record<string, unknown> = { expectedVersion: task.version };
    if (command === "block") {
      body.blockedReason = blockedReason;
    }
    const result = await api<PlanningTaskRow>(`/api/v1/projects/${projectId}/tasks/${task.id}/${command}`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey(`kanban-${command}`) },
      body: JSON.stringify(body),
    });
    setMovingId(null);
    if (!result.ok) {
      const blockers = result.problem.blockers
        ?.map((item) => item.title || item.message)
        .filter(Boolean)
        .join("; ");
      const detail = blockers ? `${result.problem.detail} ${blockers}` : result.problem.detail;
      setError(detail);
      announce(`Movimento recusado. ${detail}`);
      setFocusId(task.id);
      return;
    }
    announce(`${task.title} atualizada pelo comando ${command}.`);
    setFocusId(task.id);
    await onChanged();
  }

  async function applyColumnMove(task: PlanningTaskRow, to: KanbanColumn) {
    const intent = resolveKanbanColumnMove({
      status: task.status,
      late: task.late,
      kanbanColumn: task.kanbanColumn,
      to,
    });
    if (intent.kind === "noop") {
      announce(intent.message);
      setFocusId(task.id);
      return;
    }
    if (intent.kind === "reject") {
      setError(intent.message);
      announce(`Movimento recusado. ${intent.message}`);
      setFocusId(task.id);
      return;
    }
    if (intent.command === "block") {
      setBlockPrompt({ task, reason: task.blockedReason ?? "" });
      return;
    }
    await runLifecycle(task, intent.command);
  }

  if (tasks.length === 0) {
    return <PlanningEmpty filtered={filtered} />;
  }

  return (
    <div className="kanban-shell" data-node-id="242:6635">
      <p className="table-count" aria-live="polite">
        {columnCounts.PLANEJADAS + columnCounts.EM_ANDAMENTO + columnCounts.EM_RISCO + columnCounts.BLOQUEADAS} no
        quadro
        {columnCounts.EM_RISCO > 0
          ? ` · ${columnCounts.EM_RISCO} em risco (derivado)`
          : ""}
        {tasks.length > boardTasks.length
          ? ` · ${tasks.length - boardTasks.length} concluída(s)/cancelada(s) sem coluna`
          : ""}
      </p>
      <p className="kanban-derived-note" role="note">
        EM RISCO é atraso derivado sobre A fazer ou Em andamento — não é um estado armazenado. Cartões concluídos ou
        cancelados não entram no quadro.
      </p>
      <div ref={liveRef} className="sr-only" aria-live="polite">
        {announcement}
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}

      {blockPrompt ? (
        <div className="kanban-block-prompt" role="dialog" aria-modal="true" aria-labelledby="kanban-block-title">
          <h3 id="kanban-block-title">Bloquear {blockPrompt.task.title}</h3>
          <p>O comando é o mesmo do inspetor. Motivo obrigatório.</p>
          <label htmlFor="kanban-block-reason">
            Motivo do bloqueio
            <input
              id="kanban-block-reason"
              value={blockPrompt.reason}
              onChange={(event) => setBlockPrompt({ ...blockPrompt, reason: event.target.value })}
              autoFocus
            />
          </label>
          <div className="inspector-actions">
            <button
              type="button"
              className="btn"
              disabled={movingId === blockPrompt.task.id}
              onClick={() => {
                const reason = blockPrompt.reason.trim();
                const task = blockPrompt.task;
                setBlockPrompt(null);
                if (!reason) {
                  setError("BLOCKED exige um motivo.");
                  announce("Movimento recusado. Bloqueio exige motivo.");
                  setFocusId(task.id);
                  return;
                }
                void runLifecycle(task, "block", reason);
              }}
            >
              Confirmar bloqueio
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                const id = blockPrompt.task.id;
                setBlockPrompt(null);
                announce("Bloqueio cancelado. Cartão permanece na coluna original.");
                setFocusId(id);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {boardTasks.length === 0 ? (
        <section className="state-screen" data-state="kanban-empty" aria-live="polite">
          <h2>Nenhuma tarefa no quadro</h2>
          <p>Concluídas e canceladas não têm coluna Kanban. Ajuste os filtros ou veja a Lista.</p>
        </section>
      ) : (
        <div className="kanban-board-scroll">
          <div className="kanban-board" role="region" aria-label="Quadro Kanban">
            {KANBAN_COLUMNS.map((column) => (
              <section
                key={column}
                className={`kanban-column${column === "EM_RISCO" ? " is-derived" : ""}`}
                data-kanban-column={column}
                aria-labelledby={`kanban-col-${column}`}
                onDragOver={(event) => {
                  if (readOnly || !canUpdate) {
                    return;
                  }
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const taskId = event.dataTransfer.getData("text/plain");
                  const task = tasks.find((row) => row.id === taskId);
                  if (!task) {
                    return;
                  }
                  void applyColumnMove(task, column);
                }}
              >
                <header className="kanban-column-header">
                  <h2 id={`kanban-col-${column}`}>{kanbanColumnLabel(column).toUpperCase()}</h2>
                  <span aria-label={`${columnCounts[column]} autorizadas`}>{columnCounts[column]}</span>
                </header>
                <ul className="kanban-card-list">
                  {byColumn[column].map((row) => {
                    const active = row.id === selectedId;
                    const risk = kanbanRiskExplanation(row);
                    return (
                      <li key={row.id}>
                        <article
                          id={`kanban-card-${row.id}`}
                          className={`kanban-card${active ? " is-active" : ""}`}
                          data-task-id={row.id}
                          data-kanban-column={row.kanbanColumn ?? ""}
                          tabIndex={0}
                          draggable={!readOnly && canUpdate && movingId !== row.id}
                          aria-grabbed={movingId === row.id}
                          aria-busy={movingId === row.id}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", row.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onOpen(row.id);
                            }
                          }}
                        >
                          <button type="button" className="kanban-card-open" onClick={() => onOpen(row.id)}>
                            <span className="kanban-card-id">{compactTaskId(row.id)}</span>
                            <strong>{row.title}</strong>
                          </button>
                          <p className="kanban-card-meta">
                            {contextLabel(row)}
                            {row.previews.assignee?.displayName ? ` · ${row.previews.assignee.displayName}` : ""}
                            {` · ${formatPlanningDate(row.dueDate)}`}
                          </p>
                          <div className="kanban-card-chips">
                            <span className="status-pill">Tarefa</span>
                            {row.previews.issue ? (
                              <span className="planner-issue-rel">Issue relacionada: {row.previews.issue.title}</span>
                            ) : null}
                            {row.late ? <span className="planner-late">Atrasada</span> : null}
                            {row.dependencyStartBlocked && row.status !== "BLOCKED" ? (
                              <span className="planner-dep-wait">Aguardando predecessor</span>
                            ) : null}
                            {row.status === "BLOCKED" ? (
                              <span className={`status-pill status-${row.status.toLowerCase()}`}>Bloqueada</span>
                            ) : null}
                          </div>
                          {risk ? <p className="kanban-card-risk">{risk}</p> : null}
                          <label className="kanban-move">
                            Mover {row.title}
                            <select
                              aria-label={`Mover ${row.title}`}
                              disabled={readOnly || !canUpdate || movingId === row.id}
                              value=""
                              onChange={(event) => {
                                const value = event.target.value;
                                event.target.value = "";
                                if (!value) {
                                  return;
                                }
                                if (value === "__complete") {
                                  void runLifecycle(row, "complete");
                                  return;
                                }
                                void applyColumnMove(row, value as KanbanColumn);
                              }}
                            >
                              <option value="">Mover para…</option>
                              {KANBAN_COLUMNS.filter((item) => item !== row.kanbanColumn).map((item) => (
                                <option key={item} value={item}>
                                  {kanbanColumnLabel(item)}
                                  {item === "EM_RISCO" ? " (derivado — recusado)" : ""}
                                </option>
                              ))}
                              {canComplete && row.status === "IN_PROGRESS" ? (
                                <option value="__complete">Concluir (sai do quadro)</option>
                              ) : null}
                            </select>
                          </label>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
