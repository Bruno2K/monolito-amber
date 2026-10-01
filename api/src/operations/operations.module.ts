import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { FoundationModule } from "../foundation/foundation.module";
import { DisciplinesController } from "./disciplines.controller";
import { DisciplinesService } from "./disciplines.service";
import { OperationsAccess } from "./operations.access";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [PhasesController, DisciplinesController],
  providers: [OperationsAccess, PhasesService, DisciplinesService],
  exports: [PhasesService, DisciplinesService],
})
export class OperationsModule {}
