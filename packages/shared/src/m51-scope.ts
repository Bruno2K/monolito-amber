/**
 * M5.1-R15 — executable proof that M6+, resource/time, cloud, attachments,
 * and moderation are not smuggled into this baseline.
 */

export const M51_FORBIDDEN_PERMISSION_PREFIXES = [
  "resource_allocation.",
  "time_entry.",
  "attachment.",
  "moderation.",
] as const;

export const M51_FORBIDDEN_PERMISSION_CODES = [
  "team.read",
  "team.create",
  "team.update",
  "team.manage_members",
  "team.archive",
] as const;

export const M51_FORBIDDEN_MODEL_NAMES = [
  "ResourceAllocation",
  "TimeEntry",
  "Attachment",
  "MessageAttachment",
  "ModerationAction",
  "ExternalCalendarSync",
] as const;

export const M51_FORBIDDEN_SCHEMA_NAMES = ["resource"] as const;

export const M51_FORBIDDEN_PATH_TOKENS = [
  "resource-allocations",
  "time-entries",
  "attachments",
  "moderation",
  "external-sync",
] as const;

export const M51_CLOUD_FENCE = {
  deployWorkflowMustStayDisabled: true,
  vercelForbidden: true,
  railwayForbidden: true,
  publicUrlForbidden: true,
} as const;

export function permissionLooksLikeM6Plus(code: string): boolean {
  const lower = code.toLowerCase();
  if (M51_FORBIDDEN_PERMISSION_CODES.includes(code as (typeof M51_FORBIDDEN_PERMISSION_CODES)[number])) {
    return true;
  }
  return M51_FORBIDDEN_PERMISSION_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function textSmugglesM6CloudOrAttachment(text: string): boolean {
  const hay = text.toLowerCase();
  const needles = [
    "resourceallocation",
    "timeentry",
    "message attachment",
    "chat attachment",
    "moderation queue",
    "external calendar sync",
    "vercel deploy",
    "railway deploy",
  ];
  return needles.some((needle) => hay.includes(needle));
}
