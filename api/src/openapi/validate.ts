import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAPIParser from "@readme/openapi-parser";
import { FORBIDDEN_API_TOKENS } from "@amber/shared";

async function main() {
  const path = resolve(__dirname, "../../openapi/openapi.json");
  const raw = readFileSync(path, "utf8");
  const document = JSON.parse(raw) as { openapi?: string };
  if (!document.openapi?.startsWith("3.1")) {
    throw new Error(`OpenAPI document must be 3.1.x, found ${document.openapi}`);
  }
  await OpenAPIParser.validate(path);
  for (const token of FORBIDDEN_API_TOKENS) {
    if (raw.includes(token)) {
      throw new Error(`OpenAPI artifact contains forbidden token: ${token}`);
    }
  }
  console.log("OpenAPI 3.1 valid; closed catalog tokens absent from artifact");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
