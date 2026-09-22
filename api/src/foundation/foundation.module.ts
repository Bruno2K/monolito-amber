import { Module } from "@nestjs/common";
import { FoundationService } from "./foundation.service";

@Module({
  providers: [FoundationService],
  exports: [FoundationService],
})
export class FoundationModule {}
