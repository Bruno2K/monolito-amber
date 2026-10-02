import { isSessionTerminal } from "./errors";
import type { AmberProblem, SessionView } from "./types";

const SAFE_NEXT = /^\/(projects|org-switch|calendars|messages)(\/|$)/;

export function postAuthDestination(session: SessionView): string {
  if (!session.authenticated) {
    return "/sign-in";
  }
  if (session.mfa?.required && !session.mfa.enrolled) {
    return "/mfa/enroll";
  }
  if (session.status === "mfa_required" && session.mfaToken) {
    return `/mfa/challenge?token=${encodeURIComponent(session.mfaToken)}`;
  }
  if (!session.activeOrganizationId) {
    return "/org-switch";
  }
  return "/projects";
}

/** Usability-only next-path. Never treats the URL as tenant authority. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return null;
  }
  if (!SAFE_NEXT.test(raw)) {
    return null;
  }
  return raw;
}

export function destinationAfterAuth(session: SessionView, next?: string | null): string {
  const fallback = postAuthDestination(session);
  if (fallback !== "/projects") {
    return fallback;
  }
  return safeNextPath(next) ?? fallback;
}

export function signInPathForExpiry(): string {
  return "/sign-in";
}

export function shouldForceOrgSwitch(session: SessionView): boolean {
  return session.authenticated && !session.activeOrganizationId;
}

export function shouldForceSignIn(session: SessionView, problem?: AmberProblem | null): boolean {
  if (isSessionTerminal(problem ?? null)) {
    return true;
  }
  return !session.authenticated;
}

/**
 * Client-supplied org/project identifiers are routing hints only.
 * UI context always prefers the session-bound Organization.
 */
export function authoritativeOrganizationId(input: {
  sessionOrgId: string | null | undefined;
  clientOrgId?: string | null;
}): string | null {
  void input.clientOrgId;
  return input.sessionOrgId ?? null;
}

export function hasProjectRead(permissions: string[] | undefined): boolean {
  return Boolean(permissions?.includes("project.read"));
}
