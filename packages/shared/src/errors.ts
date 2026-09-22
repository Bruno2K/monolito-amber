export class AmberError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AmberError";
    this.code = code;
    this.status = status;
  }
}

export class DenyByDefaultError extends AmberError {
  constructor(detail = "Authorization denied: missing or invalid tenant binding") {
    super("TENANCY_DENIED", detail, 403);
    this.name = "DenyByDefaultError";
  }
}

export class SessionRevokedError extends AmberError {
  constructor(detail = "Session has been revoked") {
    super("SESSION_REVOKED", detail, 401);
    this.name = "SessionRevokedError";
  }
}

export class SessionExpiredError extends AmberError {
  constructor(detail = "Session has expired") {
    super("SESSION_EXPIRED", detail, 401);
    this.name = "SessionExpiredError";
  }
}

export class OptimisticLockError extends AmberError {
  constructor(detail = "Optimistic lock conflict") {
    super("OPTIMISTIC_LOCK", detail, 409);
    this.name = "OptimisticLockError";
  }
}

export class IdempotencyConflictError extends AmberError {
  constructor(detail = "Idempotency-Key reused with a different request body") {
    super("IDEMPOTENCY_CONFLICT", detail, 409);
    this.name = "IdempotencyConflictError";
  }
}

export class ScanFailClosedError extends AmberError {
  constructor(detail: string) {
    super("SCAN_FAIL_CLOSED", detail, 403);
    this.name = "ScanFailClosedError";
  }
}

export class ForbiddenPermissionError extends AmberError {
  constructor(code: string) {
    super(
      "FORBIDDEN_PERMISSION",
      `Permission '${code}' is not in the closed 0.2A catalog (or is explicitly forbidden)`,
      500,
    );
    this.name = "ForbiddenPermissionError";
  }
}

export class SodViolationError extends AmberError {
  constructor(detail: string) {
    super("SOD_VIOLATION", detail, 403);
    this.name = "SodViolationError";
  }
}

export class AuditMutationDeniedError extends AmberError {
  constructor(operation: "UPDATE" | "DELETE") {
    super(
      "AUDIT_IMMUTABLE",
      `Audit events are insert-only; ${operation} is denied for application credentials (F-09)`,
      403,
    );
    this.name = "AuditMutationDeniedError";
  }
}

export class InvalidCredentialsError extends AmberError {
  constructor(detail = "Invalid email or password") {
    super("INVALID_CREDENTIALS", detail, 401);
    this.name = "InvalidCredentialsError";
  }
}

export class PasswordPolicyError extends AmberError {
  constructor(detail: string) {
    super("PASSWORD_POLICY", detail, 400);
    this.name = "PasswordPolicyError";
  }
}

export class RateLimitedError extends AmberError {
  constructor(detail = "Too many attempts. Try again later.") {
    super("RATE_LIMITED", detail, 429);
    this.name = "RateLimitedError";
  }
}

export class MembershipStateError extends AmberError {
  constructor(detail: string) {
    super("MEMBERSHIP_STATE", detail, 409);
    this.name = "MembershipStateError";
  }
}

export class MfaRequiredError extends AmberError {
  constructor(detail = "Multi-factor authentication is required") {
    super("MFA_REQUIRED", detail, 401);
    this.name = "MfaRequiredError";
  }
}

export class MfaChallengeError extends AmberError {
  constructor(detail = "Invalid or expired MFA challenge") {
    super("MFA_CHALLENGE", detail, 401);
    this.name = "MfaChallengeError";
  }
}

export class ReauthenticationRequiredError extends AmberError {
  constructor(detail = "Recent authentication is required for this action") {
    super("REAUTH_REQUIRED", detail, 401);
    this.name = "ReauthenticationRequiredError";
  }
}

export class InvitationError extends AmberError {
  constructor(detail: string, status = 400) {
    super("INVITATION", detail, status);
    this.name = "InvitationError";
  }
}

export class PublicRegistrationDisabledError extends AmberError {
  constructor(
    detail = "Public self-registration is disabled. New users join by organization invitation, or via first-instance bootstrap when no users exist.",
  ) {
    super("REGISTRATION_DISABLED", detail, 403);
    this.name = "PublicRegistrationDisabledError";
  }
}
