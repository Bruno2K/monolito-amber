import { Module } from "@nestjs/common";
import { FoundationService } from "./foundation.service";
import { IdempotencyService } from "./idempotency.service";
import { OutboxProcessor } from "./outbox.processor";

@Module({
  providers: [FoundationService, IdempotencyService, OutboxProcessor],
  exports: [FoundationService, IdempotencyService, OutboxProcessor],
})
export class FoundationModule {}
