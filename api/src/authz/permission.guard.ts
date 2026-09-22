import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionCode } from "@amber/shared";
import { DenyByDefaultError } from "@amber/shared";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/session.types";
import { AuthzService } from "./authz.service";
import { REQUIRED_PERMISSION } from "./require-permission.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<PermissionCode | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    if (!req.amberSession) {
      throw new DenyByDefaultError("Authentication required");
    }
    await this.authz.assert(req.amberSession, permission);
    return true;
  }
}
