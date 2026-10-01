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

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [PhasesController, DisciplinesController, DeliverablesController, TeamsController],
  providers: [OperationsAccess, PhasesService, DisciplinesService, DeliverablesService, TeamsService],
  exports: [PhasesService, DisciplinesService, DeliverablesService, TeamsService],
})
export class OperationsModule {}
