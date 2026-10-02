"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StateScreen } from "../shell/StateScreen";
import { api } from "../../lib/api";
import { classifyProblem } from "../../lib/errors";
import { useInspectorEscape } from "../../lib/use-inspector-escape";
import {
  contextLabel,
  formatPlanningDate,
  formatProgress,
  lateExplanation,
  taskStatusLabel,
  type PlanningReadModel,
  type PlanningTaskRow,
} from "../../lib/planning";
import { type PhaseListResponse, type PhaseRow } from "../../lib/operations";
import { useShell } from "../session/ShellProvider";
import { PlanningComingView, PlanningEmpty, PlanningError, PlanningSkeleton } from "./PlanningStates";

const TABS = [
  { id: "list", label: "Lista" },
  { id: "kanban", label: "Kanban" },
  { id: "gantt", label: "Gantt" },
  { id: "milestones", label: "Marcos" },
] as const;

export function PlannerView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useShell();
  const project = state.currentProject;
  const tabsId = useId();

  const view = searchParams.get("view") || "list";
  const selectedId = searchParams.get("inspect");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [lateFilter, setLateFilter] = useState(searchParams.get("late") ?? "");
  const [phaseFilter, setPhaseFilter] = useState(searchParams.get("phaseId") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "createdAt");
  const [order, setOrder] = useState(searchParams.get("order") ?? "asc");
  const [page, setPage] = useState(Number(searchParams.get("page") ?? "1") || 1);

  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<"error" | "no-permission" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [model, setModel] = useState<PlanningReadModel | null>(null);
  const [phases, setPhases] = useState<PhaseRow[]>([]);

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if ((params.get("view") ?? "list") === "list") {
        params.delete("view");
      }
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openItem = useCallback(
    (taskId: string | null) => {
      replaceParams({ inspect: taskId });
    },
    [replaceParams],
  );

  useInspectorEscape(Boolean(selectedId), openItem);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    const search = new URLSearchParams();
    search.set("view", view === "list" ? "list" : view);
    if (query.trim()) {
      search.set("q", query.trim());
    }
    if (statusFilter) {
      search.set("status", statusFilter);
    }
    if (lateFilter) {
      search.set("late", lateFilter);
    }
    if (phaseFilter) {
      search.set("phaseId", phaseFilter);
    }
    if (sort) {
      search.set("sort", sort);
    }
    if (order) {
      search.set("order", order);
    }
    if (page > 1) {
      search.set("page", String(page));
    }
    if (selectedId) {
      search.set("inspect", selectedId);
    }
    const [planningResult, phaseResult] = await Promise.all([
      api<PlanningReadModel>(`/api/v1/projects/${projectId}/planning?${search.toString()}`),
      api<PhaseListResponse>(`/api/v1/projects/${projectId}/phases`),
    ]);
    if (!planningResult.ok) {
      const kind = classifyProblem(planningResult.problem);
      setErrorKind(kind === "no-permission" ? "no-permission" : "error");
      setErrorDetail(planningResult.problem.detail);
      setModel(null);
      setLoading(false);
      return;
    }
    setModel(planningResult.body);
    setPhases(phaseResult.ok ? phaseResult.body.items : []);
    setLoading(false);
  }, [lateFilter, order, page, phaseFilter, projectId, query, selectedId, sort, statusFilter, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    replaceParams({
      q: query.trim() || null,
      status: statusFilter || null,
      late: lateFilter || null,
      phaseId: phaseFilter || null,
      sort: sort !== "createdAt" ? sort : null,
      order: order !== "asc" ? order : null,
      page: page > 1 ? String(page) : null,
      view: view !== "list" ? view : null,
    });
    // URL write is driven by local filter state; searchParams stay the source for view/inspect.
  }, [query, statusFilter, lateFilter, phaseFilter, sort, order, page]);

  const selected = useMemo(() => {
    if (!selectedId || !model) {
      return null;
    }
    return model.inspected ?? model.tasks.find((row) => row.id === selectedId) ?? null;
  }, [model, selectedId]);

  useEffect(() => {
    if (selectedId && model && !loading && !selected) {
      replaceParams({ inspect: null });
    }
  }, [loading, model, replaceParams, selected, selectedId]);

  if (loading && !model) {
    return <PlanningSkeleton />;
  }
  if (errorKind === "no-permission") {
    return (
      <StateScreen
        kind="no-permission"
        detail={errorDetail}
        action={{ href: "/projects", label: "Voltar aos projetos visíveis" }}
      />
    );
  }
  if (errorKind) {
    return <PlanningError detail={errorDetail} onRetry={() => void load()} />;
  }
  if (!model) {
    return <PlanningSkeleton />;
  }

  const filtered = Boolean(query.trim() || statusFilter || lateFilter || phaseFilter);
  const inspectorOpen = Boolean(selected);
  const archived = Boolean(project?.archivedAt || model.project.readOnly);

  function onTab(next: string) {
    replaceParams({ view: next === "list" ? null : next });
  }

  return (
    <section className="planner-page" data-surface="planner" data-node-id="242:6526">
      <header className="structure-header">
        <div>
          <h1>Planejamento</h1>
          <p>Lista unificada do projeto. Status armazenado é explícito; atraso é derivado.</p>
        </div>
        <button type="button" className="btn" disabled aria-disabled="true" title="Criação de tarefas no próximo marco">
          Nova Tarefa
        </button>
      </header>

      {archived ? (
        <p className="planner-readonly" role="status">
          Projeto arquivado — planejamento em somente leitura.
        </p>
      ) : null}

      <div className="planner-tabs" role="tablist" aria-label="Projeções de planejamento">
        {TABS.map((tab, index) => {
          const selectedTab = (view || "list") === tab.id;
          return (
            <button
              key={tab.id}
              id={`${tabsId}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selectedTab}
              aria-controls={`${tabsId}-panel`}
              tabIndex={selectedTab ? 0 : -1}
              className={`planner-tab${selectedTab ? " is-active" : ""}`}
              onClick={() => onTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                  return;
                }
                event.preventDefault();
                const delta = event.key === "ArrowRight" ? 1 : -1;
                const next = TABS[(index + delta + TABS.length) % TABS.length];
                onTab(next.id);
                document.getElementById(`${tabsId}-${next.id}`)?.focus();
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${view || "list"}`}>
        {view !== "list" ? <PlanningComingView view={view} /> : null}

        {view === "list" ? (
          <>
            <div className="deliverables-toolbar" role="search">
              <label className="sr-only" htmlFor="planner-search">
                Buscar tarefas
              </label>
              <input
                id="planner-search"
                className="deliverables-search"
                placeholder="Buscar tarefas..."
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
              />
              <label>
                <span className="sr-only">Status armazenado</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1);
                    setStatusFilter(event.target.value);
                  }}
                  aria-label="Filtrar por status armazenado"
                >
                  <option value="">Status</option>
                  <option value="TODO">A fazer</option>
                  <option value="IN_PROGRESS">Em andamento</option>
                  <option value="BLOCKED">Bloqueada</option>
                  <option value="DONE">Concluída</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Atraso derivado</span>
                <select
                  value={lateFilter}
                  onChange={(event) => {
                    setPage(1);
                    setLateFilter(event.target.value);
                  }}
                  aria-label="Filtrar por atraso derivado"
                >
                  <option value="">Prazo</option>
                  <option value="true">Atrasadas</option>
                  <option value="false">No prazo</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Fase</span>
                <select
                  value={phaseFilter}
                  onChange={(event) => {
                    setPage(1);
                    setPhaseFilter(event.target.value);
                  }}
                  aria-label="Filtrar por fase"
                >
                  <option value="">Fase</option>
                  {phases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Ordenar</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  aria-label="Ordenar lista"
                >
                  <option value="createdAt">Criação</option>
                  <option value="title">Título</option>
                  <option value="dueDate">Prazo</option>
                  <option value="plannedStartAt">Início planejado</option>
                  <option value="status">Status</option>
                  <option value="progressPercent">Progresso</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Direção</span>
                <select value={order} onChange={(event) => setOrder(event.target.value)} aria-label="Direção da ordenação">
                  <option value="asc">Crescente</option>
                  <option value="desc">Decrescente</option>
                </select>
              </label>
            </div>

            <p className="table-count" aria-live="polite">
              {model.counts.total} autorizada{model.counts.total === 1 ? "" : "s"}
              {model.counts.late > 0 ? ` · ${model.counts.late} atrasada${model.counts.late === 1 ? "" : "s"}` : ""}
            </p>

            <div className={`deliverables-layout${inspectorOpen ? " has-inspector" : ""}`}>
              {model.tasks.length === 0 ? (
                <PlanningEmpty filtered={filtered} />
              ) : (
                <div className="deliverables-table-wrap">
                  <table className="deliverables-table planner-table">
                    <caption className="sr-only">Lista de tarefas de planejamento do projeto</caption>
                    <thead>
                      <tr>
                        <th scope="col">Tarefa</th>
                        <th scope="col">Fase / Entrega / Pacote</th>
                        <th scope="col">Responsável</th>
                        <th scope="col">Planejado / Prazo</th>
                        <th scope="col">Progresso</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.tasks.map((row) => {
                        const active = row.id === selectedId;
                        return (
                          <tr key={row.id} className={active ? "is-active" : undefined}>
                            <td>
                              <button
                                type="button"
                                className="deliverable-link"
                                onClick={() => openItem(row.id)}
                                aria-expanded={active}
                              >
                                <strong>{row.title}</strong>
                                {row.previews.issue ? (
                                  <span className="planner-issue-rel">Issue relacionada: {row.previews.issue.title}</span>
                                ) : null}
                              </button>
                            </td>
                            <td>{contextLabel(row)}</td>
                            <td className="planner-assignee">
                              {row.previews.assignee?.displayName ?? "—"}
                              {row.responsibleDisciplineId ? (
                                <span className="muted"> · {row.responsibleDisciplineId}</span>
                              ) : null}
                            </td>
                            <td>
                              {formatPlanningDate(row.plannedStartAt)} / {formatPlanningDate(row.dueDate)}
                            </td>
                            <td>{formatProgress(row.progressPercent)}</td>
                            <td>
                              <span className={`status-pill status-${row.status.toLowerCase()}`}>{taskStatusLabel(row.status)}</span>
                              {row.late ? (
                                <span className="planner-late" title={lateExplanation(row.status)}>
                                  Atrasada
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selected ? (
                <div className="structure-overlay deliverables-inspector-shell" role="presentation">
                  <button
                    type="button"
                    className="structure-backdrop"
                    aria-label="Fechar inspetor"
                    onClick={() => openItem(null)}
                  />
                  <TaskInspector row={selected} onClose={() => openItem(null)} />
                </div>
              ) : null}
            </div>

            {model.page.total > model.page.pageSize ? (
              <nav className="planner-pager" aria-label="Paginação do planejamento">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Anterior
                </button>
                <span>
                  Página {model.page.page} de {Math.max(1, Math.ceil(model.page.total / model.page.pageSize))}
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={page * model.page.pageSize >= model.page.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Seguinte
                </button>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function TaskInspector({ row, onClose }: { row: PlanningTaskRow; onClose: () => void }) {
  return (
    <aside className="structure-inspector" role="dialog" aria-modal="true" aria-labelledby="planner-inspect-title">
      <header className="inspector-header">
        <div>
          <p className="muted">Tarefa</p>
          <h2 id="planner-inspect-title">{row.title}</h2>
        </div>
        <button type="button" className="btn secondary" onClick={onClose}>
          Fechar
        </button>
      </header>
      <p>
        Status armazenado: <span className={`status-pill status-${row.status.toLowerCase()}`}>{taskStatusLabel(row.status)}</span>
      </p>
      {row.late ? (
        <p className="planner-late-explain" role="status">
          <strong>Atrasada (derivado).</strong> {lateExplanation(row.status)}
        </p>
      ) : (
        <p className="muted">Não atrasada. Lateness é derivada do prazo e não altera o status.</p>
      )}
      {row.previews.issue ? (
        <p>
          <span className="planner-issue-rel">Issue relacionada</span>: {row.previews.issue.title} ({row.previews.issue.status}).
          A Issue não é esta Tarefa.
        </p>
      ) : row.issueId ? (
        <p className="muted">Issue ligada omitida — sem pré-visualização autorizada.</p>
      ) : null}
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
          <dd>
            {row.previews.milestone
              ? `${row.previews.milestone.title} (${row.previews.milestone.status})`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Responsável</dt>
          <dd>{row.previews.assignee?.displayName ?? "—"}</dd>
        </div>
        <div>
          <dt>Disciplina</dt>
          <dd>{row.responsibleDisciplineId ?? "—"}</dd>
        </div>
        <div>
          <dt>Início planejado</dt>
          <dd>{formatPlanningDate(row.plannedStartAt)}</dd>
        </div>
        <div>
          <dt>Prazo</dt>
          <dd>{formatPlanningDate(row.dueDate)}</dd>
        </div>
        <div>
          <dt>Progresso</dt>
          <dd>{formatProgress(row.progressPercent)}</dd>
        </div>
      </dl>
      {row.blockedReason ? <p>Motivo do bloqueio: {row.blockedReason}</p> : null}
    </aside>
  );
}
