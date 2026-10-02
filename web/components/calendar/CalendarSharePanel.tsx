"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import {
  calendarIdempotencyKey,
  canAdminGrants,
  classifyCalendarHttp,
  type CalendarSurfaceState,
  FIGMA_CALENDAR_NODES,
  grantDisplayName,
  inheritedGrantNotEditable,
  revokeEffectCopy,
  viewerEditorCapabilityCopy,
  type CalendarGrantListResponse,
  type CalendarGrantRecord,
  type CalendarRecord,
  type CalendarShareTarget,
  type CalendarGrantRole,
} from "../../lib/calendar";
import { CalendarStates } from "./CalendarStates";

export function CalendarSharePanel({ calendarId }: { calendarId: string }) {
  const [calendar, setCalendar] = useState<CalendarRecord | null>(null);
  const [grants, setGrants] = useState<CalendarGrantRecord[]>([]);
  const [targets, setTargets] = useState<CalendarShareTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<CalendarSurfaceState>("ready");
  const [detail, setDetail] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<CalendarGrantRole>("VIEWER");
  const [selected, setSelected] = useState<CalendarShareTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<null | { grant: CalendarGrantRecord; action: "revoke" | "role"; role?: CalendarGrantRole }>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const meta = await api<CalendarRecord>(`/api/v1/calendars/${calendarId}`);
    if (!meta.ok) {
      setCalendar(null);
      setState(classifyCalendarHttp(meta.status, meta.problem));
      setDetail(meta.problem.detail);
      setLoading(false);
      return;
    }
    setCalendar(meta.body);
    const grantRes = await api<CalendarGrantListResponse>(`/api/v1/calendars/${calendarId}/grants`);
    if (!grantRes.ok) {
      setState(classifyCalendarHttp(grantRes.status, grantRes.problem));
      setDetail(grantRes.problem.detail);
      setLoading(false);
      return;
    }
    setGrants(grantRes.body.items ?? []);
    if (canAdminGrants(meta.body)) {
      const targetRes = await api<{ items: CalendarShareTarget[] }>(`/api/v1/calendars/${calendarId}/share-targets${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
      setTargets(targetRes.ok ? targetRes.body.items ?? [] : []);
    } else {
      setTargets([]);
    }
    setState(meta.body.status === "ARCHIVED" ? "archived" : "ready");
    setLoading(false);
  }, [calendarId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const actorIsOwner = calendar?.effectiveRole === "OWNER";
  const visibleGrants = useMemo(() => grants.filter((row) => !row.revokedAt), [grants]);

  async function onShare(event: FormEvent) {
    event.preventDefault();
    if (!calendar || !selected || !canAdminGrants(calendar)) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api<CalendarGrantRecord>(`/api/v1/calendars/${calendar.id}/grants`, {
      method: "POST",
      headers: { "Idempotency-Key": calendarIdempotencyKey("cal-grant") },
      body: JSON.stringify({
        principalKind: selected.principalKind,
        organizationMembershipId: selected.organizationMembershipId,
        teamId: selected.teamId,
        role,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem.detail || "Não foi possível compartilhar.");
      return;
    }
    setSelected(null);
    setStatus(`Concessão ${role} criada.`);
    await load();
  }

  async function confirmPending() {
    if (!calendar || !pending) {
      return;
    }
    setBusy(true);
    setError(null);
    const result =
      pending.action === "revoke"
        ? await api(`/api/v1/calendars/${calendar.id}/grants/${pending.grant.id}`, {
            method: "DELETE",
            headers: { "Idempotency-Key": calendarIdempotencyKey("cal-revoke") },
          })
        : await api(`/api/v1/calendars/${calendar.id}/grants/${pending.grant.id}`, {
            method: "PATCH",
            body: JSON.stringify({ role: pending.role }),
          });
    setBusy(false);
    if (!result.ok) {
      setError(result.problem.detail || "Não foi possível atualizar a concessão.");
      return;
    }
    setStatus(pending.action === "revoke" ? "Concessão revogada." : `Papel alterado para ${pending.role}.`);
    setPending(null);
    await load();
    restoreFocus.current?.focus();
  }

  if (loading && !calendar) {
    return <CalendarStates state="loading" />;
  }
  if (state !== "ready" && state !== "archived") {
    return <CalendarStates state={state} detail={detail} action={{ href: "/calendars", label: "Voltar aos calendários" }} />;
  }
  if (!calendar) {
    return <CalendarStates state="revoked" action={{ href: "/calendars", label: "Voltar aos calendários" }} />;
  }

  return (
    <div className="calendar-share" data-node-id={FIGMA_CALENDAR_NODES.share}>
      <header className="structure-header">
        <div>
          <h1>Compartilhar {calendar.name}</h1>
          <p>O proprietário não é uma linha de concessão. Visualizador e Editor são concessões explícitas de usuário ou equipe.</p>
        </div>
        <Link className="btn secondary" href={`/calendars/${calendar.id}`}>
          Voltar ao calendário
        </Link>
      </header>

      <section className="calendar-share-owner">
        <h2>Proprietário</h2>
        <p>Acesso intrínseco. Não pode ser concedido nem revogado por uma linha de grant.</p>
      </section>

      {canAdminGrants(calendar) ? (
        <form className="calendar-share-form" onSubmit={(event) => void onShare(event)}>
          <h2>Nova concessão</h2>
          <p>{viewerEditorCapabilityCopy(role)}</p>
          <label>
            Buscar pessoa ou equipe
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome ou e-mail"
            />
          </label>
          <ul className="calendar-target-list">
            {targets.map((target) => {
              const key = `${target.principalKind}-${target.organizationMembershipId ?? target.teamId}`;
              const active =
                selected?.principalKind === target.principalKind &&
                selected.organizationMembershipId === target.organizationMembershipId &&
                selected.teamId === target.teamId;
              return (
                <li key={key}>
                  <button type="button" className={active ? "calendar-target is-active" : "calendar-target"} onClick={() => setSelected(target)}>
                    <strong>{target.displayName}</strong>
                    <span>
                      {target.principalKind === "TEAM" ? "Equipe" : target.email}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <label>
            Papel
            <select value={role} onChange={(event) => setRole(event.target.value as CalendarGrantRole)}>
              <option value="VIEWER">Visualizador</option>
              <option value="EDITOR">Editor</option>
            </select>
          </label>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn" disabled={busy || !selected}>
            Compartilhar
          </button>
        </form>
      ) : (
        <p className="muted">Somente o proprietário ativo administra concessões. Editor não compartilha nem arquiva.</p>
      )}

      <section>
        <h2>Caminhos visíveis</h2>
        <ul className="calendar-grant-list">
          {visibleGrants.length === 0 ? <li className="muted">Nenhuma concessão ativa além do proprietário.</li> : null}
          {visibleGrants.map((grant) => {
            const inherited = inheritedGrantNotEditable({ actorIsOwner: Boolean(actorIsOwner), grant }) || grant.principalKind === "TEAM" && !actorIsOwner;
            const label = grantDisplayName(grant, targets);
            const kindLabel = grant.principalKind === "TEAM" ? "Equipe" : "Usuário direto";
            const inheritedLabel = !actorIsOwner && grant.principalKind === "TEAM" ? "Acesso herdado via equipe" : kindLabel;
            return (
              <li key={grant.id} className="calendar-grant-row">
                <div>
                  <strong>{label}</strong>
                  <span>
                    {inheritedLabel} · {grant.role === "EDITOR" ? "Editor" : "Visualizador"}
                  </span>
                </div>
                {actorIsOwner && canAdminGrants(calendar) ? (
                  <div className="inspector-actions">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={(click) => {
                        restoreFocus.current = click.currentTarget;
                        setPending({ grant, action: "role", role: grant.role === "EDITOR" ? "VIEWER" : "EDITOR" });
                      }}
                    >
                      {grant.role === "EDITOR" ? "Tornar visualizador" : "Tornar editor"}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={(click) => {
                        restoreFocus.current = click.currentTarget;
                        setPending({ grant, action: "revoke" });
                      }}
                    >
                      Revogar
                    </button>
                  </div>
                ) : (
                  <span className="muted">{inherited ? "Não editável diretamente" : "Somente leitura"}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div role="status" aria-live="polite">
        {status}
      </div>

      {pending ? (
        <div className="calendar-confirm" role="dialog" aria-labelledby="calendar-revoke-title">
          <h2 id="calendar-revoke-title">{pending.action === "revoke" ? "Revogar concessão" : "Alterar papel"}</h2>
          <p>{pending.action === "revoke" ? revokeEffectCopy({ remainingRole: null, principalLabel: grantDisplayName(pending.grant, targets) }) : viewerEditorCapabilityCopy(pending.role ?? "VIEWER")}</p>
          <p>Outros caminhos válidos permanecem. Revogar um caminho de equipe não remove um compartilhamento direto.</p>
          <div className="inspector-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setPending(null);
                restoreFocus.current?.focus();
              }}
            >
              Cancelar
            </button>
            <button type="button" className="btn" onClick={() => void confirmPending()} disabled={busy}>
              Confirmar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
