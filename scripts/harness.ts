/**
 * Prints the exact PF-1.0 harness sequence. Commands live in docs/agentic/harness.md.
 * This file exists so `pnpm harness` documents the contract; run those commands from the repo root.
 */
const commands = [
  "pnpm install --frozen-lockfile",
  "pnpm prisma:generate",
  "pnpm prisma:migrate",
  "pnpm prisma:seed",
  "DATABASE_URL=\"$TEST_DATABASE_URL\" pnpm prisma:migrate",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm test:unit",
  "pnpm test:security",
  "pnpm test:integration",
  "pnpm assert:no-gate-override",
  "pnpm build",
  "SKIP_DB=1 pnpm openapi:generate",
  "pnpm openapi:validate",
  "pnpm prisma:validate",
];

console.log("PF-1.0 harness (see docs/agentic/harness.md):\n");
for (const command of commands) {
  console.log(`  ${command}`);
}
