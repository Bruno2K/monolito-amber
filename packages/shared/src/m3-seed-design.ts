/**
 * Deterministic M3 seed / test-data design. Synthetic identities only.
 * M3.3 implements the writer for Organizations, memberships, Teams,
 * Disciplines, and Phases. M3.4 writes Deliverable rows and WorkPackage
 * rows for the delivery rule. M3.5 exposes WorkPackage CRUD against those rows.
 */

export const M3_SEED_PASSWORD = "correct-horse-12";

export interface SeedUser {
  key: string;
  email: string;
  displayName: string;
  role: string;
}

export interface SeedMembership {
  userKey: string;
  orgKey: string;
  type: "INTERNAL" | "EXTERNAL";
  status: "ACTIVE" | "SUSPENDED" | "REMOVED";
}

export interface SeedProjectMembership {
  userKey: string;
  projectKey: string;
  templateKey: string;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED";
}

export interface SeedDiscipline {
  key: string;
  orgKey: string;
  code: string;
  name: string;
  historicalIdentifier: string;
}

export interface SeedPhase {
  key: string;
  projectKey: string;
  name: string;
  sequence: number;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
}

export interface SeedDeliverable {
  key: string;
  projectKey: string;
  phaseKey: string;
  disciplineKey: string;
  code: string;
  title: string;
  status: "PLANNED" | "IN_PROGRESS" | "IN_REVIEW" | "APPROVED" | "DELIVERED" | "CANCELLED";
  ownerKind: "user" | "team" | "none";
  ownerUserKey?: string;
  ownerTeamKey?: string;
}

export interface SeedWorkPackage {
  key: string;
  projectKey: string;
  phaseKey: string;
  deliverableKey?: string;
  disciplineKey?: string;
  code?: string;
  title: string;
  status: "PLANNED" | "ACTIVE" | "BLOCKED" | "DONE" | "CANCELLED";
  blockedReason?: string;
  ownerKind: "user" | "team" | "none";
  ownerUserKey?: string;
  ownerTeamKey?: string;
}

export const M3_SEED_EMAIL_DOMAIN = "amber.test";

export const M3_SEED_ORGANIZATIONS = [
  { key: "org-a", name: "Amber Demo Alpha", slug: "amber-demo-alpha" },
  { key: "org-b", name: "Amber Demo Beta", slug: "amber-demo-beta" },
] as const;

export const M3_SEED_PROJECTS = [
  { key: "project-a1", orgKey: "org-a", name: "Alpha Tower" },
  { key: "project-a2", orgKey: "org-a", name: "Alpha Plant" },
  { key: "project-b1", orgKey: "org-b", name: "Beta Campus" },
] as const;

export const M3_SEED_TEAMS = [
  { key: "team-a-structure", orgKey: "org-a", name: "Alpha Structure Team" },
  { key: "team-b-mep", orgKey: "org-b", name: "Beta MEP Team" },
] as const;

export const M3_SEED_USERS: readonly SeedUser[] = [
  {
    key: "coord-a",
    email: `coordinator.a@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Coordinator A",
    role: "internal coordinator",
  },
  {
    key: "discipline-a",
    email: `discipline.a@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Discipline Coordinator A",
    role: "discipline coordinator",
  },
  {
    key: "contributor-a",
    email: `contributor.a@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Contributor A",
    role: "contributor",
  },
  {
    key: "viewer-a",
    email: `viewer.a@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Viewer A",
    role: "viewer",
  },
  {
    key: "external-a",
    email: `external.a@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed External Collaborator A",
    role: "external collaborator",
  },
  {
    key: "suspended-a",
    email: `suspended.a@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Suspended Member A",
    role: "contributor",
  },
  {
    key: "removed-a",
    email: `removed.a@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Removed Member A",
    role: "contributor",
  },
  {
    key: "coord-b",
    email: `coordinator.b@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Coordinator B",
    role: "internal coordinator",
  },
  {
    key: "unauthorized",
    email: `unauthorized@${M3_SEED_EMAIL_DOMAIN}`,
    displayName: "Seed Unauthorized User",
    role: "unauthorized user",
  },
];

export const M3_SEED_ORG_MEMBERSHIPS: readonly SeedMembership[] = [
  { userKey: "coord-a", orgKey: "org-a", type: "INTERNAL", status: "ACTIVE" },
  { userKey: "discipline-a", orgKey: "org-a", type: "INTERNAL", status: "ACTIVE" },
  { userKey: "contributor-a", orgKey: "org-a", type: "INTERNAL", status: "ACTIVE" },
  { userKey: "viewer-a", orgKey: "org-a", type: "INTERNAL", status: "ACTIVE" },
  { userKey: "external-a", orgKey: "org-a", type: "EXTERNAL", status: "ACTIVE" },
  { userKey: "suspended-a", orgKey: "org-a", type: "INTERNAL", status: "SUSPENDED" },
  { userKey: "removed-a", orgKey: "org-a", type: "INTERNAL", status: "REMOVED" },
  { userKey: "coord-b", orgKey: "org-b", type: "INTERNAL", status: "ACTIVE" },
];

export const M3_SEED_PROJECT_MEMBERSHIPS: readonly SeedProjectMembership[] = [
  { userKey: "coord-a", projectKey: "project-a1", templateKey: "PROJECT_COORDINATOR", status: "ACTIVE" },
  { userKey: "coord-a", projectKey: "project-a2", templateKey: "PROJECT_COORDINATOR", status: "ACTIVE" },
  {
    userKey: "discipline-a",
    projectKey: "project-a1",
    templateKey: "DISCIPLINE_COORDINATOR",
    status: "ACTIVE",
  },
  { userKey: "contributor-a", projectKey: "project-a1", templateKey: "CONTRIBUTOR_DESIGNER", status: "ACTIVE" },
  { userKey: "viewer-a", projectKey: "project-a1", templateKey: "VIEWER", status: "ACTIVE" },
  { userKey: "external-a", projectKey: "project-a1", templateKey: "EXTERNAL_CONTRIBUTOR", status: "ACTIVE" },
  { userKey: "suspended-a", projectKey: "project-a1", templateKey: "CONTRIBUTOR_DESIGNER", status: "SUSPENDED" },
  { userKey: "removed-a", projectKey: "project-a1", templateKey: "CONTRIBUTOR_DESIGNER", status: "REMOVED" },
  { userKey: "coord-b", projectKey: "project-b1", templateKey: "PROJECT_COORDINATOR", status: "ACTIVE" },
];

export const M3_SEED_DISCIPLINES: readonly SeedDiscipline[] = [
  {
    key: "disc-a-arch",
    orgKey: "org-a",
    code: "ARCH",
    name: "Architecture",
    historicalIdentifier: "architecture",
  },
  {
    key: "disc-a-str",
    orgKey: "org-a",
    code: "STR",
    name: "Structure",
    historicalIdentifier: "structure",
  },
  { key: "disc-a-mep", orgKey: "org-a", code: "MEP", name: "MEP", historicalIdentifier: "mep" },
  { key: "disc-b-arch", orgKey: "org-b", code: "ARCH", name: "Architecture", historicalIdentifier: "architecture" },
];

export const M3_SEED_PHASES: readonly SeedPhase[] = [
  { key: "phase-a1-planned", projectKey: "project-a1", name: "Concept", sequence: 1, status: "PLANNED" },
  { key: "phase-a1-active", projectKey: "project-a1", name: "Developed Design", sequence: 2, status: "ACTIVE" },
  { key: "phase-a1-completed", projectKey: "project-a1", name: "Brief", sequence: 0, status: "COMPLETED" },
  { key: "phase-a2-active", projectKey: "project-a2", name: "Execution", sequence: 1, status: "ACTIVE" },
  { key: "phase-b1-planned", projectKey: "project-b1", name: "Concept", sequence: 1, status: "PLANNED" },
];

export const M3_SEED_DELIVERABLES: readonly SeedDeliverable[] = [
  {
    key: "del-a1-planned-user",
    projectKey: "project-a1",
    phaseKey: "phase-a1-planned",
    disciplineKey: "disc-a-arch",
    code: "DEL-ARCH-001",
    title: "Concept pack",
    status: "PLANNED",
    ownerKind: "user",
    ownerUserKey: "discipline-a",
  },
  {
    key: "del-a1-progress-team",
    projectKey: "project-a1",
    phaseKey: "phase-a1-active",
    disciplineKey: "disc-a-str",
    code: "DEL-STR-010",
    title: "Structural model",
    status: "IN_PROGRESS",
    ownerKind: "team",
    ownerTeamKey: "team-a-structure",
  },
  {
    key: "del-a1-review-none",
    projectKey: "project-a1",
    phaseKey: "phase-a1-active",
    disciplineKey: "disc-a-mep",
    code: "DEL-MEP-003",
    title: "MEP narrative",
    status: "IN_REVIEW",
    ownerKind: "none",
  },
  {
    key: "del-a1-approved",
    projectKey: "project-a1",
    phaseKey: "phase-a1-completed",
    disciplineKey: "disc-a-arch",
    code: "DEL-ARCH-000",
    title: "Brief report",
    status: "APPROVED",
    ownerKind: "user",
    ownerUserKey: "coord-a",
  },
  {
    key: "del-b1-planned",
    projectKey: "project-b1",
    phaseKey: "phase-b1-planned",
    disciplineKey: "disc-b-arch",
    code: "DEL-ARCH-001",
    title: "Beta concept pack",
    status: "PLANNED",
    ownerKind: "none",
  },
];

export const M3_SEED_WORK_PACKAGES: readonly SeedWorkPackage[] = [
  {
    key: "wp-planned",
    projectKey: "project-a1",
    phaseKey: "phase-a1-planned",
    deliverableKey: "del-a1-planned-user",
    disciplineKey: "disc-a-arch",
    code: "WP-PLAN-001",
    title: "Outline programme",
    status: "PLANNED",
    ownerKind: "none",
  },
  {
    key: "wp-active",
    projectKey: "project-a1",
    phaseKey: "phase-a1-active",
    deliverableKey: "del-a1-progress-team",
    disciplineKey: "disc-a-str",
    code: "WP-STR-010",
    title: "Framing model",
    status: "ACTIVE",
    ownerKind: "team",
    ownerTeamKey: "team-a-structure",
  },
  {
    key: "wp-blocked",
    projectKey: "project-a1",
    phaseKey: "phase-a1-active",
    deliverableKey: "del-a1-progress-team",
    disciplineKey: "disc-a-str",
    code: "WP-STR-011",
    title: "Connection schedule",
    status: "BLOCKED",
    blockedReason: "Waiting for architect grid freeze",
    ownerKind: "user",
    ownerUserKey: "discipline-a",
  },
  {
    key: "wp-done",
    projectKey: "project-a1",
    phaseKey: "phase-a1-completed",
    deliverableKey: "del-a1-approved",
    disciplineKey: "disc-a-arch",
    code: "WP-ARCH-000",
    title: "Brief drafting",
    status: "DONE",
    ownerKind: "user",
    ownerUserKey: "coord-a",
  },
  {
    key: "wp-cancelled",
    projectKey: "project-a1",
    phaseKey: "phase-a1-active",
    deliverableKey: "del-a1-review-none",
    disciplineKey: "disc-a-mep",
    code: "WP-MEP-003",
    title: "Superseded option study",
    status: "CANCELLED",
    ownerKind: "none",
  },
  {
    key: "wp-unlinked",
    projectKey: "project-a1",
    phaseKey: "phase-a1-planned",
    code: "WP-FREE-001",
    title: "Unlinked package",
    status: "PLANNED",
    ownerKind: "none",
  },
];

export const M3_SEED_CROSS_TENANT_NEGATIVES = [
  {
    actorUserKey: "coord-a",
    forbiddenProjectKey: "project-b1",
    forbiddenOrgKey: "org-b",
    assertion: "Org A coordinator cannot read Org B Project by path or body id",
  },
  {
    actorUserKey: "coord-b",
    forbiddenProjectKey: "project-a1",
    forbiddenOrgKey: "org-a",
    assertion: "Org B coordinator cannot read Org A Deliverable/WorkPackage ids",
  },
  {
    actorUserKey: "unauthorized",
    forbiddenProjectKey: "project-a1",
    forbiddenOrgKey: "org-a",
    assertion: "User with no membership is omit-not-leak on every Operations list",
  },
  {
    actorUserKey: "suspended-a",
    forbiddenProjectKey: "project-a1",
    forbiddenOrgKey: "org-a",
    assertion: "SUSPENDED ProjectMembership is revoked immediately",
  },
  {
    actorUserKey: "removed-a",
    forbiddenProjectKey: "project-a1",
    forbiddenOrgKey: "org-a",
    assertion: "REMOVED ProjectMembership is revoked immediately",
  },
  {
    actorUserKey: "viewer-a",
    forbiddenProjectKey: "project-a1",
    forbiddenOrgKey: "org-a",
    assertion: "Viewer cannot mutate Phase/Deliverable/WorkPackage",
  },
  {
    actorUserKey: "external-a",
    forbiddenProjectKey: "project-a2",
    forbiddenOrgKey: "org-a",
    assertion: "External collaborator cannot see Org directory or the other Org A Project",
  },
] as const;

export const M3_SEED_RESET_POLICY = {
  idempotent: true,
  resettable: true,
  disposableDatabase: true,
  realPiiForbidden: true,
  emailDomain: M3_SEED_EMAIL_DOMAIN,
} as const;
