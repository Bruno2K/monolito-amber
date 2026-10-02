"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import {
  canAchieveMilestone,
  canCreateMilestone,
  canUpdateMilestone,
  dateInputToIso,
  formatPlanningDate,
  isoDateInput,
  milestoneKpis,
  milestoneRiskExplanation,
  milestoneStatusLabel,
  newIdempotencyKey,
  type PlanningMilestoneRow,
  type PlanningReadModel,
  type PlanningScheduleLane,
} from "../../lib/planning";
import { type PhaseRow } from "../../lib/operations";
import { PlanningEmpty } from "./PlanningStates";

export function MilestoneBoard({
  projectId,
  model,
  phases,
  selectedId,
  creating,
  readOnly,
  permissions,
  filtered,
  onSelect,
  onCreatingChange,
  onChanged,
}: {
  projectId: string;
  model: PlanningReadModel;
  phases: PhaseRow[];
  selectedId: string | null;
  creating: boolean;
  readOnly: boolean;
  permissions: string[];
  filtered: boolean;
  onSelect: (milestoneId: string | null) => void;
  onCreatingChange: (value: boolean) => void;
  onChanged: (milestoneId?: string | null) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const kpis = useMemo(() => milestoneKpis(model.milestones), [model.milestones]);
  const lanes = (model.schedule?.lanes ?? []).filter((lane) => lane.kind === "MILESTONE");
  const visible = model.milestones.filter((row) => {
    if (query.trim() && !row.title.toLowerCase().includes(query.trim().toLowerCase())) {
      return false;
    }
    if (statusFilter && row.status !== statusFilter) {
      return false;
    }
    return true;
  });
  const selected = model.milestones.find((row) => row.id === selectedId) ?? null;
  const canCreate = !readOnly && canCreateMilestone(permissions);
  const locallyFiltered = Boolean(query.trim() || statusFilter) || filtered;

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) {
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFormError(null);
    const result = await api<PlanningMilestoneRow>(`/api/v1/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey("ms-create") },
      body: JSON.stringify({
        title: String(form.get("title") ?? "").trim(),
        targetDate: dateInputToIso(String(form.get("targetDate") ?? "")),
        phaseId: String(form.get("phaseId") || "") || undefined,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.problem.detail ?? "Não foi possível criar o marco.");
      return;
    }
    onCreatingChange(false);
    await onChanged(result.body.id);
  }

  return (
    <div className="milestone-board" data-surface="milestones">
      <p className="gantt-derived-note">
        ACHIEVED e CANCELLED são comandos explícitos. AT_RISK e MISSED são derivados na leitura e não são
        controles de status.
      </p>

      <div className="milestone-kpis" aria-label="Indicadores de marcos">
        <article className="hub-card">
          <h2>Próximo marco</h2>
          <p className="milestone-kpi-value">{kpis.next ? formatPlanningDate(kpis.next.targetDate) : "—"}</p>
          <p className="muted">{kpis.next?.title ?? "Nenhum marco planejado com data futura."}</p>
        </article>
        <article className="hub-card">
          <h2>Concluídos</h2>
          <p className="milestone-kpi-value">
            {kpis.achieved}/{kpis.total}
          </p>
          <p className="muted">{Math.round(kpis.ratio * 100)}% alcançados por comando explícito.</p>
        </article>
        <article className="hub-card">
          <h2>Em risco</h2>
          <p className="milestone-kpi-value">{kpis.atRisk}</p>
          <p className="muted">Derivado de tarefas atrasadas, bloqueadas ou com predecessor incompleto.</p>
        </article>
        <article className="hub-card">
          <h2>Perdidos</h2>
          <p className="milestone-kpi-value">{kpis.missed}</p>
          <p className="muted">Data-alvo no passado. O status armazenado permanece Planejado.</p>
        </article>
      </div>

      <div className="deliverables-toolbar" role="search">
        <label className="sr-only" htmlFor="milestone-search">
          Buscar marcos
        </label>
        <input
          id="milestone-search"
          className="deliverables-search"
          placeholder="Buscar marcos..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label>
          <span className="sr-only">Estado derivado</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar por estado derivado"
          >
            <option value="">Estado derivado</option>
            <option value="PLANNED">Planejado</option>
            <option value="AT_RISK">Em risco</option>
            <option value="MISSED">Perdido</option>
            <option value="ACHIEVED">Concluído</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={!canCreate}
          aria-disabled={!canCreate ? "true" : undefined}
          title={readOnly ? "Projeto arquivado — mutações recusadas" : canCreate ? "Criar marco" : "Criar marco requer milestone.create"}
          onClick={() => {
            if (!canCreate) {
              return;
            }
            onCreatingChange(true);
            onSelect(null);
          }}
        >
          Novo Marco
        </button>
      </div>

      {lanes.length > 0 ? (
        <section className="milestone-timeline" aria-label="Linha do tempo de marcos">
          <h2>Linha do tempo</h2>
          <p className="muted">Mesmo modelo autorizado de cronograma do Gantt. Diamantes não editam datas aqui.</p>
          <ol className="milestone-timeline-list">
            {lanes.map((lane) => (
              <li key={lane.id}>
                <button
                  type="button"
                  className={`milestone-diamond-btn${lane.id === selectedId ? " is-active" : ""}`}
                  data-lane-kind="MILESTONE"
                  data-domain={lane.domain}
                  data-source-id={lane.sourceId}
                  onClick={() => onSelect(lane.id)}
                >
                  <span className="gantt-diamond" aria-hidden="true" />
                  <span>
                    <strong>{lane.title}</strong>
                    <span className="muted">
                      {" "}
                      {formatPlanningDate(lane.end)} · {milestoneStatusLabel(lane.status ?? "PLANNED")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {visible.length === 0 && !creating && !selected ? (
        <PlanningEmpty filtered={locallyFiltered} entity="marco" />
      ) : (
        <div className={`deliverables-layout${selected || creating ? " has-inspector" : ""}`}>
          {visible.length === 0 ? (
            <PlanningEmpty filtered={locallyFiltered} entity="marco" />
          ) : (
            <div className="deliverables-table-wrap">
              <table className="deliverables-table planner-table">
                <caption className="sr-only">Lista de marcos do projeto</caption>
                <thead>
                  <tr>
                    <th scope="col">Marco</th>
                    <th scope="col">Data-alvo</th>
                    <th scope="col">Armazenado</th>
                    <th scope="col">Derivado</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const active = row.id === selectedId;
                    return (
                      <tr key={row.id} className={active ? "is-active" : undefined}>
                        <td>
                          <button
                            type="button"
                            className="deliverable-link"
                            onClick={() => onSelect(row.id)}
                            aria-expanded={active}
                          >
                            <strong>{row.title}</strong>
                          </button>
                        </td>
                        <td>
                          <time dateTime={row.targetDate ?? undefined}>{formatPlanningDate(row.targetDate)}</time>
                        </td>
                        <td>
                          <span className={`status-pill status-${row.recordedStatus.toLowerCase()}`}>
                            {milestoneStatusLabel(row.recordedStatus)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`status-pill status-${row.status.toLowerCase()}`}
                            title={milestoneRiskExplanation(row)}
                          >
                            {milestoneStatusLabel(row.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {creating || selected ? (
            <div className="structure-overlay deliverables-inspector-shell" role="presentation">
              <button
                type="button"
                className="structure-backdrop"
                aria-label="Fechar inspetor de marco"
                onClick={() => {
                  onCreatingChange(false);
                  onSelect(null);
                }}
              />
              {creating ? (
                <aside className="structure-inspector" role="dialog" aria-labelledby="milestone-create-title">
                  <header className="inspector-header">
                    <h2 id="milestone-create-title">Novo marco</h2>
                    <button type="button" className="btn secondary" onClick={() => onCreatingChange(false)}>
                      Fechar
                    </button>
                  </header>
                  <form className="inspector-form" onSubmit={(event) => void createMilestone(event)}>
                    <label htmlFor="ms-title">
                      Título
                      <input id="ms-title" name="title" required />
                    </label>
                    <label htmlFor="ms-date">
                      Data-alvo
                      <input id="ms-date" name="targetDate" type="date" />
                    </label>
                    <label htmlFor="ms-phase">
                      Fase (mesmo projeto)
                      <select id="ms-phase" name="phaseId">
                        <option value="">—</option>
                        {phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="muted">Issue permanece uma relação fora da posse do Marco.</p>
                    {formError ? (
                      <p className="planner-confirm" role="alert">
                        {formError}
                      </p>
                    ) : null}
                    <button type="submit" className="btn" disabled={busy}>
                      Criar marco
                    </button>
                  </form>
                </aside>
              ) : selected ? (
                <MilestoneInspector
                  projectId={projectId}
                  row={selected}
                  lane={lanes.find((lane) => lane.id === selected.id) ?? null}
                  phases={phases}
                  tasks={model.tasks.filter((task) => task.milestoneId === selected.id)}
                  readOnly={readOnly}
                  permissions={permissions}
                  busy={busy}
                  onBusy={setBusy}
                  onClose={() => onSelect(null)}
                  onChanged={onChanged}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MilestoneInspector({
  projectId,
  row,
  lane,
  phases,
  tasks,
  readOnly,
  permissions,
  busy,
  onBusy,
  onClose,
  onChanged,
}: {
  projectId: string;
  row: PlanningMilestoneRow;
  lane: PlanningScheduleLane | null;
  phases: PhaseRow[];
  tasks: PlanningReadModel["tasks"];
  readOnly: boolean;
  permissions: string[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onClose: () => void;
  onChanged: (milestoneId?: string | null) => Promise<void> | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<null | "achieve" | "cancel">(null);
  const canUpdate = !readOnly && canUpdateMilestone(permissions);
  const canAchieve = !readOnly && canAchieveMilestone(permissions) && row.recordedStatus === "PLANNED";
  const terminal = row.recordedStatus === "ACHIEVED" || row.recordedStatus === "CANCELLED";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || terminal || row.version == null) {
      return;
    }
    const form = new FormData(event.currentTarget);
    onBusy(true);
    setError(null);
    const result = await api<PlanningMilestoneRow>(`/api/v1/projects/${projectId}/milestones/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: String(form.get("title") ?? "").trim(),
        targetDate: dateInputToIso(String(form.get("targetDate") ?? "")) ?? null,
        phaseId: String(form.get("phaseId") || "") || null,
        expectedVersion: row.version,
      }),
    });
    onBusy(false);
    if (!result.ok) {
      setError(result.problem.detail ?? "Não foi possível atualizar o marco.");
      return;
    }
    await onChanged(row.id);
  }

  async function command(kind: "achieve" | "cancel") {
    if (row.version == null) {
      return;
    }
    onBusy(true);
    setError(null);
    const result = await api<PlanningMilestoneRow>(`/api/v1/projects/${projectId}/milestones/${row.id}/${kind}`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey(`ms-${kind}`) },
      body: JSON.stringify({ expectedVersion: row.version }),
    });
    onBusy(false);
    setConfirming(null);
    if (!result.ok) {
      setError(result.problem.detail ?? `Não foi possível ${kind === "achieve" ? "alcançar" : "cancelar"} o marco.`);
      return;
    }
    await onChanged(row.id);
  }

  return (
    <aside className="structure-inspector" role="dialog" aria-labelledby="milestone-inspect-title">
      <header className="inspector-header">
        <div>
          <h2 id="milestone-inspect-title">{row.title}</h2>
          <p className="muted">
            Armazenado {milestoneStatusLabel(row.recordedStatus)} · derivado {milestoneStatusLabel(row.status)}
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={onClose}>
          Fechar
        </button>
      </header>

      <p className="planner-late-explain">{milestoneRiskExplanation(row)}</p>
      {row.risk?.reasons?.length ? (
        <ul className="milestone-reasons">
          {row.risk.reasons.map((reason) => (
            <li key={reason.code}>
              <code>{reason.code}</code> — {reason.text}
            </li>
          ))}
        </ul>
      ) : null}
      {row.risk?.sources?.length ? (
        <p className="muted">
          Fontes autorizadas: {row.risk.sources.map((source) => source.id.slice(0, 8)).join(", ")}
        </p>
      ) : null}

      <form className="inspector-form" onSubmit={(event) => void save(event)}>
        <label htmlFor="ms-edit-title">
          Título
          <input id="ms-edit-title" name="title" defaultValue={row.title} disabled={!canUpdate || terminal} />
        </label>
        <label htmlFor="ms-edit-date">
          Data-alvo
          <input
            id="ms-edit-date"
            name="targetDate"
            type="date"
            defaultValue={isoDateInput(row.targetDate)}
            disabled={!canUpdate || terminal}
          />
        </label>
        <label htmlFor="ms-edit-phase">
          Fase
          <select id="ms-edit-phase" name="phaseId" defaultValue={row.phaseId ?? ""} disabled={!canUpdate || terminal}>
            <option value="">—</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          <span className={`status-pill status-${row.status.toLowerCase()}`}>{milestoneStatusLabel(row.status)}</span>
          <span className="sr-only">Estado derivado, não editável.</span>
        </p>
        {canUpdate && !terminal ? (
          <button type="submit" className="btn" disabled={busy}>
            Salvar marco
          </button>
        ) : null}
      </form>

      <section>
        <h3>Tarefas contribuintes</h3>
        {tasks.length === 0 ? (
          <p className="muted">Nenhuma tarefa autorizada vinculada.</p>
        ) : (
          <ul className="milestone-task-list">
            {tasks.map((task) => (
              <li key={task.id}>
                {task.title} · {task.status}
                {task.late ? " · atrasada" : ""}
                {task.dependencyStartBlocked ? " · aguardando predecessor" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Relações</h3>
        <p className="muted">
          Issue permanece fora da posse de Task/Milestone. Uma Issue relacionada não é alcançada nem cancelada por
          este marco.
        </p>
        {lane ? (
          <p className="muted">
            Origem do cronograma: {lane.domain} / {lane.sourceId.slice(0, 8)}
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="planner-confirm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="planner-lifecycle">
        {canAchieve ? (
          confirming === "achieve" ? (
            <p className="planner-confirm">
              Alcançar é explícito e não ocorre ao concluir tarefas.
              <button type="button" className="btn" disabled={busy} onClick={() => void command("achieve")}>
                Confirmar alcance
              </button>
            </p>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming("achieve")}>
              Alcançar
            </button>
          )
        ) : null}
        {canUpdate && row.recordedStatus === "PLANNED" ? (
          confirming === "cancel" ? (
            <p className="planner-confirm">
              Cancelar é explícito e gera auditoria imutável.
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void command("cancel")}>
                Confirmar cancelamento
              </button>
            </p>
          ) : (
            <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirming("cancel")}>
              Cancelar marco
            </button>
          )
        ) : null}
      </div>
    </aside>
  );
}
