import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { ProblemDetailsFilter } from "./http/problem-details.filter";
import { logger } from "./observability/logger";
import { startOpenTelemetry } from "./observability/otel";
import { buildOpenApiDocument } from "./openapi/document";
import { SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  await startOpenTelemetry();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  SwaggerModule.setup("api/docs", app, buildOpenApiDocument(app));

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  logger.info({ port, bind: "0.0.0.0" }, "amber-api listening");
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "amber-api failed to start");
  process.exit(1);
});
