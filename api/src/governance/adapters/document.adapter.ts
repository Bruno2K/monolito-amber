import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Read-only Document / Revision adapter for Gate evaluation.
 * Must never create, update, or delete upstream rows.
 */
@Injectable()
export class DocumentGovernanceAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async findDocument(
    organizationId: string,
    projectId: string,
    input: { documentId?: string; documentCode?: string },
  ) {
    if (input.documentId) {
      return this.prisma.document.findFirst({
        where: { id: input.documentId, organizationId, projectId },
      });
    }
    if (input.documentCode) {
      return this.prisma.document.findFirst({
        where: { code: input.documentCode, organizationId, projectId },
      });
    }
    return null;
  }

  async findRevision(
    organizationId: string,
    projectId: string,
    input: { documentId: string; revisionId?: string; currentRevisionId?: string | null },
  ) {
    if (input.revisionId) {
      return this.prisma.revision.findFirst({
        where: {
          id: input.revisionId,
          documentId: input.documentId,
          organizationId,
          projectId,
        },
      });
    }
    if (input.currentRevisionId) {
      return this.prisma.revision.findFirst({
        where: {
          id: input.currentRevisionId,
          documentId: input.documentId,
          organizationId,
          projectId,
        },
      });
    }
    return this.prisma.revision.findFirst({
      where: { documentId: input.documentId, organizationId, projectId, status: "APPROVED" },
      orderBy: { approvedAt: "desc" },
    });
  }
}
