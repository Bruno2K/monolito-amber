import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { AmberError } from "@amber/shared";
import type { Request, Response } from "express";
import { readCorrelationId } from "../observability/correlation";

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = readCorrelationId(req);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = "Internal Server Error";
    let detail = "Unexpected error";
    let code = "INTERNAL";

    if (exception instanceof AmberError) {
      status = exception.status;
      title = exception.name;
      detail = exception.message;
      code = exception.code;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      title = exception.name;
      detail = typeof payload === "string" ? payload : JSON.stringify(payload);
      code = "HTTP_EXCEPTION";
    }

    res.status(status).type("application/problem+json").json({
      type: `https://amber.invalid/problems/${code.toLowerCase()}`,
      title,
      status,
      detail,
      instance: req.originalUrl,
      correlationId,
      code,
    });
  }
}
