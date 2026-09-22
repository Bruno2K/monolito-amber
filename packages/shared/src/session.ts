import { SessionExpiredError, SessionRevokedError } from "./errors.js";

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
