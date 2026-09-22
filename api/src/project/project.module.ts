import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { OrgModule } from "../org/org.module";
import { ProjectMembershipsService } from "./project-memberships.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule, OrgModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMembershipsService],
})
export class ProjectModule {}
