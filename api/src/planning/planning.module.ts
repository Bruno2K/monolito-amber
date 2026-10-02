import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { FoundationModule } from "../foundation/foundation.module";
import { MilestonesController } from "./milestones.controller";
import { MilestonesService } from "./milestones.service";
import { PlanningAccess } from "./planning.access";
import { PlanningController } from "./planning.controller";
import { PlanningService } from "./planning.service";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, FoundationModule],
  controllers: [TasksController, MilestonesController, PlanningController],
  providers: [PlanningAccess, TasksService, MilestonesService, PlanningService],
  exports: [TasksService, MilestonesService, PlanningService],
})
export class PlanningModule {}
