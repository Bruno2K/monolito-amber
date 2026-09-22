import { Injectable } from "@nestjs/common";
import {
  type ScanStatus,
  assertFileAccessAllowed,
  assertTenantBoundObjectKey,
  assertUploadWhenScannerAvailable,
  evaluateFileAccess,
  redactSecrets,
} from "@amber/shared";
import { AuditService } from "../audit/audit.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import {
  DOWNLOAD_TTL_MS,
  objectHead,
  putObjectBytes,
  readObjectBytes,
  scannerAvailable,
  sha256Hex,
  signObjectGrant,
  verifyObjectGrant,
} from "./object-storage";

/**
 * File-trust primitive (F-08). Scanner vendor remains OPEN.
 * PENDING/scan failure = fail closed; CLEAN = authorized access; BLOCKED = deny + event.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  isScannerAvailable(): boolean {
    return scannerAvailable();
  }

  assertNewUpload(scannerAvailableFlag = this.isScannerAvailable()): void {
    assertUploadWhenScannerAvailable(scannerAvailableFlag);
  }

  async authorizeDownload(objectId: string, intent: "download" | "preview"): Promise<void> {
    const object = await this.prisma.storedObject.findUnique({ where: { id: objectId } });
    const status = (object?.scanStatus ?? "PENDING") as ScanStatus;
    const decision = evaluateFileAccess(status, intent);
    if (decision.emitSecurityEvent && object) {
      await this.audit.insert({
        organizationId: object.organizationId,
        projectId: object.projectId,
        eventType: "FILE_SCAN_BLOCKED",
        resourceType: "stored_object",
        resourceId: object.id,
        correlationId: currentCorrelationId(),
        payload: redactSecrets({ intent, scanStatus: status, reason: decision.reason }),
      });
    }
    assertFileAccessAllowed(status, intent);
  }

  async putSignedUpload(token: string, bytes: Buffer): Promise<{ storageKey: string; byteSize: number }> {
    const grant = verifyObjectGrant(token, "upload");
    assertTenantBoundObjectKey(grant.storageKey, grant);
    await putObjectBytes(grant.storageKey, bytes);
    return { storageKey: grant.storageKey, byteSize: bytes.length };
  }

  async readSignedDownload(token: string): Promise<{ bytes: Buffer; fileName: string }> {
    const grant = verifyObjectGrant(token, "download");
    assertTenantBoundObjectKey(grant.storageKey, grant);
    const object = await this.prisma.storedObject.findFirst({
      where: { storageKey: grant.storageKey, organizationId: grant.organizationId, projectId: grant.projectId },
    });
    if (!object) {
      throw new Error("Stored object not found");
    }
    await this.authorizeDownload(object.id, "download");
    return { bytes: await readObjectBytes(grant.storageKey), fileName: object.originalFileName ?? "download" };
  }

  mintDownloadUrl(input: {
    organizationId: string;
    projectId: string;
    documentId: string;
    revisionId: string;
    storageKey: string;
  }): { url: string; expiresAt: string } {
    const token = signObjectGrant({
      purpose: "download",
      organizationId: input.organizationId,
      projectId: input.projectId,
      documentId: input.documentId,
      revisionId: input.revisionId,
      storageKey: input.storageKey,
      exp: Date.now() + DOWNLOAD_TTL_MS,
    });
    return {
      url: `/api/v1/files/objects/${token}`,
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_MS).toISOString(),
    };
  }

  async verifyUploadedObject(storageKey: string, expectedChecksum: string): Promise<{ byteSize: number }> {
    const head = await objectHead(storageKey);
    if (!head) {
      throw new Error("Uploaded object is missing");
    }
    const bytes = await readObjectBytes(storageKey);
    if (sha256Hex(bytes) !== expectedChecksum.toLowerCase()) {
      throw new Error("Checksum mismatch");
    }
    return { byteSize: head.byteSize };
  }
}
