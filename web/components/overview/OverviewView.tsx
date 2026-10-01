"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StateScreen } from "../shell/StateScreen";
import { api } from "../../lib/api";
import { classifyProblem } from "../../lib/errors";
import {
  hubItemLabel,
  relatedSourceKeys,
  type HubListItem,
  type ProjectHubResponse,
} from "../../lib/hub";
import { deliverableStatusLabel, formatPhaseDate, phaseStatusLabel, workPackageStatusLabel } from "../../lib/operations";
import { useShell } from "../session/ShellProvider";

function SignalList({
  items,
  empty,
}: {
  items: HubListItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <p className="muted" data-state="empty">
        {empty}
      </p>
    );
  }
  return (
    <ul className="hub-list">
      {items.map((item) => (
        <li key={`${item.kind ?? "row"}-${item.id}`}>
          {item.href?.ui ? (
            <Link href={item.href.ui}>{hubItemLabel(item)}</Link>
          ) : (
            <span>{hubItemLabel(item)}</span>
          )}
          <span className={`status-pill status-${item.status.toLowerCase()}`}>
            {item.kind === "WORK_PACKAGE" ? workPackageStatusLabel(item.status) : deliverableStatusLabel(item.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OverviewView({ projectId }: { projectId: string }) {
  const { state } = useShell();
  const project = state.currentProject;
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<"error" | "no-permission" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [hub, setHub] = useState<ProjectHubResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    const result = await api<ProjectHubResponse>(`/api/v1/projects/${projectId}/hub`);
    if (!result.ok) {
      const kind = classifyProblem(result.problem);
      setErrorKind(kind === "no-permission" ? "no-permission" : "error");
      setErrorDetail(result.problem.detail);
      setHub(null);
      setLoading(false);
      return;
    }
    setHub(result.body);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <StateScreen kind="loading" />;
  }
  if (errorKind) {
    return <StateScreen kind={errorKind} detail={errorDetail} />;
  }
  if (!hub) {
    return <StateScreen kind="empty" detail="Nenhum sinal operacional autorizado neste projeto." />;
  }

  const counts = hub.deliverableCountsByStatus.counts;
  const totalDeliverables = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const related = relatedSourceKeys(hub.relatedSources.sources);
  const attention = [...hub.overdueDeliverables.items, ...hub.blockedWorkPackages.items, ...hub.lateWorkPackages.items];

  return (
    <section className="hub-page" data-surface="overview">
      <header className="structure-header">
        <div>
          <h1>Visão Geral</h1>
          <p>
            Hub operacional derivado do Projeto autorizado. Cada cartão explica origem e regra — isto não é uma segunda
            fonte da verdade.
          </p>
        </div>
        <p className="hub-links">
          <Link className="btn secondary" href={hub.links.structure}>
            Estrutura
          </Link>
          <Link className="btn" href={hub.links.deliverables}>
            Entregas
          </Link>
          <Link className="btn secondary" href={hub.links.workPackages}>
            Pacotes
          </Link>
        </p>
      </header>

      {hub.stale || hub.freshness.stale ? (
        <p className="hub-stale" role="status" data-state="stale">
          Sinalização pode estar defasada em relação às fontes. Recarregue para atualizar o modelo de leitura.
        </p>
      ) : null}

      <div className="hub-grid">
        <article className="hub-card" aria-labelledby="hub-context">
          <h2 id="hub-context">Projeto e fase</h2>
          <p className="hub-origin">{hub.currentPhase.origin}</p>
          <p>
            <strong>{hub.project.name}</strong>
          </p>
          {hub.currentPhase.value ? (
            <p>
              Fase atual:{" "}
              <Link href={hub.currentPhase.value.href.ui}>{hub.currentPhase.value.name}</Link>{" "}
              <span className={`status-pill status-${hub.currentPhase.value.status.toLowerCase()}`}>
                {phaseStatusLabel(hub.currentPhase.value.status)}
              </span>
              <span className="muted"> · {formatPhaseDate(hub.currentPhase.value.plannedEndAt)}</span>
            </p>
          ) : (
            <p className="muted" data-state="empty">
              Nenhuma fase ACTIVE neste projeto.
            </p>
          )}
          <p className="sr-only">{hub.currentPhase.derivation}</p>
        </article>

        <article className="hub-card" aria-labelledby="hub-progress">
          <h2 id="hub-progress">Progresso das entregas</h2>
          <p className="hub-origin">{hub.deliverableCountsByStatus.origin}</p>
          {totalDeliverables === 0 ? (
            <p className="muted" data-state="empty">
              Nenhuma entrega autorizada neste projeto.
            </p>
          ) : (
            <ul className="hub-counts">
              {Object.entries(counts).map(([status, count]) => (
                <li key={status}>
                  <span className={`status-pill status-${status.toLowerCase()}`}>{deliverableStatusLabel(status)}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="sr-only">{hub.deliverableCountsByStatus.derivation}</p>
        </article>

        <article className="hub-card" aria-labelledby="hub-attention">
          <h2 id="hub-attention">Bloqueados e atenção</h2>
          <p className="hub-origin">
            {hub.overdueDeliverables.origin} · {hub.blockedWorkPackages.origin}
          </p>
          <SignalList items={attention} empty="Nenhum item atrasado ou BLOCKED no conjunto autorizado." />
        </article>

        <article className="hub-card" aria-labelledby="hub-owners">
          <h2 id="hub-owners">Lacunas de responsabilidade</h2>
          <p className="hub-origin">{hub.ownerGaps.origin}</p>
          <SignalList items={hub.ownerGaps.items} empty="Nenhuma entrega ou pacote sem responsável." />
        </article>

        <article className="hub-card" aria-labelledby="hub-milestones">
          <h2 id="hub-milestones">Próximos marcos</h2>
          <p className="hub-origin">{hub.upcomingMilestones.origin}</p>
          {hub.upcomingMilestones.returned === 0 ? (
            <p className="muted" data-state="empty">
              Nenhum marco existente autorizado à frente.
            </p>
          ) : (
            <ul className="hub-list">
              {hub.upcomingMilestones.items.map((item) => (
                <li key={item.id}>
                  <span>{item.title}</span>
                  <span className="status-pill">{item.derivedStatus}</span>
                  <span className="muted">{formatPhaseDate(item.targetDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        {hub.lastMaterialActivity ? (
          <article className="hub-card" aria-labelledby="hub-activity">
            <h2 id="hub-activity">Atividade recente</h2>
            <p className="hub-origin">{hub.lastMaterialActivity.origin}</p>
            {hub.lastMaterialActivity.returned === 0 ? (
              <p className="muted" data-state="empty">
                Sem eventos de auditoria recentes neste projeto.
              </p>
            ) : (
              <ul className="hub-list">
                {hub.lastMaterialActivity.items.map((item) => (
                  <li key={item.id}>
                    <span>{item.eventType}</span>
                    <span className="muted">{item.resourceType}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : null}
      </div>

      {related.length > 0 ? (
        <section className="hub-related" aria-labelledby="hub-related">
          <h2 id="hub-related">Fontes relacionadas (autorizadas)</h2>
          <ul className="hub-related-list">
            {hub.relatedSources.sources.documents ? (
              <li>Documentos: {hub.relatedSources.sources.documents.count}</li>
            ) : null}
            {hub.relatedSources.sources.issues ? <li>Pendências: {hub.relatedSources.sources.issues.count}</li> : null}
            {hub.relatedSources.sources.tasks ? <li>Tarefas: {hub.relatedSources.sources.tasks.count}</li> : null}
            {hub.relatedSources.sources.gates ? <li>Gates: {hub.relatedSources.sources.gates.count}</li> : null}
          </ul>
          <p className="sr-only">{hub.relatedSources.derivation}</p>
        </section>
      ) : null}

      <p className="muted hub-project-meta">{project?.name ? `Contexto: ${project.name}` : null}</p>
    </section>
  );
}
