import { Injectable } from "@nestjs/common";
import {
  applyOptimisticUpdate,
  createOutboxEnvelope,
  hashIdempotentRequest,
  jobIdempotencyKey,
  replayOrConflict,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FoundationService {
  constructor(private readonly prisma: PrismaService) {}

  cas<T extends { version: number }>(row: T, expectedVersion: number): T {
    return applyOptimisticUpdate(row, expectedVersion);
  }

  requestHash(body: unknown): string {
    return hashIdempotentRequest(body);
  }

  replay(existing: Parameters<typeof replayOrConflict>[0], key: string, hash: string) {
    return replayOrConflict(existing, key, hash);
  }

  async appendOutbox(
    eventType: string,
    payload: unknown,
    correlationId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const envelope = createOutboxEnvelope(eventType, payload, correlationId);
    const db = tx ?? this.prisma;
    const created = await db.outboxMessage.create({
      data: {
        eventType: envelope.eventType,
        payload: envelope.payload as Prisma.InputJsonValue,
        correlationId: envelope.correlationId,
      },
    });
    return { ...envelope, id: created.id };
  }

  jobKey(jobName: string, naturalKey: string): string {
    return jobIdempotencyKey(jobName, naturalKey);
  }
}
