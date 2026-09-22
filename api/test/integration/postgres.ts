import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";

const ROOT = resolve(__dirname, "../../..");

export interface TestDb {
  url: string;
  stop?: () => Promise<void>;
}

async function isolatedUrlFromBase(baseUrl: string): Promise<TestDb> {
  const base = new URL(baseUrl);
  const dbName = `amber_it_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new URL(baseUrl);
  admin.pathname = "/postgres";
  const owner = decodeURIComponent(base.username || "amber");
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`CREATE DATABASE ${dbName} OWNER "${owner.replaceAll('"', "")}"`);
  await client.end();
  const isolated = new URL(baseUrl);
  isolated.pathname = `/${dbName}`;
  return {
    url: isolated.toString(),
    stop: async () => {
      const drop = new Client({ connectionString: admin.toString() });
      await drop.connect();
      await drop.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await drop.end();
    },
  };
}

export async function startTestDatabase(): Promise<TestDb> {
  if (process.env.TEST_DATABASE_URL) {
    return isolatedUrlFromBase(process.env.TEST_DATABASE_URL);
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
