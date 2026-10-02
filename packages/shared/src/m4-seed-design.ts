/**
 * Deterministic M4 Local RC Planning fixtures. Synthetic identities only.
 * Writer: prisma/m4-seed.ts, invoked from AMBER_SEED_M3=1 after the M3 dataset.
 * No production credentials. No PII. Resettable / idempotent.
 */

export const M4_SEED_EMAIL_DOMAIN = "amber.test";

export interface SeedIssue {
  key: string;
  projectKey: string;
  title: string;
  status: "OPEN";
  origin: "MANUAL";
  severity: "HIGH";
  priority: "NORMAL";
}

export interface SeedMilestone {
  key: string;
  projectKey: string;
  title: string;
  status: "PLANNED" | "ACHIEVED" | "CANCELLED";
  targetDate: string | null;
  phaseKey?: string;
  deliverableKey?: string;
}

export interface SeedTask {
  key: string;
  projectKey: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
  dueDate?: string | null;
  plannedStartAt?: string | null;
  progressPercent?: number | null;
  blockedReason?: string | null;
  assigneeUserKey?: string;
  issueKey?: string;
  milestoneKey?: string;
  phaseKey?: string;
  deliverableKey?: string;
  workPackageKey?: string;
}

export interface SeedDependency {
  key: string;
  predecessorKey: string;
  successorKey: string;
  type: "FINISH_TO_START";
}

export const M4_SEED_ISSUES: readonly SeedIssue[] = [
  {
    key: "iss-a1-grid",
    projectKey: "project-a1",
    title: "Seed grid clash",
    status: "OPEN",
    origin: "MANUAL",
    severity: "HIGH",
    priority: "NORMAL",
  },
];

export const M4_SEED_MILESTONES: readonly SeedMilestone[] = [
  {
    key: "ms-a1-planned",
    projectKey: "project-a1",
    title: "Seed Concept freeze",
    status: "PLANNED",
    targetDate: "2099-03-01T00:00:00.000Z",
    phaseKey: "phase-a1-planned",
    deliverableKey: "del-a1-planned-user",
  },
  {
    key: "ms-a1-risk",
    projectKey: "project-a1",
    title: "Seed risk checkpoint",
    status: "PLANNED",
    targetDate: "2099-06-01T00:00:00.000Z",
  },
  {
    key: "ms-a1-missed",
    projectKey: "project-a1",
    title: "Seed missed checkpoint",
    status: "PLANNED",
    targetDate: "2001-01-01T00:00:00.000Z",
  },
  {
    key: "ms-a1-achieved",
    projectKey: "project-a1",
    title: "Seed achieved checkpoint",
    status: "ACHIEVED",
    targetDate: "2025-06-01T00:00:00.000Z",
  },
  {
    key: "ms-a1-cancelled",
    projectKey: "project-a1",
    title: "Seed cancelled checkpoint",
    status: "CANCELLED",
    targetDate: "2026-12-01T00:00:00.000Z",
  },
  {
    key: "ms-b1-planned",
    projectKey: "project-b1",
    title: "Seed Beta freeze",
    status: "PLANNED",
    targetDate: "2099-04-01T00:00:00.000Z",
  },
];

export const M4_SEED_TASKS: readonly SeedTask[] = [
  {
    key: "task-a1-todo",
    projectKey: "project-a1",
    title: "Seed outline programme",
    status: "TODO",
    plannedStartAt: "2026-10-06T00:00:00.000Z",
    dueDate: "2099-02-01T00:00:00.000Z",
    progressPercent: 10,
    assigneeUserKey: "coord-a",
    issueKey: "iss-a1-grid",
    milestoneKey: "ms-a1-planned",
    phaseKey: "phase-a1-planned",
    deliverableKey: "del-a1-planned-user",
    workPackageKey: "wp-planned",
  },
  {
    key: "task-a1-progress",
    projectKey: "project-a1",
    title: "Seed framing in progress",
    status: "IN_PROGRESS",
    plannedStartAt: "2026-09-01T00:00:00.000Z",
    dueDate: "2099-04-01T00:00:00.000Z",
    progressPercent: 40,
    assigneeUserKey: "contributor-a",
    phaseKey: "phase-a1-active",
    deliverableKey: "del-a1-progress-team",
    workPackageKey: "wp-active",
  },
  {
    key: "task-a1-blocked",
    projectKey: "project-a1",
    title: "Seed blocked connection schedule",
    status: "BLOCKED",
    blockedReason: "Waiting for architect grid freeze",
    dueDate: "2099-05-01T00:00:00.000Z",
    assigneeUserKey: "discipline-a",
    phaseKey: "phase-a1-active",
    deliverableKey: "del-a1-progress-team",
    workPackageKey: "wp-blocked",
  },
  {
    key: "task-a1-done",
    projectKey: "project-a1",
    title: "Seed survey complete",
    status: "DONE",
    plannedStartAt: "2026-08-01T00:00:00.000Z",
    dueDate: "2026-08-15T00:00:00.000Z",
    progressPercent: 100,
    assigneeUserKey: "coord-a",
  },
  {
    key: "task-a1-cancelled",
    projectKey: "project-a1",
    title: "Seed cancelled option study",
    status: "CANCELLED",
    phaseKey: "phase-a1-active",
    deliverableKey: "del-a1-review-none",
    workPackageKey: "wp-cancelled",
  },
  {
    key: "task-a1-late",
    projectKey: "project-a1",
    title: "Seed late drawing",
    status: "TODO",
    dueDate: "2000-01-01T00:00:00.000Z",
    milestoneKey: "ms-a1-risk",
  },
  {
    key: "task-a1-pred-open",
    projectKey: "project-a1",
    title: "Seed open predecessor",
    status: "TODO",
    dueDate: "2099-07-01T00:00:00.000Z",
  },
  {
    key: "task-a1-succ-blocked",
    projectKey: "project-a1",
    title: "Seed successor waiting",
    status: "TODO",
    plannedStartAt: "2026-10-10T00:00:00.000Z",
    dueDate: "2099-08-01T00:00:00.000Z",
  },
  {
    key: "task-a1-succ-ready",
    projectKey: "project-a1",
    title: "Seed successor after done pred",
    status: "TODO",
    plannedStartAt: "2026-09-01T00:00:00.000Z",
    dueDate: "2099-09-01T00:00:00.000Z",
  },
  {
    key: "task-b1-todo",
    projectKey: "project-b1",
    title: "Seed Beta hidden task",
    status: "TODO",
    milestoneKey: "ms-b1-planned",
  },
];

export const M4_SEED_DEPENDENCIES: readonly SeedDependency[] = [
  { key: "dep-done-ready", predecessorKey: "task-a1-done", successorKey: "task-a1-succ-ready", type: "FINISH_TO_START" },
  {
    key: "dep-open-wait",
    predecessorKey: "task-a1-pred-open",
    successorKey: "task-a1-succ-blocked",
    type: "FINISH_TO_START",
  },
];

export const M4_SEED_PRE_M4_TASK = {
  key: "task-pre-m4-activation",
  projectKey: "project-a1",
  title: "Pre-M4 activation Task",
} as const;

export const M4_SEED_RESET_POLICY = {
  idempotent: true,
  resettable: true,
  disposableDatabase: true,
  realPiiForbidden: true,
  emailDomain: M4_SEED_EMAIL_DOMAIN,
  productionCredentialsForbidden: true,
} as const;

export const M4_8_REQUIREMENT_IDS = [
  "M4.8-R01",
  "M4.8-R02",
  "M4.8-R03",
  "M4.8-R04",
  "M4.8-R05",
  "M4.8-R06",
  "M4.8-R07",
  "M4.8-R08",
  "M4.8-R09",
  "M4.8-R10",
  "M4.8-R11",
  "M4.8-R12",
  "M4.8-R13",
  "M4.8-R14",
] as const;

export const M4_8_ARTIFACT_PATHS = [
  "docs/domain/m4.8-requirement-to-change-plan.md",
  "docs/domain/m4.8-requirements-traceability.md",
  "docs/release/m4.8-local-rc-test-guide.md",
  "docs/release/m4.8-local-rc-evidence-index.md",
  "docs/release/m4.8-residuals.md",
  "docs/development/m4.8-performance-baseline.md",
  "docs/ux/evidence/m4.8/INDEX.md",
  "packages/shared/src/m4-seed-design.ts",
  "prisma/m4-seed.ts",
  "api/test/integration/m48-local-rc.integration.test.ts",
  "web/e2e/local-rc/m4-8-golden-path.spec.ts",
  "web/e2e/local-rc/m4-8-authz.spec.ts",
] as const;
