import { Injectable } from "@nestjs/common";
import {
  type ScanStatus,
  assertFileAccessAllowed,
  assertUploadWhenScannerAvailable,
} from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * File-trust primitive only. No Documents/Revisions workflow in PF-1.0.
 * F-08: PENDING/scan failure = fail closed; CLEAN = authorized access; BLOCKED = deny + event.
 * Vendor OPEN (implementation choice).
 */
@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async authorizeDownload(objectId: string, intent: "download" | "preview"): Promise<void> {
    const object = await this.prisma.storedObject.findUnique({ where: { id: objectId } });
    const status = (object?.scanStatus ?? "PENDING") as ScanStatus;
    assertFileAccessAllowed(status, intent);
  }

  assertNewUpload(scannerAvailable: boolean): void {
    assertUploadWhenScannerAvailable(scannerAvailable);
  }
}
