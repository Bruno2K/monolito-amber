import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AuthzModule } from "../authz/authz.module";
import { InvitationsService } from "./invitations.service";
import { MembershipsService } from "./memberships.service";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { RolesService } from "./roles.service";

@Module({
  imports: [AuditModule, AuthModule, AuthzModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, InvitationsService, MembershipsService, RolesService],
  exports: [RolesService],
})
export class OrgModule {}
