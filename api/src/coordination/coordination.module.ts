import { Module, OnModuleInit } from "@nestjs/common";
import { OUTBOX_EVENT_TYPES } from "@amber/shared";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { FoundationModule } from "../foundation/foundation.module";
import { OutboxProcessor } from "../foundation/outbox.processor";
import { ImpactsController } from "./impacts.controller";
import { ImpactsService } from "./impacts.service";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [ImpactsController, IssuesController],
  providers: [ImpactsService, IssuesService],
  exports: [ImpactsService, IssuesService],
})
export class CoordinationModule implements OnModuleInit {
  constructor(
    private readonly outbox: OutboxProcessor,
    private readonly impacts: ImpactsService,
  ) {}

  onModuleInit(): void {
    const consume = this.impacts.consumeChangeEvent.bind(this.impacts);
    this.outbox.register(OUTBOX_EVENT_TYPES.CurrentRevisionChanged, consume);
    this.outbox.register(OUTBOX_EVENT_TYPES.NewBaseEstablished, consume);
  }
}
