import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../../src/app.module";
import { ProblemDetailsFilter } from "../../src/http/problem-details.filter";

export async function createTestApp(databaseUrl: string): Promise<INestApplication> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SKIP_DB = "";
  process.env.SESSION_COOKIE_SECURE = "false";
  process.env.NODE_ENV = "test";
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();
  return app;
}

export function cookieHeader(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .map((entry) => String(entry).split(";")[0])
    .filter(Boolean)
    .join("; ");
}
