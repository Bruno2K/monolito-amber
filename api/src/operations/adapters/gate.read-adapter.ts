import { Injectable } from "@nestjs/common";
import { DenyByDefaultError } from "@amber/shared";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Read-only Gate adapter for Operations inspectors (M3.7).
 * Must never create, update, evaluate, approve, or release Gates.
 * Formal Exception remains the sole Gate bypass. No gate.override.
 */
@Injectable()
export class GateReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async listGates(organizationId: string, projectId: string) {
    return this.prisma.gate.findMany({
      where: { organizationId, projectId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        lastEvaluatedAt: true,
        releasedAt: true,
        releaseKind: true,
      },
    });
  }

  async findGate(organizationId: string, projectId: string, gateId: string) {
    return this.prisma.gate.findFirst({
      where: { id: gateId, organizationId, projectId },
      select: {
        id: true,
        name: true,
        status: true,
        lastEvaluatedAt: true,
        releasedAt: true,
        releaseKind: true,
      },
    });
  }

  approve(): never {
    throw new DenyByDefaultError("Gate read adapter cannot approve or release");
  }

  release(): never {
    throw new DenyByDefaultError("Gate read adapter cannot approve or release");
  }

  evaluate(): never {
    throw new DenyByDefaultError("Gate read adapter cannot evaluate");
  }
}
