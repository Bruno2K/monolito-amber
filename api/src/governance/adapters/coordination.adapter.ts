import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Read-only Issue adapter for Gate evaluation.
 * Must never create, update, or delete Coordination rows.
 */
@Injectable()
export class CoordinationGovernanceAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async findIssue(organizationId: string, projectId: string, issueId: string) {
    return this.prisma.issue.findFirst({
      where: { id: issueId, organizationId, projectId },
    });
  }
}
