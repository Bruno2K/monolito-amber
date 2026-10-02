/**
 * M4.9 final-audit catalogs. Evidence lives in
 * docs/development/m4.9-evidence/ — CI asserts each id.
 * This module does not claim Exit Gate PASS / M4 COMPLETE.
 */

function requirementIds(prefix: string, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-R${String(index + 1).padStart(2, "0")}`);
}

export const M4_1_REQUIREMENT_IDS = requirementIds("M4.1", 14);
export const M4_2_REQUIREMENT_IDS = requirementIds("M4.2", 14);
export const M4_3_REQUIREMENT_IDS = requirementIds("M4.3", 15);
export const M4_4_REQUIREMENT_IDS = requirementIds("M4.4", 14);
export const M4_5_REQUIREMENT_IDS = requirementIds("M4.5", 12);
export const M4_6_REQUIREMENT_IDS = requirementIds("M4.6", 16);
export const M4_7_REQUIREMENT_IDS = requirementIds("M4.7", 14);
export const M4_8_REQUIREMENT_IDS_AUDIT = requirementIds("M4.8", 14);
export const M4_8_1_REQUIREMENT_IDS = requirementIds("M4.8.1", 5);

export const M4_9_AUDITED_REQUIREMENT_IDS = [
  ...M4_1_REQUIREMENT_IDS,
  ...M4_2_REQUIREMENT_IDS,
  ...M4_3_REQUIREMENT_IDS,
  ...M4_4_REQUIREMENT_IDS,
  ...M4_5_REQUIREMENT_IDS,
  ...M4_6_REQUIREMENT_IDS,
  ...M4_7_REQUIREMENT_IDS,
  ...M4_8_REQUIREMENT_IDS_AUDIT,
  ...M4_8_1_REQUIREMENT_IDS,
] as const;

export const M4_9_TRACE_IDS = ["M4.9-REG-01", "M4.9-ADV-01", "M4.9-A11Y-01", "M4.9-PERF-01", "M4.9-SCOPE-01"] as const;

export const M4_9_QG_ADVERSARIAL_IDS = [
  "QG-ADV-01",
  "QG-ADV-02",
  "QG-ADV-03",
  "QG-ADV-04",
  "QG-ADV-05",
  "QG-ADV-06",
  "QG-ADV-07",
  "QG-ADV-08",
  "QG-ADV-09",
  "QG-ADV-10",
  "QG-ADV-11",
  "QG-ADV-12",
  "QG-ADV-13",
] as const;

export type M49QgAdversarialId = (typeof M4_9_QG_ADVERSARIAL_IDS)[number];

export const M4_9_QG_ADVERSARIAL_SCENARIOS = [
  { id: "QG-ADV-01", title: "cross-Organization and cross-Project identifiers" },
  { id: "QG-ADV-02", title: "removed / suspended ProjectMembership" },
  { id: "QG-ADV-03", title: "unauthorized list / count / search / filter / deep link" },
  { id: "QG-ADV-04", title: "linked preview after revocation" },
  { id: "QG-ADV-05", title: "stale version update" },
  { id: "QG-ADV-06", title: "duplicate retry (Idempotency-Key)" },
  { id: "QG-ADV-07", title: "self, duplicate, cross-project, cyclic dependency" },
  { id: "QG-ADV-08", title: "successor start before predecessor DONE" },
  { id: "QG-ADV-09", title: "due-date / progress edits attempting silent state transitions" },
  { id: "QG-ADV-10", title: "Task completion attempting to mutate Issue / Milestone / Deliverable / Gate" },
  { id: "QG-ADV-11", title: "date drag attempting automatic propagation" },
  { id: "QG-ADV-12", title: "hidden archived data and malformed filters" },
  { id: "QG-ADV-13", title: "keyboard-only and reduced-motion paths" },
] as const satisfies ReadonlyArray<{ id: M49QgAdversarialId; title: string }>;

export const M4_9_ARTIFACT_PATHS = [
  "docs/domain/m4.9-requirements-traceability.md",
  "docs/development/m4.9-evidence/INDEX.md",
  "docs/development/m4.9-evidence/EXIT-REPORT.md",
  "docs/development/m4.9-evidence/audit-lenses.md",
  "docs/development/m4.9-evidence/adversarial-scenarios.md",
  "docs/development/m4.9-evidence/findings.md",
  "docs/release/m4.9-evidence-index.md",
  "docs/release/m4.9-residuals.md",
] as const;

export const M4_9_FORBIDDEN_CLAIMS = ["M4 COMPLETE", "EXIT GATE PASS", "Exit Gate PASS"] as const;
