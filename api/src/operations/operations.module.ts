import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { FoundationModule } from "../foundation/foundation.module";
import { DisciplinesController } from "./disciplines.controller";
import { DisciplinesService } from "./disciplines.service";
import { DeliverablesController } from "./deliverables.controller";
import { DeliverablesService } from "./deliverables.service";
import { OperationsAccess } from "./operations.access";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { TeamsController } from "./teams.controller";
import { TeamsService } from "./teams.service";
import { WorkPackagesController } from "./work-packages.controller";
import { WorkPackagesService } from "./work-packages.service";
import { HubCacheService } from "./hub.cache";
import { HubController } from "./hub.controller";
import { HubService } from "./hub.service";
import { GateReadAdapter } from "./adapters/gate.read-adapter";
import { TraceabilityService } from "./traceability.service";
import {
  DeliverableTraceabilityController,
  WorkPackageTraceabilityController,
} from "./traceability.controller";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [
    PhasesController,
    DisciplinesController,
    DeliverablesController,
    WorkPackagesController,
    TeamsController,
    HubController,
    DeliverableTraceabilityController,
    WorkPackageTraceabilityController,
  ],
  providers: [
    OperationsAccess,
    PhasesService,
    DisciplinesService,
    DeliverablesService,
    WorkPackagesService,
    TeamsService,
    HubCacheService,
    HubService,
    GateReadAdapter,
    TraceabilityService,
  ],
  exports: [
    PhasesService,
    DisciplinesService,
    DeliverablesService,
    WorkPackagesService,
    TeamsService,
    HubCacheService,
    TraceabilityService,
    GateReadAdapter,
  ],
})
export class OperationsModule {}
