import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FORBIDDEN_API_TOKENS,
  FORBIDDEN_PERMISSIONS,
  PERMISSIONS,
  ROLE_TEMPLATES,
} from "../packages/shared/src/index.ts";

const ROOT = join(__dirname, "..");
const violations: string[] = [];

for (const token of FORBIDDEN_API_TOKENS) {
  if ((PERMISSIONS as readonly string[]).includes(token)) {
    violations.push(`PERMISSIONS includes forbidden token ${token}`);
  }
}

for (const template of ROLE_TEMPLATES) {
  for (const code of template.permissions) {
    if ((FORBIDDEN_PERMISSIONS as readonly string[]).includes(code)) {
      violations.push(`Role template ${template.key} grants forbidden ${code}`);
    }
  }
}

const openapiPath = join(ROOT, "api/openapi/openapi.json");
if (existsSync(openapiPath)) {
  const raw = readFileSync(openapiPath, "utf8");
  for (const token of FORBIDDEN_API_TOKENS) {
    if (raw.includes(token)) {
      violations.push(`OpenAPI artifact contains ${token}`);
    }
  }
}

const TARGETS = ["packages/shared/src/permissions.ts", "prisma/seed.ts", "prisma/schema.prisma", "api/src"];

function walk(path: string, acc: string[] = []): string[] {
  if (!existsSync(path)) {
    return acc;
  }
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name === "dist" || name === ".next") continue;
      walk(join(path, name), acc);
    }
  } else if (/\.(ts|tsx|js|json|prisma)$/.test(path)) {
    acc.push(path);
  }
  return acc;
}

const ALLOW_LINE =
  /forbidden|absent|intentionally|must not|never |not in the closed|not\.to(contain|be)|to\.throw|assertclosedcatalog|forbidden_permissions|forbidden_api_tokens|no `?gate\.override|sole (gate )?bypass|closed catalog/i;

function isDefinitionLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("export const FORBIDDEN") ||
    trimmed.startsWith('"gate.override"') ||
    trimmed.startsWith('"forceRelease"') ||
    trimmed.startsWith('"force_release"') ||
    trimmed.startsWith('"override=true"') ||
    trimmed.includes("FORBIDDEN_PERMISSIONS") ||
    trimmed.includes("FORBIDDEN_API_TOKENS")
  );
}

for (const file of TARGETS.flatMap((rel) => walk(join(ROOT, rel)))) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const token of FORBIDDEN_API_TOKENS) {
      if (!line.includes(token)) continue;
      if (isDefinitionLine(line) || ALLOW_LINE.test(line)) continue;
      violations.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("Forbidden Gate bypass tokens found:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("assert-no-gate-override: OK");
