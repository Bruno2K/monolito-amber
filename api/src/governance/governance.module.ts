import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { FoundationModule } from "../foundation/foundation.module";
import { CoordinationGovernanceAdapter } from "./adapters/coordination.adapter";
import { DocumentGovernanceAdapter } from "./adapters/document.adapter";
import { PlanningGovernanceAdapter } from "./adapters/planning.adapter";
import { ExceptionsController } from "./exceptions.controller";
import { ExceptionsService } from "./exceptions.service";
import { GatesController } from "./gates.controller";
import { GatesService } from "./gates.service";
import { GovernanceAccess } from "./governance.access";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [GatesController, ExceptionsController],
  providers: [
    GovernanceAccess,
    DocumentGovernanceAdapter,
    CoordinationGovernanceAdapter,
    PlanningGovernanceAdapter,
    GatesService,
    ExceptionsService,
  ],
  exports: [GatesService, ExceptionsService],
})
export class GovernanceModule {}
