import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(__dirname, "..");
const migrationsDir = join(ROOT, "prisma/migrations");

if (!existsSync(migrationsDir)) {
  throw new Error("prisma/migrations is missing");
}

execFileSync("pnpm", ["exec", "prisma", "validate"], { cwd: ROOT, stdio: "inherit" });

const dirs = readdirSync(migrationsDir).filter((name) => name !== "migration_lock.toml");
if (dirs.length === 0) {
  throw new Error("No versioned Prisma migrations found");
}

let sql = "";
for (const dir of dirs) {
  const file = join(migrationsDir, dir, "migration.sql");
  if (!existsSync(file)) {
    throw new Error(`Missing ${file}`);
  }
  sql += readFileSync(file, "utf8");
}

if (!sql.includes("CREATE SCHEMA") && !sql.includes("CREATE SCHEMA IF NOT EXISTS")) {
  throw new Error("Expected module schemas in versioned migrations");
}
if (!sql.includes("amber_app")) {
  throw new Error("Expected amber_app role grants in migrations (F-09)");
}
const sqlLower = sql.toLowerCase();
if (!sqlLower.includes("revoke update") || !sqlLower.includes("delete") || !sqlLower.includes("schema audit")) {
  throw new Error("Expected REVOKE UPDATE/DELETE on audit for app role");
}
if (sql.includes("gate.override") || sql.includes("force_release") || sql.includes("forceRelease")) {
  throw new Error("Migrations must not introduce gate.override / forceRelease");
}

console.log("migration validate: OK");
