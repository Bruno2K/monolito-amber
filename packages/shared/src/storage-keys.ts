import { FileIntegrityError } from "./errors.js";

/**
 * Tenant-bound object key (0.6). Document/Revision identity is never the storage key.
 */
export function documentObjectKey(input: {
  organizationId: string;
  projectId: string;
  documentId: string;
  revisionId: string;
  fileName: string;
}): string {
  const fileName = sanitizeObjectFileName(input.fileName);
  return `org/${input.organizationId}/project/${input.projectId}/documents/${input.documentId}/revisions/${input.revisionId}/${fileName}`;
}

export function sanitizeObjectFileName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? "";
  if (!base || base === "." || base === ".." || base.includes("..")) {
    throw new FileIntegrityError("Object file name is not a safe basename");
  }
  return base.slice(0, 200);
}

export function assertTenantBoundObjectKey(
  key: string,
  input: {
    organizationId: string;
    projectId: string;
    documentId: string;
    revisionId: string;
  },
): void {
  const expectedPrefix = `org/${input.organizationId}/project/${input.projectId}/documents/${input.documentId}/revisions/${input.revisionId}/`;
  if (!key.startsWith(expectedPrefix) || key.includes("..")) {
    throw new FileIntegrityError("Storage key is not bound to the authorized tenant path");
  }
}
