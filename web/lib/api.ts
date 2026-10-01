import { normalizeProblem } from "./errors";
import type { ApiResult } from "./types";

export type { SessionView } from "./types";

function apiOrigin(): string {
  if (typeof window === "undefined") {
    return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
  }
  return "";
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(`${apiOrigin()}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const raw = await parseBody(response);
  if (response.status >= 400) {
    return {
      ok: false,
      status: response.status,
      body: raw as T,
      problem: normalizeProblem(response.status, raw),
    };
  }
  return { ok: true, status: response.status, body: raw as T, problem: null };
}

/** @deprecated Prefer `api()` which returns normalized Problem Details. */
export async function apiLegacy<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const result = await api<T>(path, init);
  return { status: result.status, body: (result.body ?? {}) as T };
}

export const apiBase = "";
