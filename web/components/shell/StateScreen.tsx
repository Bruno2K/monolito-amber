import { userFacingMessage } from "../../lib/errors";
import type { UiStateKind } from "../../lib/types";

const TITLES: Record<UiStateKind, string> = {
  loading: "Carregando",
  error: "Não foi possível carregar",
  empty: "Nenhum projeto",
  "no-org": "Organization necessária",
  "no-project": "Projeto necessário",
  "no-permission": "Acesso negado",
  inactive: "Contexto inativo",
  unauthenticated: "Sessão necessária",
  expired: "Sessão encerrada",
};

export function StateScreen({
  kind,
  detail,
  action,
}: {
  kind: UiStateKind;
  detail?: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="state-screen" data-state={kind} aria-live={kind === "loading" ? "polite" : "assertive"}>
      <h1>{TITLES[kind]}</h1>
      <p>{detail ?? userFacingMessage(kind)}</p>
      {action ? (
        <p>
          <a className="btn" href={action.href}>
            {action.label}
          </a>
        </p>
      ) : null}
    </section>
  );
}
