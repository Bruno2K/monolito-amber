export function PlanningSkeleton() {
  return (
    <section className="planner-page" data-state="loading" aria-busy="true" aria-live="polite">
      <header className="structure-header">
        <div>
          <div className="planner-skel planner-skel-title" />
          <div className="planner-skel planner-skel-line" />
        </div>
      </header>
      <div className="planner-skel-tabs" aria-hidden="true">
        <span className="planner-skel planner-skel-tab" />
        <span className="planner-skel planner-skel-tab" />
        <span className="planner-skel planner-skel-tab" />
        <span className="planner-skel planner-skel-tab" />
      </div>
      <div className="deliverables-table-wrap planner-skel-table">
        <table className="deliverables-table">
          <caption className="sr-only">Carregando lista de planejamento</caption>
          <thead>
            <tr>
              <th scope="col">Tarefa</th>
              <th scope="col">Contexto</th>
              <th scope="col">Responsável</th>
              <th scope="col">Prazo</th>
              <th scope="col">Progresso</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {["a", "b", "c", "d", "e"].map((key) => (
              <tr key={key}>
                <td colSpan={6}>
                  <div className="planner-skel planner-skel-row" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PlanningEmpty({ filtered }: { filtered: boolean }) {
  return (
    <section className="state-screen" data-state={filtered ? "filtered-empty" : "empty"} aria-live="polite">
      <h2>{filtered ? "Nenhuma tarefa corresponde aos filtros" : "Nenhuma tarefa neste projeto"}</h2>
      <p>
        {filtered
          ? "Ajuste ou limpe os filtros. A lista só mostra registros autorizados."
          : "Ainda não há Tasks neste projeto. Use Nova Tarefa para criar a primeira."}
      </p>
    </section>
  );
}

export function PlanningError({ detail, onRetry }: { detail?: string; onRetry: () => void }) {
  return (
    <section className="state-screen" data-state="error" aria-live="assertive">
      <h1>Não foi possível carregar</h1>
      <p>{detail || "Não foi possível carregar o planejamento."}</p>
      <p>
        <button type="button" className="btn" onClick={onRetry}>
          Tentar novamente
        </button>
      </p>
    </section>
  );
}

export function PlanningComingView({ view }: { view: string }) {
  const label =
    view === "kanban" ? "Kanban" : view === "gantt" ? "Gantt" : view === "milestones" ? "Marcos" : view;
  return (
    <section className="state-screen" data-state="coming-later" aria-live="polite">
      <h2>{label} em um marco posterior</h2>
      <p>Esta aba usa o mesmo contrato de planejamento. A projeção {label} não é entregue neste marco.</p>
    </section>
  );
}
