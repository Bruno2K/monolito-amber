"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StateScreen } from "../shell/StateScreen";
import { api } from "../../lib/api";
import { classifyProblem } from "../../lib/errors";
import {
  canApproveDeliverable,
  canAssignDeliverable,
  canCreateDeliverable,
  canDeliverDeliverable,
  canUpdateDeliverable,
  deliverableStatusLabel,
  formatPhaseDate,
  formatProgress,
  newIdempotencyKey,
  type DeliverableListResponse,
  type DeliverableRow,
  type DisciplineListResponse,
  type DisciplineRow,
  type PhaseListResponse,
  type PhaseRow,
  type ProjectMemberRow,
  type TeamListResponse,
  type TeamRow,
} from "../../lib/operations";
import { useShell } from "../session/ShellProvider";

function isoDateInput(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function ownerLabel(
  row: DeliverableRow,
  members: ProjectMemberRow[],
  teams: TeamRow[],
): string {
  if (row.ownerTeamId) {
    return teams.find((team) => team.id === row.ownerTeamId)?.name ?? "Equipe";
  }
  if (row.ownerProjectMembershipId) {
    const member = members.find((item) => item.id === row.ownerProjectMembershipId);
    return member?.displayName ?? member?.email ?? "Membro";
  }
  return "Sem responsável";
}

export function DeliverablesView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useShell();
  const project = state.currentProject;
  const permissions = project?.permissions ?? [];
  const selectedId = searchParams.get("inspect");

  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<"error" | "no-permission" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [items, setItems] = useState<DeliverableRow[]>([]);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineRow[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "open");
  const [phaseFilter, setPhaseFilter] = useState(searchParams.get("phaseId") ?? "");
  const [disciplineFilter, setDisciplineFilter] = useState(searchParams.get("disciplineId") ?? "");

  const selected = useMemo(
    () => items.find((row) => row.id === selectedId) ?? null,
    [items, selectedId],
  );
  const creating = selectedId === "new";

  const openItem = useCallback(
    (deliverableId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (deliverableId) {
        params.set("inspect", deliverableId);
      } else {
        params.delete("inspect");
      }
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    const statusParam =
      statusFilter === "open"
        ? "PLANNED,IN_PROGRESS,IN_REVIEW,APPROVED"
        : statusFilter === "all"
          ? ""
          : statusFilter;
    const search = new URLSearchParams();
    if (query.trim()) {
      search.set("q", query.trim());
    }
    if (statusParam) {
      search.set("status", statusParam);
    }
    if (phaseFilter) {
      search.set("phaseId", phaseFilter);
    }
    if (disciplineFilter) {
      search.set("disciplineId", disciplineFilter);
    }
    const qs = search.toString();
    const orgId = project?.organizationId ?? "";
    const [listResult, phaseResult, disciplineResult, memberResult, teamResult] = await Promise.all([
      api<DeliverableListResponse>(`/api/v1/projects/${projectId}/deliverables${qs ? `?${qs}` : ""}`),
      api<PhaseListResponse>(`/api/v1/projects/${projectId}/phases`),
      api<DisciplineListResponse>(
        `/api/v1/organizations/${encodeURIComponent(orgId)}/disciplines?projectId=${encodeURIComponent(projectId)}`,
      ),
      api<ProjectMemberRow[]>(`/api/v1/projects/${projectId}/members`),
      api<TeamListResponse>(
        `/api/v1/organizations/${encodeURIComponent(orgId)}/teams?projectId=${encodeURIComponent(projectId)}`,
      ),
    ]);
    if (!listResult.ok) {
      const kind = classifyProblem(listResult.problem);
      setErrorKind(kind === "no-permission" ? "no-permission" : "error");
      setErrorDetail(listResult.problem.detail);
      setLoading(false);
      return;
    }
    setItems(listResult.body.items);
    setPhases(phaseResult.ok ? phaseResult.body.items : []);
    setDisciplines(disciplineResult.ok ? disciplineResult.body.items : []);
    setMembers(memberResult.ok ? memberResult.body : []);
    setTeams(teamResult.ok ? teamResult.body.items : []);
    setLoading(false);
  }, [disciplineFilter, phaseFilter, project?.organizationId, projectId, query, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(path: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setFormError(null);
    const result = await api<DeliverableRow>(path, init);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.problem.detail);
      return false;
    }
    await load();
    return true;
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ownerKind = String(form.get("ownerKind") ?? "none");
    const payload = {
      phaseId: String(form.get("phaseId") ?? ""),
      disciplineId: String(form.get("disciplineId") ?? ""),
      code: String(form.get("code") ?? ""),
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      plannedStartAt: String(form.get("plannedStartAt") || "") || null,
      dueAt: String(form.get("dueAt") || "") || null,
      progressPercent: form.get("progressPercent") === "" ? null : Number(form.get("progressPercent")),
      ownerProjectMembershipId: ownerKind === "user" ? String(form.get("ownerProjectMembershipId") || "") || null : null,
      ownerTeamId: ownerKind === "team" ? String(form.get("ownerTeamId") || "") || null : null,
    };
    if (creating) {
      const created = await api<DeliverableRow>(`/api/v1/projects/${projectId}/deliverables`, {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify(payload),
      });
      if (!created.ok) {
        setFormError(created.problem.detail);
        return;
      }
      await load();
      openItem(created.body.id);
      return;
    }
    if (!selected) {
      return;
    }
    const { ownerProjectMembershipId, ownerTeamId, ...fields } = payload;
    setBusy(true);
    setFormError(null);
    let version = selected.version;
    if (canUpdateDeliverable(permissions)) {
      const updated = await api<DeliverableRow>(`/api/v1/projects/${projectId}/deliverables/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...fields, expectedVersion: version }),
      });
      if (!updated.ok) {
        setBusy(false);
        setFormError(updated.problem.detail);
        return;
      }
      version = updated.body.version;
    }
    if (canAssignDeliverable(permissions)) {
      const assigned = await api<DeliverableRow>(`/api/v1/projects/${projectId}/deliverables/${selected.id}/assign`, {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({
          ownerProjectMembershipId,
          ownerTeamId,
          expectedVersion: version,
        }),
      });
      if (!assigned.ok) {
        setBusy(false);
        setFormError(assigned.problem.detail);
        await load();
        return;
      }
    }
    setBusy(false);
    await load();
  }

  async function action(
    kind: "start" | "submit-for-review" | "approve" | "deliver" | "cancel" | "archive" | "unassign",
  ) {
    if (!selected) {
      return;
    }
    const ok = await mutate(`/api/v1/projects/${projectId}/deliverables/${selected.id}/${kind}`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
      body: JSON.stringify({ expectedVersion: selected.version }),
    });
    if (ok && kind === "archive") {
      openItem(null);
    }
  }

  if (loading) {
    return <StateScreen kind="loading" />;
  }
  if (errorKind) {
    return <StateScreen kind={errorKind} detail={errorDetail} />;
  }

  const inspectorOpen = creating || Boolean(selected);
  const phaseName = (phaseId: string) => phases.find((row) => row.id === phaseId)?.name ?? "—";
  const disciplineName = (disciplineId: string) => {
    const row = disciplines.find((item) => item.id === disciplineId);
    return row ? `${row.code}` : "—";
  };

  return (
    <section className="deliverables-page" data-surface="deliverables">
      <header className="structure-header">
        <div>
          <h1>Entregas</h1>
          <p>Resultados do projeto, responsabilidade e progresso. Status muda somente por transição explícita.</p>
        </div>
        {canCreateDeliverable(permissions) ? (
          <button type="button" className="btn" onClick={() => openItem("new")}>
            Nova Entrega
          </button>
        ) : null}
      </header>

      <div className="deliverables-toolbar" role="search">
        <label className="sr-only" htmlFor="deliverable-search">
          Buscar entregas
        </label>
        <input
          id="deliverable-search"
          className="deliverables-search"
          placeholder="Buscar entregas..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label>
          <span className="sr-only">Fase</span>
          <select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)} aria-label="Filtrar por fase">
            <option value="">Fase</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Disciplina</span>
          <select
            value={disciplineFilter}
            onChange={(event) => setDisciplineFilter(event.target.value)}
            aria-label="Filtrar por disciplina"
          >
            <option value="">Disciplina</option>
            {disciplines.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status">
            <option value="open">Abertas</option>
            <option value="all">Todas</option>
            <option value="PLANNED">Planejada</option>
            <option value="IN_PROGRESS">Em curso</option>
            <option value="IN_REVIEW">Em revisão</option>
            <option value="APPROVED">Aprovada</option>
            <option value="DELIVERED">Entregue</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </label>
      </div>

      <div className={`deliverables-layout${inspectorOpen ? " has-inspector" : ""}`}>
        {items.length === 0 ? (
          <section className="state-screen" data-state="empty" aria-live="polite">
            <h2>Nenhuma entrega</h2>
            <p>Nenhuma Deliverable neste filtro. Crie a primeira para registrar um resultado do projeto.</p>
          </section>
        ) : (
          <div className="deliverables-table-wrap">
            <table className="deliverables-table">
              <caption className="sr-only">Lista de entregas do projeto</caption>
              <thead>
                <tr>
                  <th scope="col">Entrega</th>
                  <th scope="col">Fase / Disciplina</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Prazo</th>
                  <th scope="col">Progresso</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const active = row.id === selectedId;
                  return (
                    <tr key={row.id} className={active ? "is-active" : undefined}>
                      <td>
                        <button
                          type="button"
                          className="deliverable-link"
                          onClick={() => openItem(row.id)}
                          aria-current={active ? "true" : undefined}
                        >
                          <strong>
                            {row.code} · {row.title}
                          </strong>
                          <span>{row.description || "Resultado do projeto — não é um arquivo"}</span>
                        </button>
                      </td>
                      <td>
                        {phaseName(row.phaseId)} · {disciplineName(row.disciplineId)}
                      </td>
                      <td>{ownerLabel(row, members, teams)}</td>
                      <td>{formatPhaseDate(row.dueAt)}</td>
                      <td>
                        <span className={`status-pill status-${row.status.toLowerCase()}`}>
                          {formatProgress(row.progressPercent)} · {deliverableStatusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted table-count">
              {items.length} {items.length === 1 ? "resultado" : "resultados"}
            </p>
          </div>
        )}

        {inspectorOpen ? (
          <div className="structure-overlay deliverables-inspector-shell" role="presentation">
            <button
              type="button"
              className="structure-backdrop"
              aria-label="Fechar inspetor"
              onClick={() => openItem(null)}
            />
            <aside
              className="structure-inspector"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deliverable-inspector-title"
            >
              <form key={selectedId ?? "new"} onSubmit={(event) => void onSave(event)}>
                <h2 id="deliverable-inspector-title">{creating ? "Nova Entrega" : selected?.title}</h2>
                <p className="muted">Resultado contratual — não é um arquivo. Datas e progresso não alteram o status.</p>
                {formError ? (
                  <p role="alert" className="error">
                    {formError}
                  </p>
                ) : null}
                <label htmlFor="deliverable-code">
                  Código
                  <input id="deliverable-code" name="code" defaultValue={selected?.code ?? ""} required disabled={!creating && !canUpdateDeliverable(permissions)} />
                </label>
                <label htmlFor="deliverable-title">
                  Título
                  <input id="deliverable-title" name="title" defaultValue={selected?.title ?? ""} required disabled={!creating && !canUpdateDeliverable(permissions)} />
                </label>
                <label htmlFor="deliverable-description">
                  Descrição
                  <textarea
                    id="deliverable-description"
                    name="description"
                    defaultValue={selected?.description ?? ""}
                    rows={3}
                    disabled={!creating && !canUpdateDeliverable(permissions)}
                  />
                </label>
                <label htmlFor="deliverable-phase">
                  Fase
                  <select id="deliverable-phase" name="phaseId" defaultValue={selected?.phaseId ?? ""} required disabled={!creating && !canUpdateDeliverable(permissions)}>
                    <option value="">Selecionar</option>
                    {phases.map((phase) => (
                      <option key={phase.id} value={phase.id}>
                        {phase.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="deliverable-discipline">
                  Disciplina
                  <select
                    id="deliverable-discipline"
                    name="disciplineId"
                    defaultValue={selected?.disciplineId ?? ""}
                    required
                    disabled={!creating && !canUpdateDeliverable(permissions)}
                  >
                    <option value="">Selecionar</option>
                    {disciplines.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Início planejado
                  <input
                    name="plannedStartAt"
                    type="date"
                    defaultValue={isoDateInput(selected?.plannedStartAt)}
                    disabled={!creating && !canUpdateDeliverable(permissions)}
                  />
                </label>
                <label>
                  Prazo
                  <input
                    name="dueAt"
                    type="date"
                    defaultValue={isoDateInput(selected?.dueAt)}
                    disabled={!creating && !canUpdateDeliverable(permissions)}
                  />
                </label>
                <label>
                  Progresso (0–100)
                  <input
                    name="progressPercent"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={selected?.progressPercent ?? ""}
                    disabled={!creating && !canUpdateDeliverable(permissions)}
                  />
                </label>
                {(creating || canAssignDeliverable(permissions)) && (
                  <>
                    <fieldset className="owner-fieldset">
                      <legend>Responsável (usuário XOR equipe)</legend>
                      <label>
                        Tipo
                        <select
                          name="ownerKind"
                          defaultValue={
                            selected?.ownerTeamId ? "team" : selected?.ownerProjectMembershipId ? "user" : "none"
                          }
                        >
                          <option value="none">Nenhum</option>
                          <option value="user">Membro do projeto</option>
                          <option value="team">Equipe da Organization</option>
                        </select>
                      </label>
                      <label>
                        Membro
                        <select name="ownerProjectMembershipId" defaultValue={selected?.ownerProjectMembershipId ?? ""}>
                          <option value="">—</option>
                          {members
                            .filter((row) => row.status === "ACTIVE")
                            .map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.displayName ?? row.email}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Equipe
                        <select name="ownerTeamId" defaultValue={selected?.ownerTeamId ?? ""}>
                          <option value="">—</option>
                          {teams.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                  </>
                )}
                {selected ? (
                  <p className="muted">
                    Status: {deliverableStatusLabel(selected.status)}. A UI nunca substitui a autorização.
                  </p>
                ) : null}
                <div className="inspector-actions">
                  {(creating || canUpdateDeliverable(permissions) || canAssignDeliverable(permissions)) && (
                    <button type="submit" className="btn" disabled={busy}>
                      Salvar
                    </button>
                  )}
                  {selected && canUpdateDeliverable(permissions) && selected.status === "PLANNED" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("start")}>
                      Iniciar
                    </button>
                  ) : null}
                  {selected && canUpdateDeliverable(permissions) && selected.status === "IN_PROGRESS" ? (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => void action("submit-for-review")}
                    >
                      Enviar para revisão
                    </button>
                  ) : null}
                  {selected && canApproveDeliverable(permissions) && selected.status === "IN_REVIEW" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("approve")}>
                      Aprovar
                    </button>
                  ) : null}
                  {selected && !canApproveDeliverable(permissions) && selected.status === "IN_REVIEW" ? (
                    <p className="muted">Aprovar indisponível: requer deliverable.approve.</p>
                  ) : null}
                  {selected && canDeliverDeliverable(permissions) && selected.status === "APPROVED" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("deliver")}>
                      Entregar
                    </button>
                  ) : null}
                  {selected &&
                  canUpdateDeliverable(permissions) &&
                  selected.status !== "DELIVERED" &&
                  selected.status !== "CANCELLED" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("cancel")}>
                      Cancelar
                    </button>
                  ) : null}
                  {selected && canAssignDeliverable(permissions) && (selected.ownerProjectMembershipId || selected.ownerTeamId) ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("unassign")}>
                      Remover responsável
                    </button>
                  ) : null}
                  {selected && canUpdateDeliverable(permissions) ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("archive")}>
                      Arquivar
                    </button>
                  ) : null}
                  <button type="button" className="text-button" onClick={() => openItem(null)}>
                    Fechar
                  </button>
                </div>
              </form>
            </aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}
