import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedRequest, RequestSession } from "./session.types";

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestSession | null => {
    const req = ctx.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    return req.amberSession ?? null;
  },
);
