import { Injectable } from "@nestjs/common";
import {
  hashIdempotentRequest,
  replayOrConflict,
  requireIdempotencyKey,
  type IdempotencyRecordView,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(
    organizationId: string,
    header: string | undefined,
    body: unknown,
  ): Promise<{ key: string; hash: string; replay: IdempotencyRecordView | null }> {
    const key = requireIdempotencyKey(header);
    const hash = hashIdempotentRequest(body);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    const replay = replayOrConflict(
      existing
        ? {
            key: existing.key,
            requestHash: existing.requestHash,
            responseStatus: existing.responseStatus,
            responseBody: existing.responseBody,
          }
        : null,
      key,
      hash,
    );
    return { key, hash, replay };
  }

  async commit(
    organizationId: string,
    key: string,
    hash: string,
    responseStatus: number,
    responseBody: unknown,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.idempotencyRecord.create({
      data: {
        organizationId,
        key,
        requestHash: hash,
        responseStatus,
        responseBody: responseBody as Prisma.InputJsonValue,
      },
    });
  }
}
