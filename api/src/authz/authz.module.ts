import { Module } from "@nestjs/common";
import { AuthzService } from "./authz.service";
import { PermissionGuard } from "./permission.guard";

@Module({
  providers: [AuthzService, PermissionGuard],
  exports: [AuthzService, PermissionGuard],
})
export class AuthzModule {}
