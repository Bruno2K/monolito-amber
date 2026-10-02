"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StateScreen } from "../shell/StateScreen";
import { TraceabilityContextPanel } from "../operations/TraceabilityContextPanel";
import { api } from "../../lib/api";
import { classifyProblem } from "../../lib/errors";
import { useInspectorEscape } from "../../lib/use-inspector-escape";
import { Drawer } from "../ui";
import {
  canCompleteWorkPackage,
  canCreateWorkPackage,
  canDisassociateWorkPackage,
  canUpdateWorkPackage,
  formatPhaseDate,
  newIdempotencyKey,
  workPackageStatusLabel,
  workPackagesDeepLink,
  deliverablesDeepLink,
  withReturnPath,
  safeReturnTo,
  type DeliverableListResponse,
  type DeliverableRow,
  type DisciplineListResponse,
  type DisciplineRow,
  type PhaseListResponse,
  type PhaseRow,
  type ProjectMemberRow,
  type TeamListResponse,
  type TeamRow,
  type WorkPackageListResponse,
  type WorkPackageRow,
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

function ownerLabel(row: WorkPackageRow, members: ProjectMemberRow[], teams: TeamRow[]): string {
  if (row.ownerTeamId) {
    return teams.find((team) => team.id === row.ownerTeamId)?.name ?? "Equipe";
  }
  if (row.ownerProjectMembershipId) {
    const member = members.find((item) => item.id === row.ownerProjectMembershipId);
    return member?.displayName ?? member?.email ?? "Membro";
  }
  return "Sem responsável";
}

export function WorkPackagesView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useShell();
  const project = state.currentProject;
  const permissions = project?.permissions ?? [];
  const selectedId = searchParams.get("inspect");
  const returnTo = safeReturnTo(searchParams.get("returnTo"), projectId);

  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<"error" | "no-permission" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [items, setItems] = useState<WorkPackageRow[]>([]);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineRow[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "open");
  const [phaseFilter, setPhaseFilter] = useState(searchParams.get("phaseId") ?? "");
  const [deliverableFilter, setDeliverableFilter] = useState(searchParams.get("deliverableId") ?? "");
  const [disciplineFilter, setDisciplineFilter] = useState(searchParams.get("disciplineId") ?? "");
  const [ownerFilter, setOwnerFilter] = useState(searchParams.get("owner") ?? "");
  const [archivedSelected, setArchivedSelected] = useState<WorkPackageRow | null>(null);

  const selected = useMemo(() => {
    if (archivedSelected && archivedSelected.id === selectedId) {
      return archivedSelected;
    }
    return items.find((row) => row.id === selectedId) ?? null;
  }, [archivedSelected, items, selectedId]);
  const creating = selectedId === "new";
  const filtersActive = Boolean(
    query.trim() ||
      (statusFilter && statusFilter !== "open") ||
      phaseFilter ||
      deliverableFilter ||
      disciplineFilter ||
      ownerFilter,
  );

  const openItem = useCallback(
    (workPackageId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (workPackageId) {
        params.set("inspect", workPackageId);
      } else {
        params.delete("inspect");
      }
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useInspectorEscape(Boolean(selectedId), openItem);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    const statusParam =
      statusFilter === "open" ? "PLANNED,ACTIVE,BLOCKED" : statusFilter === "all" ? "" : statusFilter;
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
    if (deliverableFilter) {
      search.set("deliverableId", deliverableFilter);
    }
    if (disciplineFilter) {
      search.set("disciplineId", disciplineFilter);
    }
    if (ownerFilter === "none") {
      search.set("unassigned", "true");
    } else if (ownerFilter.startsWith("user:")) {
      search.set("ownerProjectMembershipId", ownerFilter.slice(5));
    } else if (ownerFilter.startsWith("team:")) {
      search.set("ownerTeamId", ownerFilter.slice(5));
    }
    const qs = search.toString();
    const orgId = project?.organizationId ?? "";
    const [listResult, phaseResult, disciplineResult, deliverableResult, memberResult, teamResult] =
      await Promise.all([
        api<WorkPackageListResponse>(`/api/v1/projects/${projectId}/work-packages${qs ? `?${qs}` : ""}`),
        api<PhaseListResponse>(`/api/v1/projects/${projectId}/phases`),
        api<DisciplineListResponse>(
          `/api/v1/organizations/${encodeURIComponent(orgId)}/disciplines?projectId=${encodeURIComponent(projectId)}`,
        ),
        api<DeliverableListResponse>(`/api/v1/projects/${projectId}/deliverables?status=PLANNED,IN_PROGRESS,IN_REVIEW,APPROVED,DELIVERED,CANCELLED`),
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
    setDeliverables(deliverableResult.ok ? deliverableResult.body.items : []);
    setMembers(memberResult.ok ? memberResult.body : []);
    setTeams(teamResult.ok ? teamResult.body.items : []);
    setLoading(false);
  }, [
    deliverableFilter,
    disciplineFilter,
    ownerFilter,
    phaseFilter,
    project?.organizationId,
    projectId,
    query,
    statusFilter,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId || selectedId === "new") {
      setArchivedSelected(null);
      return;
    }
    if (items.some((row) => row.id === selectedId)) {
      setArchivedSelected(null);
      return;
    }
    let cancelled = false;
    void api<WorkPackageRow>(`/api/v1/projects/${projectId}/work-packages/${selectedId}`).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setArchivedSelected(result.body);
      } else {
        setArchivedSelected(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [items, projectId, selectedId]);

  async function mutate(path: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setFormError(null);
    const result = await api<WorkPackageRow>(path, init);
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
      disciplineId: String(form.get("disciplineId") || "") || null,
      deliverableId: String(form.get("deliverableId") || "") || null,
      code: String(form.get("code") || "") || null,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      plannedStartAt: String(form.get("plannedStartAt") || "") || null,
      dueAt: String(form.get("dueAt") || "") || null,
      ownerProjectMembershipId: ownerKind === "user" ? String(form.get("ownerProjectMembershipId") || "") || null : null,
      ownerTeamId: ownerKind === "team" ? String(form.get("ownerTeamId") || "") || null : null,
    };
    if (creating) {
      const created = await api<WorkPackageRow>(`/api/v1/projects/${projectId}/work-packages`, {
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
    const { ownerProjectMembershipId, ownerTeamId, deliverableId, ...fields } = payload;
    setBusy(true);
    setFormError(null);
    let version = selected.version;
    if (canUpdateWorkPackage(permissions)) {
      const updated = await api<WorkPackageRow>(`/api/v1/projects/${projectId}/work-packages/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...fields, expectedVersion: version }),
      });
      if (!updated.ok) {
        setBusy(false);
        setFormError(updated.problem.detail);
        return;
      }
      version = updated.body.version;
      if (deliverableId !== (selected.deliverableId ?? null) && canUpdateWorkPackage(permissions)) {
        if (deliverableId) {
          const associated = await api<WorkPackageRow>(
            `/api/v1/projects/${projectId}/work-packages/${selected.id}/associate`,
            {
              method: "POST",
              headers: { "Idempotency-Key": newIdempotencyKey() },
              body: JSON.stringify({ deliverableId, expectedVersion: version }),
            },
          );
          if (!associated.ok) {
            setBusy(false);
            setFormError(associated.problem.detail);
            await load();
            return;
          }
          version = associated.body.version;
        } else if (selected.deliverableId && canDisassociateWorkPackage(permissions)) {
          const dissociated = await api<WorkPackageRow>(
            `/api/v1/projects/${projectId}/work-packages/${selected.id}/disassociate`,
            {
              method: "POST",
              headers: { "Idempotency-Key": newIdempotencyKey() },
              body: JSON.stringify({ expectedVersion: version }),
            },
          );
          if (!dissociated.ok) {
            setBusy(false);
            setFormError(dissociated.problem.detail);
            await load();
            return;
          }
          version = dissociated.body.version;
        }
      }
    }
    if (canUpdateWorkPackage(permissions)) {
      const assigned = await api<WorkPackageRow>(`/api/v1/projects/${projectId}/work-packages/${selected.id}/assign`, {
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
    kind: "activate" | "unblock" | "complete" | "cancel" | "archive" | "unassign" | "disassociate",
  ) {
    if (!selected) {
      return;
    }
    const ok = await mutate(`/api/v1/projects/${projectId}/work-packages/${selected.id}/${kind}`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
      body: JSON.stringify({ expectedVersion: selected.version }),
    });
    if (ok && kind === "archive") {
      openItem(null);
    }
  }

  async function onBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const blockedReason = String(form.get("blockedReason") ?? "");
    await mutate(`/api/v1/projects/${projectId}/work-packages/${selected.id}/block`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
      body: JSON.stringify({ expectedVersion: selected.version, blockedReason }),
    });
  }

  if (loading) {
    return <StateScreen kind="loading" />;
  }
  if (errorKind) {
    return <StateScreen kind={errorKind} detail={errorDetail} />;
  }

  const inspectorOpen = creating || Boolean(selected);
  const phaseName = (phaseId: string) => phases.find((row) => row.id === phaseId)?.name ?? "—";
  const deliverableName = (deliverableId: string | null) => {
    if (!deliverableId) {
      return "Sem entrega";
    }
    const row = deliverables.find((item) => item.id === deliverableId);
    return row ? `${row.code}` : "Entrega";
  };

  return (
    <section className="deliverables-page" data-surface="work-packages">
      <header className="structure-header">
        <div>
          <h1>Pacotes de trabalho</h1>
          <p>
            Decomposição operacional da Fase/Entrega. Pacote não é Tarefa; status muda somente por transição explícita.
          </p>
        </div>
        {canCreateWorkPackage(permissions) ? (
          <button type="button" className="btn" onClick={() => openItem("new")}>
            Novo pacote
          </button>
        ) : null}
      </header>

      <div className="deliverables-toolbar" role="search">
        <label className="sr-only" htmlFor="work-package-search">
          Buscar pacotes
        </label>
        <input
          id="work-package-search"
          className="deliverables-search"
          placeholder="Buscar pacotes..."
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
          <span className="sr-only">Entrega</span>
          <select
            value={deliverableFilter}
            onChange={(event) => setDeliverableFilter(event.target.value)}
            aria-label="Filtrar por entrega"
          >
            <option value="">Entrega</option>
            {deliverables.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code}
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
            <option value="open">Abertos</option>
            <option value="all">Todos</option>
            <option value="PLANNED">Planejado</option>
            <option value="ACTIVE">Ativo</option>
            <option value="BLOCKED">Bloqueado</option>
            <option value="DONE">Concluído</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Responsável</span>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} aria-label="Filtrar por responsável">
            <option value="">Responsável</option>
            <option value="none">Sem responsável</option>
            {members
              .filter((row) => row.status === "ACTIVE")
              .map((row) => (
                <option key={row.id} value={`user:${row.id}`}>
                  {row.displayName ?? row.email}
                </option>
              ))}
            {teams.map((row) => (
              <option key={row.id} value={`team:${row.id}`}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`deliverables-layout${inspectorOpen ? " has-inspector" : ""}`}>
        {items.length === 0 ? (
          <section className="state-screen" data-state="empty" aria-live="polite">
            <h2>{filtersActive ? "Nenhum pacote neste filtro" : "Nenhum pacote"}</h2>
            <p>
              {filtersActive
                ? "Nenhum WorkPackage corresponde aos filtros atuais."
                : "Nenhum WorkPackage neste projeto. Crie o primeiro para decompor a entrega."}
            </p>
          </section>
        ) : (
          <div className="deliverables-table-wrap">
            <table className="deliverables-table">
              <caption className="sr-only">Lista de pacotes de trabalho do projeto</caption>
              <thead>
                <tr>
                  <th scope="col">Pacote</th>
                  <th scope="col">Fase / Entrega</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Prazo</th>
                  <th scope="col">Status</th>
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
                            {row.code ? `${row.code} · ` : ""}
                            {row.title}
                          </strong>
                          <span>{row.description || "Pacote operacional — não é uma tarefa"}</span>
                        </button>
                      </td>
                      <td>
                        {phaseName(row.phaseId)} · {deliverableName(row.deliverableId)}
                      </td>
                      <td>{ownerLabel(row, members, teams)}</td>
                      <td>{formatPhaseDate(row.dueAt)}</td>
                      <td>
                        <span className={`status-pill status-${row.status.toLowerCase()}`}>
                          {workPackageStatusLabel(row.status)}
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
          <Drawer open className="deliverables-inspector-shell" onClose={() => openItem(null)}>
            <aside
              className="structure-inspector"
              role="dialog"
              aria-modal="true"
              aria-labelledby="work-package-inspector-title"
            >
              {selected?.archivedAt ? (
                <p className="muted" data-state="inactive">
                  Pacote arquivado. Archive é o caminho de remoção; exclusão permanente é proibida.
                </p>
              ) : null}
              <form key={selectedId ?? "new"} onSubmit={(event) => void onSave(event)}>
                <h2 id="work-package-inspector-title">{creating ? "Novo pacote" : selected?.title}</h2>
                <p className="muted">WorkPackage ≠ Task. Datas não alteram o status. DONE é explícito e não cascateia.</p>
                {formError ? (
                  <p role="alert" className="error">
                    {formError}
                  </p>
                ) : null}
                <label htmlFor="work-package-code">
                  Código (opcional)
                  <input
                    id="work-package-code"
                    name="code"
                    defaultValue={selected?.code ?? ""}
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  />
                </label>
                <label htmlFor="work-package-title">
                  Título
                  <input
                    id="work-package-title"
                    name="title"
                    defaultValue={selected?.title ?? ""}
                    required
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  />
                </label>
                <label htmlFor="work-package-description">
                  Descrição
                  <textarea
                    id="work-package-description"
                    name="description"
                    defaultValue={selected?.description ?? ""}
                    rows={3}
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  />
                </label>
                <label htmlFor="work-package-phase">
                  Fase
                  <select
                    id="work-package-phase"
                    name="phaseId"
                    defaultValue={selected?.phaseId ?? ""}
                    required
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  >
                    <option value="">Selecionar</option>
                    {phases.map((phase) => (
                      <option key={phase.id} value={phase.id}>
                        {phase.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="work-package-deliverable">
                  Entrega (opcional, mesma Fase)
                  <select
                    id="work-package-deliverable"
                    name="deliverableId"
                    defaultValue={selected?.deliverableId ?? ""}
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  >
                    <option value="">Nenhuma</option>
                    {deliverables.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} {row.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="work-package-discipline">
                  Disciplina (opcional)
                  <select
                    id="work-package-discipline"
                    name="disciplineId"
                    defaultValue={selected?.disciplineId ?? ""}
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  >
                    <option value="">Nenhuma</option>
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
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  />
                </label>
                <label>
                  Prazo
                  <input
                    name="dueAt"
                    type="date"
                    defaultValue={isoDateInput(selected?.dueAt)}
                    disabled={!creating && !canUpdateWorkPackage(permissions)}
                  />
                </label>
                {(creating || canUpdateWorkPackage(permissions)) && (
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
                )}
                {selected ? (
                  <p className="muted">
                    Status: {workPackageStatusLabel(selected.status)}
                    {selected.status === "BLOCKED" && selected.blockedReason
                      ? ` — motivo: ${selected.blockedReason}`
                      : ""}
                    . A UI nunca substitui a autorização.
                    {selected.deliverableId ? (
                      <>
                        {" "}
                        <a
                          href={withReturnPath(
                            deliverablesDeepLink(projectId, selected.deliverableId),
                            workPackagesDeepLink(projectId, selected.id),
                          )}
                        >
                          Abrir entrega
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <div className="inspector-actions">
                  {(creating || canUpdateWorkPackage(permissions)) && (
                    <button type="submit" className="btn" disabled={busy || Boolean(selected?.archivedAt)}>
                      Salvar
                    </button>
                  )}
                  {selected && canUpdateWorkPackage(permissions) && selected.status === "PLANNED" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("activate")}>
                      Ativar
                    </button>
                  ) : null}
                  {selected && canUpdateWorkPackage(permissions) && selected.status === "BLOCKED" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("unblock")}>
                      Desbloquear
                    </button>
                  ) : null}
                  {selected && canCompleteWorkPackage(permissions) && selected.status === "ACTIVE" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("complete")}>
                      Concluir
                    </button>
                  ) : null}
                  {selected && !canCompleteWorkPackage(permissions) && selected.status === "ACTIVE" ? (
                    <p className="muted">Concluir indisponível: requer work_package.complete.</p>
                  ) : null}
                  {selected &&
                  canUpdateWorkPackage(permissions) &&
                  selected.status !== "DONE" &&
                  selected.status !== "CANCELLED" ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("cancel")}>
                      Cancelar
                    </button>
                  ) : null}
                  {selected && canUpdateWorkPackage(permissions) && (selected.ownerProjectMembershipId || selected.ownerTeamId) ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("unassign")}>
                      Remover responsável
                    </button>
                  ) : null}
                  {selected && canDisassociateWorkPackage(permissions) && selected.deliverableId ? (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => void action("disassociate")}
                    >
                      Desassociar entrega
                    </button>
                  ) : null}
                  {selected && canUpdateWorkPackage(permissions) ? (
                    <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("archive")}>
                      Arquivar
                    </button>
                  ) : null}
                  <button type="button" className="text-button" onClick={() => openItem(null)}>
                    Fechar
                  </button>
                  {returnTo ? (
                    <a className="text-button" href={returnTo}>
                      Voltar
                    </a>
                  ) : null}
                </div>
              </form>
              {selected && canUpdateWorkPackage(permissions) && selected.status === "ACTIVE" ? (
                <form className="block-reason-form" onSubmit={(event) => void onBlock(event)}>
                  <label htmlFor="work-package-block-reason">
                    Motivo do bloqueio
                    <input id="work-package-block-reason" name="blockedReason" required />
                  </label>
                  <button type="submit" className="btn secondary" disabled={busy}>
                    Bloquear
                  </button>
                </form>
              ) : null}
              {selected ? (
                <TraceabilityContextPanel
                  projectId={projectId}
                  resource="work-package"
                  resourceId={selected.id}
                  permissions={permissions}
                />
              ) : null}
            </aside>
          </Drawer>
        ) : null}
      </div>
    </section>
  );
}
