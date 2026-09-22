import { Injectable, NestMiddleware } from "@nestjs/common";
import { CORRELATION_HEADER, resolveCorrelationId } from "@amber/shared";
import type { NextFunction, Request, Response } from "express";

export const CORRELATION_REQUEST_KEY = "correlationId";

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.header(CORRELATION_HEADER);
    const correlationId = resolveCorrelationId(header);
    (req as Request & { correlationId: string }).correlationId = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  }
}

export function readCorrelationId(req: Request): string {
  return (req as Request & { correlationId?: string }).correlationId ?? resolveCorrelationId(undefined);
}
