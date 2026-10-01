import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

export type ObjectStorageBackend = "s3" | "filesystem";

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

let s3Handle: { fingerprint: string; client: S3Client; bucket: string } | null = null;
let bucketReady = false;

export function fileSigningSecret(): string {
  return process.env.FILE_SIGNING_SECRET || process.env.SESSION_SECRET || "amber-dev-file-signing";
}

export function objectStorageRoot(): string {
  return process.env.OBJECT_STORAGE_DIR || join(tmpdir(), "amber-objects");
}

export function s3ConfigFromEnv(): S3Config | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKey = process.env.S3_ACCESS_KEY?.trim();
  const secretKey = process.env.S3_SECRET_KEY?.trim();
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    return null;
  }
  return {
    endpoint,
    region: process.env.S3_REGION?.trim() || "us-east-1",
    bucket,
    accessKey,
    secretKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

export function objectStorageBackend(): ObjectStorageBackend {
  return s3ConfigFromEnv() ? "s3" : "filesystem";
}

export function s3Required(): boolean {
  return process.env.AMBER_REQUIRE_S3 === "1" || process.env.AMBER_REQUIRE_S3 === "true";
}

export function assertObjectStorageContract(): void {
  if (s3Required() && !s3ConfigFromEnv()) {
    throw new FileIntegrityError(
      "S3 object storage is required (AMBER_REQUIRE_S3) but S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY are incomplete",
    );
  }
}

export function resetObjectStorageClientForTests(): void {
  s3Handle = null;
  bucketReady = false;
}

function s3HandleOrThrow(): { client: S3Client; bucket: string } {
  const cfg = s3ConfigFromEnv();
  if (!cfg) {
    throw new FileIntegrityError("S3 object storage is not configured");
  }
  const fingerprint = `${cfg.endpoint}|${cfg.bucket}|${cfg.accessKey}|${cfg.region}|${cfg.forcePathStyle}`;
  if (s3Handle?.fingerprint !== fingerprint) {
    s3Handle = {
      fingerprint,
      bucket: cfg.bucket,
      client: new S3Client({
        region: cfg.region,
        endpoint: cfg.endpoint,
        forcePathStyle: cfg.forcePathStyle,
        credentials: {
          accessKeyId: cfg.accessKey,
          secretAccessKey: cfg.secretKey,
        },
      }),
    };
    bucketReady = false;
  }
  return s3Handle;
}

async function ensureBucket(): Promise<{ client: S3Client; bucket: string }> {
  const handle = s3HandleOrThrow();
  if (bucketReady) {
    return handle;
  }
  try {
    await handle.client.send(new HeadBucketCommand({ Bucket: handle.bucket }));
  } catch {
    await handle.client.send(new CreateBucketCommand({ Bucket: handle.bucket }));
  }
  bucketReady = true;
  return handle;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new FileIntegrityError("S3 object body is empty");
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

async function putFilesystem(storageKey: string, bytes: Buffer): Promise<void> {
  const path = join(objectStorageRoot(), storageKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function readFilesystem(storageKey: string): Promise<Buffer> {
  return readFile(join(objectStorageRoot(), storageKey));
}

async function headFilesystem(storageKey: string): Promise<{ byteSize: number } | null> {
  try {
    const info = await stat(join(objectStorageRoot(), storageKey));
    return { byteSize: info.size };
  } catch {
    return null;
  }
}

async function putS3(storageKey: string, bytes: Buffer): Promise<void> {
  const handle = await ensureBucket();
  await handle.client.send(
    new PutObjectCommand({
      Bucket: handle.bucket,
      Key: storageKey,
      Body: bytes,
      ContentLength: bytes.length,
    }),
  );
}

async function readS3(storageKey: string): Promise<Buffer> {
  const handle = await ensureBucket();
  const response = await handle.client.send(
    new GetObjectCommand({
      Bucket: handle.bucket,
      Key: storageKey,
    }),
  );
  return streamToBuffer(response.Body);
}

async function headS3(storageKey: string): Promise<{ byteSize: number } | null> {
  const handle = await ensureBucket();
  try {
    const response = await handle.client.send(
      new HeadObjectCommand({
        Bucket: handle.bucket,
        Key: storageKey,
      }),
    );
    return { byteSize: response.ContentLength ?? 0 };
  } catch {
    return null;
  }
}

export async function putObjectBytes(storageKey: string, bytes: Buffer): Promise<void> {
  assertObjectStorageContract();
  if (objectStorageBackend() === "s3") {
    await putS3(storageKey, bytes);
    return;
  }
  await putFilesystem(storageKey, bytes);
}

export async function readObjectBytes(storageKey: string): Promise<Buffer> {
  assertObjectStorageContract();
  if (objectStorageBackend() === "s3") {
    return readS3(storageKey);
  }
  return readFilesystem(storageKey);
}

export async function objectHead(storageKey: string): Promise<{ byteSize: number } | null> {
  assertObjectStorageContract();
  if (objectStorageBackend() === "s3") {
    return headS3(storageKey);
  }
  return headFilesystem(storageKey);
}

export async function assertLiveObjectStorageReady(): Promise<ObjectStorageBackend> {
  assertObjectStorageContract();
  const backend = objectStorageBackend();
  if (backend === "s3") {
    await ensureBucket();
  }
  return backend;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function scannerAvailable(): boolean {
  return process.env.AMBER_SCANNER_AVAILABLE !== "0" && process.env.AMBER_SCANNER_AVAILABLE !== "false";
}

export const UPLOAD_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_TTL_MS = 10 * 60 * 1000;
