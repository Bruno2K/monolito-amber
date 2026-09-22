import { PasswordPolicyError, PublicRegistrationDisabledError } from "./errors.js";
import {
  AUTH_LOCK_FAILED_ATTEMPTS,
  AUTH_LOCK_MINUTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_ALGORITHM,
} from "./session.js";

/** 0.2A §4–§5 AuthN floors. Argon2id required; bcrypt fallback only if unavailable. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new PasswordPolicyError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
}

export function evaluateLockout(failedAttempts: number, now = new Date()): Date | null {
  if (failedAttempts < AUTH_LOCK_FAILED_ATTEMPTS) {
    return null;
  }
  return new Date(now.getTime() + AUTH_LOCK_MINUTES * 60 * 1000);
}

export function requiredPasswordAlgorithm(): typeof PASSWORD_ALGORITHM {
  return PASSWORD_ALGORITHM;
}

export function isAccountLocked(lockedUntil: Date | null, now = new Date()): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * MVP registration is invitation/bootstrap-controlled (PF-1.1R).
 * `POST /api/v1/auth/register` may create the first User only when the instance
 * has zero users. After that, new Users are created by accepting an invitation.
 */
export function assertBootstrapRegistrationAllowed(existingUserCount: number): void {
  if (existingUserCount > 0) {
    throw new PublicRegistrationDisabledError();
  }
}
