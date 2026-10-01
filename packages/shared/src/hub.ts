import { OperationsStateError } from "./errors.js";
import {
  DELIVERABLE_STATUSES,
  DELIVERABLE_TERMINAL_STATUSES,
  WORK_PACKAGE_TERMINAL_STATUSES,
  type DeliverableStatus,
  type OwnershipInput,
  type PhaseStatus,
  type WorkPackageStatus,
} from "./operations.js";

/**
 * M3.6 Operational Project Hub — derived read-model contract.
 * Hub is never a second source of truth. OVERDUE is a signal, not a status.
 */

export const HUB_LIST_DEFAULT_LIMIT = 20;
export const HUB_LIST_MAX_LIMIT = 50;
export const HUB_CACHE_TTL_MS = 5_000;

export const HUB_SIGNAL_KEYS = [
  "currentPhase",
  "deliverableCountsByStatus",
  "overdueDeliverables",
  "blockedWorkPackages",
  "lateWorkPackages",
  "ownerGaps",
  "upcomingMilestones",
  "relatedSources",
  "lastMaterialActivity",
] as const;

export type HubSignalKey = (typeof HUB_SIGNAL_KEYS)[number];

export interface HubSignalMeta {
  origin: string;
  derivation: string;
}

export const HUB_SIGNAL_CATALOG: Record<HubSignalKey, HubSignalMeta> = {
  currentPhase: {
    origin: "operations.phases",
    derivation:
      "Non-archived Phase rows of the authorized Project with stored status ACTIVE, ordered by sequence ascending. Dates do not transit Phase status. Overlapping ACTIVE phases are allowed; currentPhase is the lowest sequence. Null when none are ACTIVE.",
  },
  deliverableCountsByStatus: {
    origin: "operations.deliverables.status",
    derivation:
      "COUNT of non-archived Deliverables in the authorized Project grouped by stored status. OVERDUE is not a status and is never a count key. Counts are the authorized set only — never a global database total.",
  },
  overdueDeliverables: {
    origin: "operations.deliverables.dueAt",
    derivation:
      "Signal: dueAt < now AND archivedAt IS NULL AND status NOT IN (DELIVERED, CANCELLED). Does not mutate or invent an OVERDUE status.",
  },
  blockedWorkPackages: {
    origin: "operations.work_packages.status",
    derivation:
      "Non-archived WorkPackages of the authorized Project whose stored status is BLOCKED. blockedReason is the auditable origin of the block.",
  },
  lateWorkPackages: {
    origin: "operations.work_packages.dueAt",
    derivation:
      "Signal: dueAt < now AND archivedAt IS NULL AND status NOT IN (DONE, CANCELLED). Distinct from BLOCKED. Dates do not transit WorkPackage status.",
  },
  ownerGaps: {
    origin: "operations.deliverables|work_packages ownership XOR",
    derivation:
      "Non-archived Deliverable or WorkPackage with neither ownerProjectMembershipId nor ownerTeamId (zero owners is allowed by XOR; this is a derived gap signal, not a status).",
  },
  upcomingMilestones: {
    origin: "planning.milestones",
    derivation:
      "Existing Milestone rows of the authorized Project with recorded status PLANNED and targetDate >= now, ordered by targetDate. AT_RISK/MISSED remain derived on read (ADR-016). Does not invent an M4 planner.",
  },
  relatedSources: {
    origin: "document.documents | coordination.issues | planning.tasks | governance.gates",
    derivation:
      "Summarized authorized counts/links only. documents require document.read; gates require gate.read; issues and tasks require the hub project.read grant. Unauthorized sources are omitted with no placeholder and no count.",
  },
  lastMaterialActivity: {
    origin: "audit.audit_events",
    derivation:
      "Latest append-only AuditEvent rows for the authorized Project when the caller has organization.read_audit. Omitted entirely without that grant. Hub itself writes nothing.",
  },
};

export interface HubListPage<T> {
  items: T[];
  nextCursor: string | null;
  /** Count of items in this authorized page/filter — never a global DB total. */
  returned: number;
}

export function clampHubListLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) {
    return HUB_LIST_DEFAULT_LIMIT;
  }
  const parsed = Math.trunc(limit);
  if (parsed < 1) {
    return 1;
  }
  return Math.min(parsed, HUB_LIST_MAX_LIMIT);
}

export function overdueIsDeliverableStatus(): boolean {
  return (DELIVERABLE_STATUSES as readonly string[]).includes("OVERDUE");
}

export function isDeliverableOverdueSignal(input: {
  dueAt: Date | null | undefined;
  status: DeliverableStatus | string;
  archivedAt?: Date | null;
  now?: Date;
}): boolean {
  if (!input.dueAt || input.archivedAt) {
    return false;
  }
  if ((DELIVERABLE_TERMINAL_STATUSES as readonly string[]).includes(input.status)) {
    return false;
  }
  return input.dueAt.getTime() < (input.now ?? new Date()).getTime();
}

export function isWorkPackageLateSignal(input: {
  dueAt: Date | null | undefined;
  status: WorkPackageStatus | string;
  archivedAt?: Date | null;
  now?: Date;
}): boolean {
  if (!input.dueAt || input.archivedAt) {
    return false;
  }
  if ((WORK_PACKAGE_TERMINAL_STATUSES as readonly string[]).includes(input.status)) {
    return false;
  }
  return input.dueAt.getTime() < (input.now ?? new Date()).getTime();
}

export function isOwnerGap(input: OwnershipInput): boolean {
  return !input.ownerProjectMembershipId && !input.ownerTeamId;
}

export function selectCurrentPhase<T extends { status: PhaseStatus | string; sequence: number; archivedAt?: Date | null }>(
  phases: readonly T[],
): T | null {
  const active = phases
    .filter((row) => row.status === "ACTIVE" && !row.archivedAt)
    .slice()
    .sort((a, b) => a.sequence - b.sequence || 0);
  return active[0] ?? null;
}

export function zeroFilledDeliverableCounts(
  rows: readonly { status: string; count: number }[],
): Record<DeliverableStatus, number> {
  const counts = Object.fromEntries(DELIVERABLE_STATUSES.map((status) => [status, 0])) as Record<
    DeliverableStatus,
    number
  >;
  for (const row of rows) {
    if ((DELIVERABLE_STATUSES as readonly string[]).includes(row.status)) {
      counts[row.status as DeliverableStatus] = row.count;
    }
  }
  return counts;
}

export function isHubStale(input: {
  generatedAt: Date;
  sourceMaxUpdatedAt: Date | null | undefined;
  servedFromCache: boolean;
}): boolean {
  if (!input.servedFromCache || !input.sourceMaxUpdatedAt) {
    return false;
  }
  return input.sourceMaxUpdatedAt.getTime() > input.generatedAt.getTime();
}

export function hubMutatesDomainSources(): boolean {
  return false;
}

export function hubInventedHealthStatus(): boolean {
  return false;
}

export function encodeHubCursor(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeHubCursor(cursor: string): Record<string, string> {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid");
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) {
        out[key] = value;
      }
    }
    if (Object.keys(out).length === 0) {
      throw new Error("invalid");
    }
    return out;
  } catch {
    throw new OperationsStateError("Invalid hub list cursor");
  }
}

export function relatedSourcePermission(source: "documents" | "issues" | "tasks" | "gates" | "activity"): string {
  switch (source) {
    case "documents":
      return "document.read";
    case "gates":
      return "gate.read";
    case "activity":
      return "organization.read_audit";
    case "issues":
    case "tasks":
      return "project.read";
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}
