"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import {
  auditEventLabel,
  canAssignTask,
  canCompleteTask,
  canCreateTask,
  canUpdateTask,
  dateInputToIso,
  formatPlanningDate,
  formatProgress,
  isoDateInput,
  lateExplanation,
  newIdempotencyKey,
  taskStatusLabel,
  type PlanningHistoryEvent,
  type PlanningMilestoneRow,
  type PlanningTaskRow,
} from "../../lib/planning";
import {
  type DeliverableListResponse,
  type DisciplineListResponse,
  type PhaseListResponse,
  type WorkPackageListResponse,
} from "../../lib/operations";

interface IssueOption {
  id: string;
  title: string;
  status: string;
}

interface MemberOption {
  userId: string;
  displayName?: string;
  email?: string;
  status: string;
}

export function TaskInspector({
  projectId,
  organizationId,
  row,
  creating,
  readOnly,
  permissions,
  onClose,
  onChanged,
}: {
  projectId: string;
  organizationId: string;
  row: PlanningTaskRow | null;
  creating: boolean;
  readOnly: boolean;
  permissions: string[];
  onClose: () => void;
  onChanged: (inspectId?: string | null) => Promise<void> | void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<null | "complete" | "cancel">(null);
  const [blockReason, setBlockReason] = useState("");
  const [history, setHistory] = useState<PlanningHistoryEvent[]>(row?.history ?? []);
  const [phases, setPhases] = useState<PhaseListResponse["items"]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableListResponse["items"]>([]);
  const [workPackages, setWorkPackages] = useState<WorkPackageListResponse["items"]>([]);
  const [milestones, setMilestones] = useState<PlanningMilestoneRow[]>([]);
  const [issues, setIssues] = useState<IssueOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineListResponse["items"]>([]);

  const canCreate = canCreateTask(permissions);
  const canUpdate = canUpdateTask(permissions);
  const canAssign = canAssignTask(permissions);
  const canComplete = canCompleteTask(permissions);
  const fieldsDisabled = readOnly || busy || (!creating && !canUpdate);
  const terminal = row?.status === "DONE" || row?.status === "CANCELLED";

  useEffect(() => {
    setFormError(null);
    setConfirming(null);
    setBlockReason(row?.blockedReason ?? "");
    setHistory(row?.history ?? []);
  }, [row?.id, row?.blockedReason, row?.history, creating]);

  useEffect(() => {
    void Promise.all([
      api<PhaseListResponse>(`/api/v1/projects/${projectId}/phases`),
      api<DeliverableListResponse>(`/api/v1/projects/${projectId}/deliverables`),
      api<WorkPackageListResponse>(`/api/v1/projects/${projectId}/work-packages`),
      api<PlanningMilestoneRow[] | { items?: PlanningMilestoneRow[] }>(`/api/v1/projects/${projectId}/milestones`),
      api<IssueOption[] | { items?: IssueOption[] }>(`/api/v1/projects/${projectId}/issues`),
      api<MemberOption[]>(`/api/v1/projects/${projectId}/members`),
      organizationId
        ? api<DisciplineListResponse>(`/api/v1/organizations/${organizationId}/disciplines?projectId=${projectId}`)
        : Promise.resolve({ ok: false as const }),
    ]).then(([phaseRes, delRes, wpRes, msRes, issueRes, memberRes, discRes]) => {
      if (phaseRes.ok) {
        setPhases(phaseRes.body.items);
      }
      if (delRes.ok) {
        setDeliverables(delRes.body.items);
      }
      if (wpRes.ok) {
        setWorkPackages(wpRes.body.items);
      }
      if (msRes.ok) {
        const body = msRes.body;
        setMilestones(Array.isArray(body) ? body : body.items ?? []);
      }
      if (issueRes.ok) {
        const body = issueRes.body;
        setIssues(Array.isArray(body) ? body : body.items ?? []);
      }
      if (memberRes.ok) {
        setMembers(memberRes.body);
      }
      if (discRes.ok) {
        setDisciplines(discRes.body.items);
      }
    });
  }, [organizationId, projectId]);

  useEffect(() => {
    if (!row?.id || creating) {
      return;
    }
    void api<PlanningHistoryEvent[]>(`/api/v1/projects/${projectId}/tasks/${row.id}/history`).then((result) => {
      if (result.ok) {
        setHistory(result.body);
      }
    });
  }, [creating, projectId, row?.id, row?.version]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? ""),
      priority: String(form.get("priority") || "") || null,
      responsibleDisciplineId: String(form.get("responsibleDisciplineId") || "") || null,
      plannedStartAt: dateInputToIso(String(form.get("plannedStartAt") ?? "")) ?? null,
      dueDate: dateInputToIso(String(form.get("dueDate") ?? "")) ?? null,
      estimatedMinutes: form.get("estimatedMinutes") ? Number(form.get("estimatedMinutes")) : null,
      progressPercent: form.get("progressPercent") === "" ? null : Number(form.get("progressPercent")),
      issueId: String(form.get("issueId") || "") || null,
      milestoneId: String(form.get("milestoneId") || "") || null,
      phaseId: String(form.get("phaseId") || "") || null,
      deliverableId: String(form.get("deliverableId") || "") || null,
      workPackageId: String(form.get("workPackageId") || "") || null,
    };
    if (!payload.title) {
      setFormError("Título é obrigatório.");
      return;
    }
    setBusy(true);
    if (creating) {
      if (!canCreate) {
        setBusy(false);
        setFormError("Criar tarefa requer task.create.");
        return;
      }
      const created = await api<PlanningTaskRow>(`/api/v1/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey("task-create") },
        body: JSON.stringify(payload),
      });
      setBusy(false);
      if (!created.ok) {
        setFormError(created.problem.detail);
        return;
      }
      await onChanged(created.body.id);
      return;
    }
    if (!row) {
      setBusy(false);
      return;
    }
    const updated = await api<PlanningTaskRow>(`/api/v1/projects/${projectId}/tasks/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...payload, expectedVersion: row.version }),
    });
    setBusy(false);
    if (!updated.ok) {
      setFormError(updated.problem.detail);
      return;
    }
    await onChanged();
  }

  async function runCommand(
    path: string,
    body: Record<string, unknown>,
    permissionOk: boolean,
    missing = "Permissão insuficiente.",
  ) {
    if (!row) {
      return;
    }
    if (!permissionOk) {
      setFormError(missing);
      return;
    }
    setBusy(true);
    setFormError(null);
    const result = await api<PlanningTaskRow>(`/api/v1/projects/${projectId}/tasks/${row.id}/${path}`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey(`task-${path}`) },
      body: JSON.stringify({ ...body, expectedVersion: row.version }),
    });
    setBusy(false);
    setConfirming(null);
    if (!result.ok) {
      setFormError(result.problem.detail);
      return;
    }
    await onChanged();
  }

  async function onAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("assigneeUserId") ?? "");
    await runCommand("assign", { assigneeUserId: raw || null }, canAssign, "Atribuir requer task.assign.");
  }

  return (
    <aside className="structure-inspector" role="dialog" aria-modal="true" aria-labelledby="planner-inspect-title">
      <header className="inspector-header">
        <div>
          <p className="muted">Tarefa</p>
          <h2 id="planner-inspect-title">{creating ? "Nova tarefa" : row?.title}</h2>
        </div>
        <button type="button" className="btn secondary" onClick={onClose}>
          Fechar
        </button>
      </header>

      {readOnly ? (
        <p className="planner-readonly" role="status">
          Projeto arquivado — mutações recusadas. A tarefa permanece legível.
        </p>
      ) : null}

      {row ? (
        <p role="status">
          Status armazenado:{" "}
          <span className={`status-pill status-${row.status.toLowerCase()}`}>{taskStatusLabel(row.status)}</span>
          {row.late ? (
            <span className="planner-late" title={lateExplanation(row.status)}>
              Atrasada
            </span>
          ) : null}
        </p>
      ) : (
        <p className="muted">A tarefa nasce em A fazer. Progresso 100% não conclui.</p>
      )}

      {row?.late ? (
        <p className="planner-late-explain" role="status">
          <strong>Atrasada (derivado).</strong> {lateExplanation(row.status)}
        </p>
      ) : null}

      {row?.previews.issue ? (
        <p>
          <span className="planner-issue-rel">Issue relacionada</span>: {row.previews.issue.title} ({row.previews.issue.status}
          ). A Issue não é esta Tarefa.
        </p>
      ) : row?.issueId ? (
        <p className="muted">Issue ligada omitida — sem pré-visualização autorizada.</p>
      ) : null}

      {formError ? (
        <p role="alert" className="error">
          {formError}
        </p>
      ) : null}

      <form key={creating ? "new" : row?.id ?? "none"} onSubmit={(event) => void onSave(event)}>
        <label htmlFor="task-title">
          Título
          <input
            id="task-title"
            name="title"
            defaultValue={row?.title ?? ""}
            required
            disabled={fieldsDisabled}
            autoFocus={creating}
          />
        </label>
        <label htmlFor="task-description">
          Descrição
          <textarea
            id="task-description"
            name="description"
            defaultValue={row?.description ?? ""}
            rows={3}
            disabled={fieldsDisabled}
          />
        </label>
        <label htmlFor="task-priority">
          Prioridade
          <select id="task-priority" name="priority" defaultValue={row?.priority ?? ""} disabled={fieldsDisabled}>
            <option value="">Nenhuma</option>
            <option value="LOW">Baixa</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </label>
        <label htmlFor="task-discipline">
          Disciplina responsável
          <select
            id="task-discipline"
            name="responsibleDisciplineId"
            defaultValue={row?.responsibleDisciplineId ?? ""}
            disabled={fieldsDisabled}
          >
            <option value="">Nenhuma</option>
            {disciplines.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} {item.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-planned">
          Início planejado
          <input
            id="task-planned"
            name="plannedStartAt"
            type="date"
            defaultValue={isoDateInput(row?.plannedStartAt)}
            disabled={fieldsDisabled}
          />
        </label>
        <label htmlFor="task-due">
          Prazo
          <input id="task-due" name="dueDate" type="date" defaultValue={isoDateInput(row?.dueDate)} disabled={fieldsDisabled} />
        </label>
        <label htmlFor="task-estimate">
          Estimativa (minutos)
          <input
            id="task-estimate"
            name="estimatedMinutes"
            type="number"
            min={0}
            defaultValue={row?.estimatedMinutes ?? ""}
            disabled={fieldsDisabled}
          />
        </label>
        <label htmlFor="task-progress">
          Progresso (%)
          <input
            id="task-progress"
            name="progressPercent"
            type="number"
            min={0}
            max={100}
            defaultValue={row?.progressPercent ?? ""}
            disabled={fieldsDisabled}
          />
        </label>
        <p className="muted">Progresso 100% não marca Concluída. DONE é um comando explícito.</p>
        <label htmlFor="task-issue">
          Issue relacionada (opcional)
          <select id="task-issue" name="issueId" defaultValue={row?.issueId ?? ""} disabled={fieldsDisabled}>
            <option value="">Nenhuma</option>
            {issues.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-milestone">
          Marco
          <select id="task-milestone" name="milestoneId" defaultValue={row?.milestoneId ?? ""} disabled={fieldsDisabled}>
            <option value="">Nenhum</option>
            {milestones.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-phase">
          Fase
          <select id="task-phase" name="phaseId" defaultValue={row?.phaseId ?? ""} disabled={fieldsDisabled}>
            <option value="">Nenhuma</option>
            {phases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-deliverable">
          Entrega
          <select id="task-deliverable" name="deliverableId" defaultValue={row?.deliverableId ?? ""} disabled={fieldsDisabled}>
            <option value="">Nenhuma</option>
            {deliverables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.title}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="task-wp">
          Pacote
          <select id="task-wp" name="workPackageId" defaultValue={row?.workPackageId ?? ""} disabled={fieldsDisabled}>
            <option value="">Nenhum</option>
            {workPackages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        {(creating && canCreate) || (!creating && canUpdate) ? (
          <div className="inspector-actions">
            <button type="submit" className="btn" disabled={busy || readOnly || (terminal && !creating)}>
              {creating ? "Criar tarefa" : "Salvar campos"}
            </button>
          </div>
        ) : null}
      </form>

      {row && !creating ? (
        <>
          <dl className="planner-dl">
            <div>
              <dt>Fase</dt>
              <dd>{row.previews.phase?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Entrega</dt>
              <dd>{row.previews.deliverable ? `${row.previews.deliverable.code} · ${row.previews.deliverable.title}` : "—"}</dd>
            </div>
            <div>
              <dt>Pacote</dt>
              <dd>{row.previews.workPackage?.title ?? "—"}</dd>
            </div>
            <div>
              <dt>Marco</dt>
              <dd>{row.previews.milestone ? `${row.previews.milestone.title} (${row.previews.milestone.status})` : "—"}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{row.previews.assignee?.displayName ?? "—"}</dd>
            </div>
            <div>
              <dt>Início / prazo</dt>
              <dd>
                {formatPlanningDate(row.plannedStartAt)} / {formatPlanningDate(row.dueDate)}
              </dd>
            </div>
            <div>
              <dt>Estimativa</dt>
              <dd>{row.estimatedMinutes != null ? `${row.estimatedMinutes} min` : "—"}</dd>
            </div>
            <div>
              <dt>Progresso</dt>
              <dd>{formatProgress(row.progressPercent)}</dd>
            </div>
          </dl>

          {canAssign && !readOnly && !terminal ? (
            <form className="planner-assign" onSubmit={(event) => void onAssign(event)}>
              <label htmlFor="task-assignee">
                Atribuir a membro do projeto
                <select id="task-assignee" name="assigneeUserId" defaultValue={row.assigneeUserId ?? ""}>
                  <option value="">Sem responsável</option>
                  {members
                    .filter((member) => member.status === "ACTIVE" && member.userId)
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName ?? member.email ?? member.userId}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit" className="btn secondary" disabled={busy}>
                Atribuir
              </button>
            </form>
          ) : null}

          {!readOnly && !terminal ? (
            <div className="inspector-actions planner-lifecycle">
              {canUpdate && (row.status === "TODO" || row.status === "BLOCKED") ? (
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void runCommand(row.status === "BLOCKED" ? "unblock" : "start", {}, canUpdate)}
                >
                  {row.status === "BLOCKED" ? "Desbloquear" : "Iniciar"}
                </button>
              ) : null}
              {canUpdate && row.status === "IN_PROGRESS" ? (
                <>
                  <label htmlFor="task-block-reason">
                    Motivo do bloqueio
                    <input
                      id="task-block-reason"
                      value={blockReason}
                      onChange={(event) => setBlockReason(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() =>
                      void runCommand("block", { blockedReason: blockReason }, canUpdate, "Bloquear requer task.update.")
                    }
                  >
                    Bloquear
                  </button>
                </>
              ) : null}
              {canComplete && row.status === "IN_PROGRESS" ? (
                confirming === "complete" ? (
                  <p role="status" className="planner-confirm">
                    Concluir é explícito e não altera Issue, Marco, Entrega, Pacote, Fase ou Gate.{" "}
                    <button type="button" className="btn" disabled={busy} onClick={() => void runCommand("complete", {}, canComplete, "Concluir requer task.complete.")}>
                      Confirmar conclusão
                    </button>
                    <button type="button" className="btn secondary" onClick={() => setConfirming(null)}>
                      Voltar
                    </button>
                  </p>
                ) : (
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirming("complete")}>
                    Concluir
                  </button>
                )
              ) : null}
              {!canComplete && row.status === "IN_PROGRESS" ? (
                <p className="muted">Concluir indisponível: requer task.complete.</p>
              ) : null}
              {canUpdate ? (
                confirming === "cancel" ? (
                  <p role="status" className="planner-confirm">
                    Cancelar é terminal e não cascateia agregados irmãos.{" "}
                    <button type="button" className="btn" disabled={busy} onClick={() => void runCommand("cancel", {}, canUpdate)}>
                      Confirmar cancelamento
                    </button>
                    <button type="button" className="btn secondary" onClick={() => setConfirming(null)}>
                      Voltar
                    </button>
                  </p>
                ) : (
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirming("cancel")}>
                    Cancelar
                  </button>
                )
              ) : null}
            </div>
          ) : null}

          <section className="planner-history" aria-labelledby="planner-history-title">
            <h3 id="planner-history-title">Histórico e auditoria</h3>
            {history.length === 0 ? (
              <p className="muted">Sem eventos de auditoria desta tarefa.</p>
            ) : (
              <ol className="planner-history-list">
                {history.map((event) => (
                  <li key={event.id}>
                    <span>{auditEventLabel(event.eventType)}</span>
                    <time dateTime={event.createdAt}>{formatPlanningDate(event.createdAt)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </aside>
  );
}
