import { type PermissionCode } from "./permissions.js";

/**
 * Amber Role Templates — APPROVED 0.2A §2.
 * Product-owned immutable baseline. Seeded as RoleDefinition rows with
 * organizationId=null / isSystemTemplate=true. They are NOT operational AuthZ
 * grants. On Organization create, each template is instantiated into an
 * Organization-owned RoleDefinition (lineage via sourceTemplateKey/templateKey).
 */
export const ROLE_TEMPLATE_KEYS = [
  "ORGANIZATION_ADMINISTRATOR",
  "PROJECT_COORDINATOR",
  "DISCIPLINE_COORDINATOR",
  "CONTRIBUTOR_DESIGNER",
  "REVIEWER_REVISION_APPROVER",
  "GOVERNANCE_APPROVER",
  "EXTERNAL_CONTRIBUTOR",
  "VIEWER",
  "AUDITOR",
] as const;

export type RoleTemplateKey = (typeof ROLE_TEMPLATE_KEYS)[number];

export interface RoleTemplate {
  key: RoleTemplateKey;
  name: string;
  description: string;
  permissions: readonly PermissionCode[];
}

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: "ORGANIZATION_ADMINISTRATOR",
    name: "Organization Administrator",
    description:
      "Organization management, membership, role/catalog administration, project creation/archive and organization-wide audit read. Does not automatically grant every project-operational permission. MFA TOTP required (0.2A §9).",
    permissions: [
      "organization.read",
      "organization.manage_settings",
      "organization.manage_members",
      "organization.manage_roles",
      "organization.manage_catalogs",
      "organization.read_audit",
      "project.create",
      "project.read",
      "project.archive",
    ],
  },
  {
    key: "PROJECT_COORDINATOR",
    name: "Project Coordinator",
    description:
      "Project read/update, project member/role assignment, document read, issue/task/milestone coordination, gate evaluation and normal project administration. High-risk approvals remain separate where SoD applies.",
    permissions: [
      "project.read",
      "project.update",
      "project.manage_members",
      "project.assign_roles",
      "document.read",
      "issue.create",
      "issue.assign",
      "issue.update",
      "issue.resolve",
      "issue.close",
      "issue.reopen",
      "issue.comment",
      "issue.add_evidence",
      "task.create",
      "task.assign",
      "task.update",
      "task.complete",
      "milestone.create",
      "milestone.update",
      "milestone.achieve",
      "gate.read",
      "gate.evaluate",
    ],
  },
  {
    key: "DISCIPLINE_COORDINATOR",
    name: "Discipline Coordinator",
    description:
      "Project read; document/revision creation and publication for authorized discipline scope; issue/task coordination within authorized project/discipline scope.",
    permissions: [
      "project.read",
      "document.read",
      "document.create",
      "revision.create",
      "revision.publish",
      "issue.create",
      "issue.assign",
      "issue.update",
      "issue.comment",
      "issue.add_evidence",
      "task.create",
      "task.assign",
      "task.update",
      "task.complete",
    ],
  },
  {
    key: "CONTRIBUTOR_DESIGNER",
    name: "Contributor / Designer",
    description:
      "Project/document read, revision create/publish where authorized, issue create/comment/evidence, assigned Task update/complete.",
    permissions: [
      "project.read",
      "document.read",
      "revision.create",
      "revision.publish",
      "issue.create",
      "issue.comment",
      "issue.add_evidence",
      "task.update",
      "task.complete",
    ],
  },
  {
    key: "REVIEWER_REVISION_APPROVER",
    name: "Reviewer / Revision Approver",
    description:
      "Revision review/approve/reject plus document/project read. Does not gain revision publication merely by holding this template.",
    permissions: [
      "project.read",
      "document.read",
      "revision.review",
      "revision.approve",
      "revision.reject",
    ],
  },
  {
    key: "GOVERNANCE_APPROVER",
    name: "Governance Approver",
    description:
      "Gate read/evaluate/release and Formal Exception approve/reject/revoke, subject to SoD constraints. MFA TOTP required (0.2A §9).",
    permissions: [
      "gate.read",
      "gate.evaluate",
      "gate.release",
      "exception.approve",
      "exception.reject",
      "exception.revoke",
    ],
  },
  {
    key: "EXTERNAL_CONTRIBUTOR",
    name: "External Contributor",
    description:
      "Constrained Project access only: document read, authorized revision create/publish, issue/comment/evidence and assigned Task operations. No organization-wide visibility.",
    permissions: [
      "project.read",
      "document.read",
      "revision.create",
      "revision.publish",
      "issue.create",
      "issue.comment",
      "issue.add_evidence",
      "task.update",
      "task.complete",
    ],
  },
  {
    key: "VIEWER",
    name: "Viewer",
    description: "Read-only access to explicitly authorized project resources.",
    permissions: ["project.read", "document.read", "gate.read"],
  },
  {
    key: "AUDITOR",
    name: "Auditor",
    description:
      "Read-only audit access for the authorized Organization/Project scope. No operational mutation permissions. Requires organization.read_audit + tenant/project scope (F-09).",
    permissions: ["organization.read", "organization.read_audit", "project.read"],
  },
];

export function roleTemplateByKey(key: RoleTemplateKey): RoleTemplate {
  const found = ROLE_TEMPLATES.find((t) => t.key === key);
  if (!found) {
    throw new Error(`Unknown role template: ${key}`);
  }
  return found;
}

export const MFA_REQUIRED_ROLE_KEYS: readonly RoleTemplateKey[] = [
  "ORGANIZATION_ADMINISTRATOR",
  "GOVERNANCE_APPROVER",
];
