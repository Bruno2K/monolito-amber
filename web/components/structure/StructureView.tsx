"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { StateScreen } from "../shell/StateScreen";
import { api } from "../../lib/api";
import { classifyProblem } from "../../lib/errors";
import {
  canCompletePhase,
  canCreatePhase,
  canUpdatePhase,
  formatPhaseDate,
  newIdempotencyKey,
  phaseStatusLabel,
  type DisciplineListResponse,
  type DisciplineRow,
  type PhaseListResponse,
  type PhaseRow,
} from "../../lib/operations";
import { useShell } from "../session/ShellProvider";
import { useInspectorEscape } from "../../lib/use-inspector-escape";
import { Drawer } from "../ui";

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

export function StructureView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useShell();
  const project = state.currentProject;
  const permissions = project?.permissions ?? [];
  const selectedId = searchParams.get("phase");

  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<"error" | "no-permission" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selected = useMemo(
    () => phases.find((row) => row.id === selectedId) ?? null,
    [phases, selectedId],
  );
  const creating = selectedId === "new";

  const openPhase = useCallback(
    (phaseId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (phaseId) {
        params.set("phase", phaseId);
      } else {
        params.delete("phase");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useInspectorEscape(Boolean(selectedId), openPhase);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    const [phaseResult, disciplineResult] = await Promise.all([
      api<PhaseListResponse>(`/api/v1/projects/${projectId}/phases`),
      api<DisciplineListResponse>(
        `/api/v1/organizations/${encodeURIComponent(project?.organizationId ?? "")}/disciplines?projectId=${encodeURIComponent(projectId)}`,
      ),
    ]);
    if (!phaseResult.ok) {
      const kind = classifyProblem(phaseResult.problem);
      setErrorKind(kind === "no-permission" ? "no-permission" : "error");
      setErrorDetail(phaseResult.problem.detail);
      setLoading(false);
      return;
    }
    setPhases(phaseResult.body.items);
    if (disciplineResult.ok) {
      setDisciplines(disciplineResult.body.items);
    } else {
      setDisciplines([]);
    }
    setLoading(false);
  }, [project?.organizationId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(
    path: string,
    init: RequestInit,
  ): Promise<boolean> {
    setBusy(true);
    setFormError(null);
    const result = await api<PhaseRow | PhaseListResponse>(path, init);
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
    const payload = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      sequence: Number(form.get("sequence")),
      plannedStartAt: String(form.get("plannedStartAt") || "") || null,
      plannedEndAt: String(form.get("plannedEndAt") || "") || null,
    };
    if (creating) {
      const created = await api<PhaseRow>(`/api/v1/projects/${projectId}/phases`, {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify(payload),
      });
      if (!created.ok) {
        setFormError(created.problem.detail);
        return;
      }
      await load();
      openPhase(created.body.id);
      return;
    }
    if (!selected) {
      return;
    }
    const ok = await mutate(`/api/v1/projects/${projectId}/phases/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...payload, expectedVersion: selected.version }),
    });
    if (ok) {
      setFormError(null);
    }
  }

  async function action(kind: "activate" | "complete" | "cancel" | "archive") {
    if (!selected) {
      return;
    }
    const ok = await mutate(`/api/v1/projects/${projectId}/phases/${selected.id}/${kind}`, {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
      body: JSON.stringify({ expectedVersion: selected.version }),
    });
    if (ok && kind === "archive") {
      openPhase(null);
    }
  }

  if (loading) {
    return <StateScreen kind="loading" />;
  }
  if (errorKind) {
    return <StateScreen kind={errorKind} detail={errorDetail} />;
  }

  const inspectorOpen = creating || Boolean(selected);

  return (
    <section className="structure-page" data-surface="structure">
      <header className="structure-header">
        <div>
          <h1>Estrutura</h1>
          <p>Phases do projeto e catálogo de Disciplines da Organization. Sem Gantt, Kanban ou planner.</p>
        </div>
        {canCreatePhase(permissions) ? (
          <button type="button" className="btn" onClick={() => openPhase("new")}>
            Nova Phase
          </button>
        ) : null}
      </header>

      <section className="discipline-context" aria-label="Disciplines da Organization">
        <h2>Disciplines</h2>
        {disciplines.length === 0 ? (
          <p className="muted">Nenhuma Discipline ativa neste contexto.</p>
        ) : (
          <ul className="discipline-chips">
            {disciplines.map((row) => (
              <li key={row.id}>
                <span className="discipline-chip">
                  <strong>{row.code}</strong> {row.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {phases.length === 0 ? (
        <section className="state-screen" data-state="empty" aria-live="polite">
          <h2>Nenhuma Phase</h2>
          <p>Nenhuma Phase neste projeto. Crie a primeira para estruturar o empreendimento.</p>
        </section>
      ) : (
        <ol className="phase-list">
          {phases.map((phase) => {
            const active = phase.id === selectedId;
            return (
              <li key={phase.id}>
                <button
                  type="button"
                  className={`phase-card${active ? " is-active" : ""}`}
                  onClick={() => openPhase(phase.id)}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="phase-sequence">{phase.sequence}</span>
                  <span className="phase-body">
                    <strong>{phase.name}</strong>
                    <span className="phase-meta">
                      {phaseStatusLabel(phase.status)} · {formatPhaseDate(phase.plannedStartAt)} →{" "}
                      {formatPhaseDate(phase.plannedEndAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {inspectorOpen ? (
        <Drawer open onClose={() => openPhase(null)}>
          <aside
            className="structure-inspector"
            role="dialog"
            aria-modal="true"
            aria-labelledby="phase-inspector-title"
          >
            <form key={selectedId ?? "new"} onSubmit={(event) => void onSave(event)}>
              <h2 id="phase-inspector-title">{creating ? "Nova Phase" : selected?.name}</h2>
              {formError ? (
                <p role="alert" className="error">
                  {formError}
                </p>
              ) : null}
              <label>
                Nome
                <input name="name" defaultValue={selected?.name ?? ""} required disabled={!creating && !canUpdatePhase(permissions)} />
              </label>
              <label>
                Descrição
                <textarea
                  name="description"
                  defaultValue={selected?.description ?? ""}
                  rows={3}
                  disabled={!creating && !canUpdatePhase(permissions)}
                />
              </label>
              <label>
                Sequência
                <input
                  name="sequence"
                  type="number"
                  defaultValue={selected?.sequence ?? (phases.reduce((max, row) => Math.max(max, row.sequence), -1) + 1)}
                  disabled={!creating && !canUpdatePhase(permissions)}
                />
              </label>
              <label>
                Início planejado
                <input
                  name="plannedStartAt"
                  type="date"
                  defaultValue={isoDateInput(selected?.plannedStartAt)}
                  disabled={!creating && !canUpdatePhase(permissions)}
                />
              </label>
              <label>
                Fim planejado
                <input
                  name="plannedEndAt"
                  type="date"
                  defaultValue={isoDateInput(selected?.plannedEndAt)}
                  disabled={!creating && !canUpdatePhase(permissions)}
                />
              </label>
              {selected ? (
                <p className="muted">
                  Status: {phaseStatusLabel(selected.status)}. Datas não alteram o status.
                </p>
              ) : null}
              <div className="inspector-actions">
                {(creating || canUpdatePhase(permissions)) && (
                  <button type="submit" className="btn" disabled={busy}>
                    Salvar
                  </button>
                )}
                {selected && canUpdatePhase(permissions) && selected.status === "PLANNED" ? (
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("activate")}>
                    Ativar
                  </button>
                ) : null}
                {selected && canCompletePhase(permissions) && selected.status === "ACTIVE" ? (
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("complete")}>
                    Concluir
                  </button>
                ) : null}
                {selected && canUpdatePhase(permissions) && (selected.status === "PLANNED" || selected.status === "ACTIVE") ? (
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("cancel")}>
                    Cancelar
                  </button>
                ) : null}
                {selected && canUpdatePhase(permissions) ? (
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => void action("archive")}>
                    Arquivar
                  </button>
                ) : null}
                <button type="button" className="text-button" onClick={() => openPhase(null)}>
                  Fechar
                </button>
              </div>
            </form>
          </aside>
        </Drawer>
      ) : null}
    </section>
  );
}
