"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { classifyProblem } from "../../lib/errors";
import {
  canLinkDeliverableDocument,
  newIdempotencyKey,
  type TraceabilityContext,
  type TraceabilityDocumentRow,
  type TraceabilityGateRow,
  type TraceabilityIssueRow,
  type TraceabilityMilestoneRow,
  type TraceabilityTaskRow,
} from "../../lib/operations";

type SectionKind = "loading" | "error" | "no-permission" | "empty" | "ready";

function sectionKind(parent: SectionKind, payload: TraceabilityContext | null, key: keyof TraceabilityContext): SectionKind {
  if (parent === "loading" || parent === "error") {
    return parent;
  }
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, key)) {
    return "no-permission";
  }
  const value = payload[key];
  if (Array.isArray(value) && value.length === 0) {
    return "empty";
  }
  return "ready";
}

function SectionState({
  kind,
  loadingLabel,
  emptyLabel,
  errorDetail,
}: {
  kind: SectionKind;
  loadingLabel: string;
  emptyLabel: string;
  errorDetail?: string;
}) {
  if (kind === "loading") {
    return (
      <p className="muted" data-state="loading" aria-busy="true">
        {loadingLabel}
      </p>
    );
  }
  if (kind === "error") {
    return (
      <p role="alert" className="error" data-state="error">
        {errorDetail ?? "Não foi possível carregar esta seção."}
      </p>
    );
  }
  if (kind === "no-permission") {
    return (
      <p className="muted" data-state="no-permission">
        Sem permissão para esta seção.
      </p>
    );
  }
  if (kind === "empty") {
    return (
      <p className="muted" data-state="empty">
        {emptyLabel}
      </p>
    );
  }
  return null;
}

export function TraceabilityContextPanel({
  projectId,
  resource,
  resourceId,
  permissions,
}: {
  projectId: string;
  resource: "deliverable" | "work-package";
  resourceId: string;
  permissions: string[];
}) {
  const [parentKind, setParentKind] = useState<SectionKind>("loading");
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [context, setContext] = useState<TraceabilityContext | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const path =
    resource === "deliverable"
      ? `/api/v1/projects/${projectId}/deliverables/${resourceId}/context`
      : `/api/v1/projects/${projectId}/work-packages/${resourceId}/context`;

  const load = useCallback(async () => {
    setParentKind("loading");
    setErrorDetail(undefined);
    const result = await api<TraceabilityContext>(path);
    if (!result.ok) {
      setContext(null);
      setParentKind(classifyProblem(result.problem) === "no-permission" ? "no-permission" : "error");
      setErrorDetail(result.problem.detail);
      return;
    }
    setContext(result.body);
    setParentKind("ready");
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const canLink = Boolean(context?.canLinkDocuments) && canLinkDeliverableDocument(permissions);
  const documentsKind = sectionKind(parentKind, context, "documents");
  const tasksKind = sectionKind(parentKind, context, "tasks");
  const milestonesKind = sectionKind(parentKind, context, "milestones");
  const issuesKind = sectionKind(parentKind, context, "issues");
  const gatesKind = sectionKind(parentKind, context, "gates");

  async function onLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resource !== "deliverable") {
      return;
    }
    const form = event.currentTarget;
    const documentId = String(new FormData(form).get("documentId") ?? "").trim();
    if (!documentId) {
      return;
    }
    setBusy(true);
    setLinkError(null);
    const result = await api(`/api/v1/projects/${projectId}/deliverables/${resourceId}/documents`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
      body: JSON.stringify({ documentId }),
    });
    setBusy(false);
    if (!result.ok) {
      setLinkError(result.problem.detail);
      return;
    }
    form.reset();
    await load();
  }

  async function onUnlink(documentId: string) {
    setBusy(true);
    setLinkError(null);
    const result = await api(
      `/api/v1/projects/${projectId}/deliverables/${resourceId}/documents/${documentId}/unlink`,
      {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setLinkError(result.problem.detail);
      return;
    }
    await load();
  }

  return (
    <div className="traceability-panel">
      <section className="traceability-section" aria-labelledby={`${resource}-docs-title`}>
        <h3 id={`${resource}-docs-title`}>Evidências (Documentos / Revisões)</h3>
        <p className="muted">Vínculo contextual. Não altera status do Documento nem bytes da Revisão.</p>
        <SectionState
          kind={documentsKind}
          loadingLabel="Carregando evidências…"
          emptyLabel="Nenhum documento ligado."
          errorDetail={errorDetail}
        />
        {documentsKind === "ready" && context?.documents ? (
          <ul className="linked-wp-list">
            {context.documents.map((row: TraceabilityDocumentRow) => (
              <li key={row.id}>
                <span>
                  {row.code} · {row.title}
                </span>
                <span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status}</span>
                {row.currentRevision ? (
                  <span className="muted">
                    {row.currentRevision.revisionCode} · {row.currentRevision.status}
                  </span>
                ) : null}
                {canLink ? (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => void onUnlink(row.id)}
                  >
                    Desvincular
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canLink && resource === "deliverable" ? (
          <form className="linked-wp-create" onSubmit={(event) => void onLink(event)}>
            <label htmlFor={`${resource}-link-document`}>
              Vincular documento (mesmo projeto)
              <input id={`${resource}-link-document`} name="documentId" required />
            </label>
            <button type="submit" className="btn secondary" disabled={busy}>
              Vincular
            </button>
          </form>
        ) : null}
        {linkError ? (
          <p role="alert" className="error">
            {linkError}
          </p>
        ) : null}
      </section>

      <section className="traceability-section" aria-labelledby={`${resource}-tasks-title`}>
        <h3 id={`${resource}-tasks-title`}>Tarefas</h3>
        <p className="muted">Task ≠ WorkPackage. Concluir a tarefa não conclui o pacote nem a entrega.</p>
        <SectionState
          kind={tasksKind}
          loadingLabel="Carregando tarefas…"
          emptyLabel="Nenhuma tarefa ligada."
          errorDetail={errorDetail}
        />
        {tasksKind === "ready" && context?.tasks ? (
          <ul className="linked-wp-list">
            {context.tasks.map((row: TraceabilityTaskRow) => (
              <li key={row.id}>
                <span>{row.title}</span>
                <span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status}</span>
                {row.progressPercent != null ? <span className="muted">{row.progressPercent}%</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="traceability-section" aria-labelledby={`${resource}-milestones-title`}>
        <h3 id={`${resource}-milestones-title`}>Marcos</h3>
        <p className="muted">ACHIEVED é explícito. AT_RISK/MISSED são derivados na leitura.</p>
        <SectionState
          kind={milestonesKind}
          loadingLabel="Carregando marcos…"
          emptyLabel="Nenhum marco ligado."
          errorDetail={errorDetail}
        />
        {milestonesKind === "ready" && context?.milestones ? (
          <ul className="linked-wp-list">
            {context.milestones.map((row: TraceabilityMilestoneRow) => (
              <li key={row.id}>
                <span>{row.title}</span>
                <span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="traceability-section" aria-labelledby={`${resource}-issues-title`}>
        <h3 id={`${resource}-issues-title`}>Issues</h3>
        <p className="muted">Issue ≠ Task. Vínculos fechados não criam Issue automaticamente.</p>
        <SectionState
          kind={issuesKind}
          loadingLabel="Carregando issues…"
          emptyLabel="Nenhuma issue ligada."
          errorDetail={errorDetail}
        />
        {issuesKind === "ready" && context?.issues ? (
          <ul className="linked-wp-list">
            {context.issues.map((row: TraceabilityIssueRow) => (
              <li key={row.id}>
                <span>{row.title}</span>
                <span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status}</span>
                <span className="muted">{row.origin}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="traceability-section" aria-labelledby={`${resource}-gates-title`}>
        <h3 id={`${resource}-gates-title`}>Gates (somente leitura)</h3>
        <p className="muted">READY ≠ RELEASED. Exception ≠ SATISFIED. Sem aprovação a partir deste inspetor.</p>
        <SectionState
          kind={gatesKind}
          loadingLabel="Carregando gates…"
          emptyLabel="Nenhum gate autorizado."
          errorDetail={errorDetail}
        />
        {gatesKind === "ready" && context?.gates ? (
          <ul className="linked-wp-list">
            {context.gates.map((row: TraceabilityGateRow) => (
              <li key={row.id}>
                <span>{row.name}</span>
                <span className={`status-pill status-${row.status.toLowerCase()}`}>{row.status}</span>
                {row.readOnly ? <span className="muted">somente leitura</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
