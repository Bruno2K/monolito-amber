import "reflect-metadata";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { buildOpenApiDocument } from "./document";

async function main() {
  process.env.SKIP_DB = process.env.SKIP_DB ?? "1";
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  const document = buildOpenApiDocument(app);
  const out = resolve(__dirname, "../../openapi/openapi.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
