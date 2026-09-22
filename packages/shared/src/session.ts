import { ReauthenticationRequiredError, SessionExpiredError, SessionRevokedError } from "./errors.js";

/** 0.2A §8 session floors — do not weaken. */
export const SESSION_INACTIVE_HOURS = 12;
export const SESSION_ABSOLUTE_DAYS = 7;
export const SESSION_INACTIVE_MS = SESSION_INACTIVE_HOURS * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000;

export interface SessionClock {
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export function isSessionRevoked(session: SessionClock, now = new Date()): boolean {
  return session.revokedAt !== null && session.revokedAt.getTime() <= now.getTime();
}

export function isSessionInactive(session: SessionClock, now = new Date()): boolean {
  return now.getTime() - session.lastSeenAt.getTime() > SESSION_INACTIVE_MS;
}

export function isSessionPastAbsolute(session: SessionClock, now = new Date()): boolean {
  return now.getTime() - session.createdAt.getTime() > SESSION_ABSOLUTE_MS || now.getTime() > session.expiresAt.getTime();
}

export function assertSessionUsable(session: SessionClock, now = new Date()): void {
  if (isSessionRevoked(session, now)) {
    throw new SessionRevokedError();
  }
  if (isSessionInactive(session, now) || isSessionPastAbsolute(session, now)) {
    throw new SessionExpiredError();
  }
}

export function absoluteExpiryFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_ABSOLUTE_MS);
}

/** Password reset / logout / membership removal must revoke subsequent use (0.2A). */
export function revokeSession(now = new Date(), reason: string): { revokedAt: Date; revokeReason: string } {
  return { revokedAt: now, revokeReason: reason };
}

export const AUTH_LOCK_FAILED_ATTEMPTS = 10;
export const AUTH_LOCK_MINUTES = 15;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const INVITE_TTL_DAYS = 7;
export const RESET_TTL_MINUTES = 30;
export const PASSWORD_ALGORITHM = "argon2id";
export const PASSWORD_FALLBACK_ALGORITHM = "bcrypt";
export const HIGH_RISK_FRESHNESS_MINUTES = 15;
export const HIGH_RISK_FRESHNESS_MS = HIGH_RISK_FRESHNESS_MINUTES * 60 * 1000;
export const MFA_CHALLENGE_TTL_MINUTES = 5;
export const LOGIN_RATE_LIMIT_MAX = 20;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_COOKIE_NAME = "amber_session";
export const SESSION_COOKIE_SAMESITE = "lax" as const;

export interface SessionFreshness {
  lastReauthAt: Date | null;
}

export function isRecentAuthentication(session: SessionFreshness, now = new Date()): boolean {
  return session.lastReauthAt !== null && now.getTime() - session.lastReauthAt.getTime() <= HIGH_RISK_FRESHNESS_MS;
}

export function assertRecentAuthentication(session: SessionFreshness, now = new Date()): void {
  if (!isRecentAuthentication(session, now)) {
    throw new ReauthenticationRequiredError();
  }
}

export function progressiveBackoffMs(failedAttempts: number): number {
  if (failedAttempts <= 0) {
    return 0;
  }
  return Math.min(100 * 2 ** Math.min(failedAttempts, 5), 2000);
}
