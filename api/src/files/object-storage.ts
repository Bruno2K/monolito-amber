import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { FileIntegrityError } from "@amber/shared";

export interface SignedObjectGrant {
  purpose: "upload" | "download";
  organizationId: string;
  projectId: string;
  documentId: string;
  revisionId: string;
  storageKey: string;
  exp: number;
}

export function fileSigningSecret(): string {
  return process.env.FILE_SIGNING_SECRET || process.env.SESSION_SECRET || "amber-dev-file-signing";
}

export function objectStorageRoot(): string {
  return process.env.OBJECT_STORAGE_DIR || join(tmpdir(), "amber-objects");
}

export function signObjectGrant(grant: SignedObjectGrant): string {
  const payload = Buffer.from(JSON.stringify(grant), "utf8").toString("base64url");
  const mac = createHmac("sha256", fileSigningSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyObjectGrant(token: string, purpose: "upload" | "download"): SignedObjectGrant {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) {
    throw new FileIntegrityError("Signed object token is malformed");
  }
  const expected = createHmac("sha256", fileSigningSecret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new FileIntegrityError("Signed object token is invalid");
  }
  const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedObjectGrant;
  if (grant.purpose !== purpose) {
    throw new FileIntegrityError("Signed object token purpose mismatch");
  }
  if (grant.exp < Date.now()) {
    throw new FileIntegrityError("Signed object token has expired");
  }
  return grant;
}

export async function putObjectBytes(storageKey: string, bytes: Buffer): Promise<void> {
  const path = join(objectStorageRoot(), storageKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function readObjectBytes(storageKey: string): Promise<Buffer> {
  const path = join(objectStorageRoot(), storageKey);
  return readFile(path);
}

export async function objectHead(storageKey: string): Promise<{ byteSize: number } | null> {
  try {
    const info = await stat(join(objectStorageRoot(), storageKey));
    return { byteSize: info.size };
  } catch {
    return null;
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function scannerAvailable(): boolean {
  return process.env.AMBER_SCANNER_AVAILABLE !== "0" && process.env.AMBER_SCANNER_AVAILABLE !== "false";
}

export const UPLOAD_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_TTL_MS = 10 * 60 * 1000;
