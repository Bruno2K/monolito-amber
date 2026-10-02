"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import {
  calendarIdempotencyKey,
  FIGMA_CALENDAR_NODES,
  isArchivedCalendar,
  provenanceKind,
  provenanceLabel,
  type CalendarListResponse,
  type CalendarRecord,
} from "../../lib/calendar";
import { userFacingMessage } from "../../lib/errors";
import { CalendarStates } from "./CalendarStates";

export function CalendarHub() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CalendarRecord[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState("America/Sao_Paulo");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    const search = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const result = await api<CalendarListResponse>(`/api/v1/calendars${search}`);
    if (!result.ok) {
      setItems([]);
      setError(result.problem.detail || userFacingMessage("error", result.problem));
      setLoading(false);
      return;
    }
    setItems(result.body.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return items;
    }
    return items.filter((row) => row.name.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle));
  }, [items, query]);

  const grouped = useMemo(() => {
    const owned = visible.filter((row) => provenanceKind(row) === "owned" && !isArchivedCalendar(row));
    const direct = visible.filter((row) => provenanceKind(row) === "direct" && !isArchivedCalendar(row));
    const team = visible.filter((row) => provenanceKind(row) === "team" && !isArchivedCalendar(row));
    const archived = visible.filter((row) => isArchivedCalendar(row));
    return { owned, direct, team, archived };
  }, [visible]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    const result = await api<CalendarRecord>("/api/v1/calendars", {
      method: "POST",
      headers: { "Idempotency-Key": calendarIdempotencyKey("cal-create") },
      body: JSON.stringify({ name: name.trim(), description: description.trim(), timeZone }),
    });
    setCreating(false);
    if (!result.ok) {
      setCreateError(result.problem.detail || "Não foi possível criar o calendário.");
      return;
    }
    setName("");
    setDescription("");
    setStatus(`Calendário “${result.body.name}” criado como privado.`);
    await load(query);
  }

  if (loading && items.length === 0 && !error) {
    return <CalendarStates state="loading" />;
  }
  if (error && items.length === 0) {
    return <CalendarStates state="error" detail={error} onRetry={() => void load(query)} />;
  }

  return (
    <div className="calendar-hub" data-node-id={FIGMA_CALENDAR_NODES.hub}>
      <header className="structure-header">
        <div>
          <h1>Meus Calendários</h1>
          <p>Somente calendários que você possui ou que estão compartilhados agora. A organização sozinha não lista calendários privados.</p>
        </div>
        <Link className="btn secondary" href="/calendars/schedule">
          Minha Agenda
        </Link>
      </header>

      <form className="calendar-toolbar" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="sr-only" htmlFor="calendar-filter">
          Filtrar calendários autorizados
        </label>
        <input
          id="calendar-filter"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por nome"
        />
        <button type="button" className="btn secondary" onClick={() => void load(query)}>
          Atualizar
        </button>
      </form>

      <form className="calendar-create" onSubmit={(event) => void onCreate(event)}>
        <h2>Novo calendário privado</h2>
        <p>O calendário nasce só seu. Compartilhamento exige concessão explícita de usuário ou equipe.</p>
        <div className="calendar-create-grid">
          <label>
            Nome
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </label>
          <label>
            Fuso (IANA)
            <input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required />
          </label>
          <label className="calendar-create-wide">
            Descrição
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        {createError ? <p role="alert">{createError}</p> : null}
        <button type="submit" className="btn" disabled={creating || name.trim().length === 0}>
          {creating ? "Criando…" : "Criar calendário"}
        </button>
      </form>

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      {visible.length === 0 ? (
        <CalendarStates state={query.trim() ? "filtered-empty" : "empty"} />
      ) : (
        <div className="calendar-hub-groups">
          <CalendarGroup title="Seus calendários" empty="Você ainda não possui um calendário ativo." items={grouped.owned} />
          <CalendarGroup title="Compartilhados diretamente" empty="Nenhum compartilhamento direto ativo." items={grouped.direct} />
          <CalendarGroup title="Via equipe" empty="Nenhum calendário herdado de equipe." items={grouped.team} />
          <CalendarGroup title="Arquivados" empty="Nenhum calendário arquivado visível." items={grouped.archived} />
        </div>
      )}
    </div>
  );
}

function CalendarGroup({ title, empty, items }: { title: string; empty: string; items: CalendarRecord[] }) {
  return (
    <section className="calendar-group">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="project-card-list calendar-card-list">
          {items.map((row) => (
            <li key={row.id}>
              <Link className="project-card calendar-card" href={`/calendars/${row.id}`}>
                <strong>{row.name}</strong>
                <span>{provenanceLabel(row)}</span>
                <span>{isArchivedCalendar(row) ? "Arquivado" : row.timeZone}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
