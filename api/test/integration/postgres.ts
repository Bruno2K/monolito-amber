import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

export interface TestDb {
  url: string;
  stop?: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDb> {
  if (process.env.TEST_DATABASE_URL) {
    return { url: process.env.TEST_DATABASE_URL };
  }

  try {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const container = await new PostgreSqlContainer("postgres:16-alpine").start();
    return {
      url: container.getConnectionUri(),
      stop: async () => {
        await container.stop();
      },
    };
  } catch (error) {
    throw new Error(
      `Integration tests require Testcontainers (Docker) or TEST_DATABASE_URL. ${(error as Error).message}`,
    );
  }
}

export function migrate(url: string): void {
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}

export function seed(url: string): void {
  execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
