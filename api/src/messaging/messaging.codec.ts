import {
  compareMessageCursor,
  type ConversationKind,
  type MessageCursor,
  type MessageLifecycle,
} from "@amber/shared";

export const MESSAGE_BODY_MAX = 8000;
export const SNIPPET_MAX = 160;
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;

export const RESOURCE_LINK_TYPES = [
  "TASK",
  "MILESTONE",
  "DELIVERABLE",
  "GATE",
  "DOCUMENT",
  "PROJECT",
] as const;
export type ResourceLinkType = (typeof RESOURCE_LINK_TYPES)[number];

export interface ResourceLink {
  type: ResourceLinkType;
  id: string;
}

const LINKS_SENTINEL = "\n\n\u2060amber-links:";
const INLINE_LINK_RE =
  /amber:\/\/(TASK|MILESTONE|DELIVERABLE|GATE|DOCUMENT|PROJECT)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi;

export function isResourceLinkType(value: string): value is ResourceLinkType {
  return (RESOURCE_LINK_TYPES as readonly string[]).includes(value);
}

export function clampPageSize(raw: string | number | undefined): number {
  const parsed = typeof raw === "number" ? raw : raw ? Number.parseInt(raw, 10) : PAGE_SIZE_DEFAULT;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.floor(parsed), PAGE_SIZE_MAX);
}

export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): MessageCursor | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<MessageCursor>;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function encodeStoredBody(text: string, links: readonly ResourceLink[]): string {
  const trimmed = text.trimEnd();
  if (links.length === 0) {
    return trimmed;
  }
  const payload = Buffer.from(JSON.stringify(links), "utf8").toString("base64url");
  return `${trimmed}${LINKS_SENTINEL}${payload}`;
}

export function decodeStoredBody(stored: string): { text: string; links: ResourceLink[] } {
  const index = stored.lastIndexOf(LINKS_SENTINEL);
  if (index < 0) {
    return { text: stored, links: extractInlineLinks(stored) };
  }
  const text = stored.slice(0, index);
  const encoded = stored.slice(index + LINKS_SENTINEL.length);
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    const links = Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          if (
            item &&
            typeof item === "object" &&
            "type" in item &&
            "id" in item &&
            typeof item.type === "string" &&
            typeof item.id === "string" &&
            isResourceLinkType(item.type)
          ) {
            return [{ type: item.type, id: item.id }];
          }
          return [];
        })
      : [];
    return { text, links: mergeLinks(links, extractInlineLinks(text)) };
  } catch {
    return { text: stored, links: extractInlineLinks(stored) };
  }
}

export function extractInlineLinks(text: string): ResourceLink[] {
  const found: ResourceLink[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(INLINE_LINK_RE)) {
    const type = match[1];
    const id = match[2];
    if (!type || !id || !isResourceLinkType(type)) {
      continue;
    }
    const key = `${type}:${id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    found.push({ type, id });
  }
  return found;
}

function mergeLinks(primary: readonly ResourceLink[], extra: readonly ResourceLink[]): ResourceLink[] {
  const seen = new Set<string>();
  const out: ResourceLink[] = [];
  for (const link of [...primary, ...extra]) {
    const key = `${link.type}:${link.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(link);
  }
  return out;
}

export function messageLifecycle(row: { editedAt: Date | null; deletedAt: Date | null }): MessageLifecycle {
  if (row.deletedAt) {
    return "TOMBSTONED";
  }
  if (row.editedAt) {
    return "EDITED";
  }
  return "VISIBLE";
}

export function snippetFromText(text: string, query?: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }
  if (!query?.trim()) {
    return collapsed.slice(0, SNIPPET_MAX);
  }
  const hay = collapsed.toLowerCase();
  const needle = query.trim().toLowerCase();
  const at = hay.indexOf(needle);
  if (at < 0) {
    return collapsed.slice(0, SNIPPET_MAX);
  }
  const start = Math.max(0, at - 24);
  const prefix = start > 0 ? "…" : "";
  return `${prefix}${collapsed.slice(start, start + SNIPPET_MAX)}`;
}

export function cursorAfterWhere(cursor: MessageCursor): {
  OR: Array<Record<string, unknown>>;
} {
  return {
    OR: [
      { createdAt: { gt: new Date(cursor.createdAt) } },
      { AND: [{ createdAt: new Date(cursor.createdAt) }, { id: { gt: cursor.id } }] },
    ],
  };
}

export function isCursorAfter(message: MessageCursor, watermark: MessageCursor | null): boolean {
  if (!watermark) {
    return true;
  }
  return compareMessageCursor(message, watermark) > 0;
}

export function conversationKind(kind: string): ConversationKind {
  return kind === "TEAM" ? "TEAM" : "DIRECT";
}
