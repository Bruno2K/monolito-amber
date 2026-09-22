import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { DenyByDefaultError } from "@amber/shared";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { readSessionToken } from "./session.cookie";
import type { AuthenticatedRequest } from "./session.types";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const token = readSessionToken(req.cookies, req.header("x-session-token") ?? undefined);
    req.amberSession = await this.auth.loadSessionByToken(token);
    if (!req.amberSession) {
      throw new DenyByDefaultError("Authentication required");
    }
    return true;
  }
}
