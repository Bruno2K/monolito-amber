import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { assertAuditMutationAllowed, canReadAudit, type AuditWrite } from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async insert(event: AuditWrite, tx?: Prisma.TransactionClient): Promise<void> {
    assertAuditMutationAllowed("INSERT");
    const db = tx ?? this.prisma;
    await db.auditEvent.create({
      data: {
        organizationId: event.organizationId ?? null,
        projectId: event.projectId ?? null,
        actorUserId: event.actorUserId ?? null,
        eventType: event.eventType,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        correlationId: event.correlationId,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
  }

  denyMutation(operation: "UPDATE" | "DELETE"): never {
    assertAuditMutationAllowed(operation);
    throw new Error("unreachable");
  }

  canList(input: Parameters<typeof canReadAudit>[0]): boolean {
    return canReadAudit(input);
  }
}
