import { ScanFailClosedError } from "./errors.js";

/**
 * F-08 malware trust policy (Final Reconciliation) — CLOSED at specification level.
 * Vendor remains an implementation choice (OPEN). Do not skip this hook shape.
 *
 * PENDING / scan failure → fail closed (no download/preview)
 * CLEAN → eligible for authorized access
 * BLOCKED → deny + security event
 * Scanner unavailable/error for new uploads → fail closed; async retry; alert after exhaustion
 */
export const SCAN_STATUSES = ["PENDING", "CLEAN", "BLOCKED"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export type FileAccessIntent = "download" | "preview";

export interface FileTrustDecision {
  allowed: boolean;
  emitSecurityEvent: boolean;
  reason: string;
}

export function evaluateFileAccess(status: ScanStatus, intent: FileAccessIntent): FileTrustDecision {
  switch (status) {
    case "CLEAN":
      return { allowed: true, emitSecurityEvent: false, reason: `${intent} allowed: scan_status=CLEAN` };
    case "PENDING":
      return {
        allowed: false,
        emitSecurityEvent: false,
        reason: `${intent} denied: scan_status=PENDING (fail closed)`,
      };
    case "BLOCKED":
      return {
        allowed: false,
        emitSecurityEvent: true,
        reason: `${intent} denied: scan_status=BLOCKED (deny + security event)`,
      };
    default: {
      const _exhaustive: never = status;
      return {
        allowed: false,
        emitSecurityEvent: true,
        reason: `${intent} denied: unknown scan_status (fail closed): ${_exhaustive}`,
      };
    }
  }
}

export function assertFileAccessAllowed(status: ScanStatus, intent: FileAccessIntent): void {
  const decision = evaluateFileAccess(status, intent);
  if (!decision.allowed) {
    throw new ScanFailClosedError(decision.reason);
  }
}

/** New uploads when scanning is unavailable/error → fail closed (F-08). */
export function evaluateUploadWhenScannerUnavailable(): FileTrustDecision {
  return {
    allowed: false,
    emitSecurityEvent: true,
    reason: "New upload denied: malware scanner unavailable (fail closed); retry asynchronously",
  };
}

export function assertUploadWhenScannerAvailable(scannerAvailable: boolean): void {
  if (!scannerAvailable) {
    const decision = evaluateUploadWhenScannerUnavailable();
    throw new ScanFailClosedError(decision.reason);
  }
}
