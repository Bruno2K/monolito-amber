import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionCode } from "@amber/shared";
import { DenyByDefaultError } from "@amber/shared";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../auth/session.types";
import { AuthzService } from "./authz.service";
import { REQUIRED_PERMISSION } from "./require-permission.decorator";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | undefined {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return undefined;
  }
  return value;
}

/** Path/body/query projectId is routing intent only — AuthZ still verifies. */
export function routingProjectId(req: Request): string | undefined {
  const params = req.params ?? {};
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = req.query ?? {};
  return asUuid(params.projectId) ?? asUuid(body.projectId) ?? asUuid(query.projectId);
}

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
    await this.authz.assert(req.amberSession, permission, routingProjectId(req));
    return true;
  }
}
