import { Module } from "@nestjs/common";
import { FoundationService } from "./foundation.service";
import { IdempotencyService } from "./idempotency.service";

@Module({
  providers: [FoundationService, IdempotencyService],
  exports: [FoundationService, IdempotencyService],
})
export class FoundationModule {}
