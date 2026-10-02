import type { AmberProblem, UiStateKind } from "./types";

export const SESSION_EXPIRED = "SESSION_EXPIRED";
export const SESSION_REVOKED = "SESSION_REVOKED";

const FALLBACK: AmberProblem = {
  status: 500,
  code: "INTERNAL",
  title: "Internal Server Error",
  detail: "Unexpected error",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Normalize RFC 7807 Problem Details and legacy JSON error bodies. */
export function normalizeProblem(status: number, raw: unknown): AmberProblem {
  const record = asRecord(raw);
  if (!record) {
    return {
      ...FALLBACK,
      status,
      detail: status >= 400 ? "Request failed" : FALLBACK.detail,
      code: status === 401 ? "UNAUTHENTICATED" : status === 403 ? "TENANCY_DENIED" : FALLBACK.code,
    };
  }
  const code = asString(record.code) ?? (status === 401 ? "UNAUTHENTICATED" : status === 403 ? "TENANCY_DENIED" : "HTTP_EXCEPTION");
  const blockers = Array.isArray(record.blockers)
    ? record.blockers.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    : undefined;
  return {
    status: asNumber(record.status) ?? status,
    code,
    title: asString(record.title) ?? asString(record.name) ?? "Error",
    detail: asString(record.detail) ?? asString(record.message) ?? "Request failed",
    correlationId: asString(record.correlationId),
    instance: asString(record.instance),
    reason: asString(record.reason),
    blockers: blockers?.map((item) => ({
      predecessorTaskId: asString(item.predecessorTaskId),
      status: asString(item.status),
      title: asString(item.title),
      message: asString(item.message),
    })),
  };
}

export function isSessionTerminal(problem: AmberProblem | null | undefined): boolean {
  if (!problem) {
    return false;
  }
  return (
    problem.status === 401 &&
    (problem.code === SESSION_EXPIRED || problem.code === SESSION_REVOKED || problem.code === "UNAUTHENTICATED")
  );
}

export function classifyProblem(
  problem: AmberProblem | null | undefined,
  extra?: { archived?: boolean; membershipStatus?: string | null },
): UiStateKind {
  if (extra?.archived) {
    return "inactive";
  }
  const membership = extra?.membershipStatus?.toUpperCase();
  if (membership && membership !== "ACTIVE") {
    return "inactive";
  }
  if (!problem) {
    return "error";
  }
  if (problem.status === 401) {
    if (problem.code === SESSION_EXPIRED || problem.code === SESSION_REVOKED) {
      return "expired";
    }
    return "unauthenticated";
  }
  if (problem.status === 403) {
    const detail = problem.detail.toLowerCase();
    if (detail.includes("no active organization") || detail.includes("org-switch")) {
      return "no-org";
    }
    if (detail.includes("membership is not active")) {
      return "inactive";
    }
    return "no-permission";
  }
  return "error";
}

export function userFacingMessage(kind: UiStateKind, problem?: AmberProblem | null): string {
  switch (kind) {
    case "loading":
      return "Carregando…";
    case "empty":
      return "Nenhum projeto visível nesta Organization.";
    case "no-org":
      return "Selecione uma Organization ativa para continuar.";
    case "no-project":
      return "Selecione um projeto visível para abrir o contexto.";
    case "no-permission":
      return "Você não tem permissão para acessar este recurso.";
    case "inactive":
      return "Este contexto está inativo e não pode ser usado.";
    case "unauthenticated":
      return "Entre para continuar.";
    case "expired":
      return "A sessão expirou. Entre novamente.";
    case "error":
    default:
      return problem?.detail || "Não foi possível carregar este conteúdo.";
  }
}
