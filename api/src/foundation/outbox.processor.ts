import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface OutboxRecord {
  id: string;
  eventType: string;
  payload: unknown;
  correlationId: string;
  createdAt: Date;
  processedAt: Date | null;
}

export type OutboxHandler = (
  message: OutboxRecord,
  tx: Prisma.TransactionClient,
) => Promise<void>;

/**
 * In-process transactional outbox drain (PF-1.4 delivery model).
 * Handlers register by event type. No Redis / BullMQ for coordination.
 */
@Injectable()
export class OutboxProcessor {
  private readonly handlers = new Map<string, OutboxHandler[]>();

  constructor(private readonly prisma: PrismaService) {}

  register(eventType: string, handler: OutboxHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  async processIds(ids: readonly string[], tx: Prisma.TransactionClient): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const rows = await tx.outboxMessage.findMany({
      where: { id: { in: [...ids] }, processedAt: null },
      orderBy: { createdAt: "asc" },
    });
    for (const row of rows) {
      await this.dispatch(row, tx);
    }
  }

  async processPending(limit = 100, tx?: Prisma.TransactionClient): Promise<number> {
    const types = [...this.handlers.keys()];
    if (types.length === 0) {
      return 0;
    }
    const run = async (client: Prisma.TransactionClient) => {
      const rows = await client.outboxMessage.findMany({
        where: { processedAt: null, eventType: { in: types } },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      for (const row of rows) {
        await this.dispatch(row, client);
      }
      return rows.length;
    };
    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction((inner) => run(inner));
  }

  private async dispatch(
    row: {
      id: string;
      eventType: string;
      payload: Prisma.JsonValue;
      correlationId: string;
      createdAt: Date;
      processedAt: Date | null;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const handlers = this.handlers.get(row.eventType) ?? [];
    if (handlers.length === 0) {
      return;
    }
    const message: OutboxRecord = {
      id: row.id,
      eventType: row.eventType,
      payload: row.payload,
      correlationId: row.correlationId,
      createdAt: row.createdAt,
      processedAt: row.processedAt,
    };
    for (const handler of handlers) {
      await handler(message, tx);
    }
    await tx.outboxMessage.update({
      where: { id: row.id },
      data: { processedAt: new Date() },
    });
  }
}
