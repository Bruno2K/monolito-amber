/**
 * M3.9 adversarial scenario catalog. Evidence mapping lives in
 * docs/development/m3.9-evidence/adversarial-scenarios.md — CI asserts each id.
 * This module does not claim Exit Gate PASS / M3 COMPLETE.
 */
export const M3_9_ADVERSARIAL_IDS = [
  "ADV-01",
  "ADV-02",
  "ADV-03",
  "ADV-04",
  "ADV-05",
  "ADV-06",
  "ADV-07",
  "ADV-08",
  "ADV-09",
  "ADV-10",
  "ADV-11",
  "ADV-12",
  "ADV-13",
  "ADV-14",
  "ADV-15",
] as const;

export type M39AdversarialId = (typeof M3_9_ADVERSARIAL_IDS)[number];

export const M3_9_ADVERSARIAL_SCENARIOS = [
  { id: "ADV-01", title: "cross-Organization IDs on every new family" },
  { id: "ADV-02", title: "cross-Project links" },
  { id: "ADV-03", title: "removed/suspended memberships" },
  { id: "ADV-04", title: "Team ownership treated as access" },
  { id: "ADV-05", title: "explicit states bypassed by date/progress" },
  { id: "ADV-06", title: "Deliverable delivered with incomplete WP" },
  { id: "ADV-07", title: "Task completion causing cascade" },
  { id: "ADV-08", title: "hidden counts/read models" },
  { id: "ADV-09", title: "stale cache after revocation" },
  { id: "ADV-10", title: "inaccessible deep links" },
  { id: "ADV-11", title: "concurrent stale version updates" },
  { id: "ADV-12", title: "duplicate idempotency commands" },
  { id: "ADV-13", title: "audit mutation attempt" },
  { id: "ADV-14", title: "gate.override scan" },
  { id: "ADV-15", title: "migration from pre-M3 main" },
] as const satisfies ReadonlyArray<{ id: M39AdversarialId; title: string }>;
