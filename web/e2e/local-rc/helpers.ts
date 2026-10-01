import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { M3_SEED_PASSWORD, M3_SEED_USERS } from "../../../packages/shared/src/m3-seed-design.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EVIDENCE_DIR = path.resolve(HERE, "../../../docs/development/m3.8-evidence");

export const WEB = process.env.AMBER_WEB_URL ?? "http://127.0.0.1:3000";
export const SEED_PASSWORD = process.env.AMBER_E2E_PASSWORD ?? M3_SEED_PASSWORD;

export function seedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export const IDS = {
  orgA: seedUuid("org:org-a"),
  orgB: seedUuid("org:org-b"),
  projectA1: seedUuid("project:project-a1"),
  projectA2: seedUuid("project:project-a2"),
  projectB1: seedUuid("project:project-b1"),
  phaseConcept: seedUuid("phase:phase-a1-planned"),
  delArch001: seedUuid("del:del-a1-planned-user"),
  wpOutline: seedUuid("wp:wp-planned"),
};

export function emailFor(key: string): string {
  const row = M3_SEED_USERS.find((user) => user.key === key);
  if (!row) {
    throw new Error(`unknown seed user ${key}`);
  }
  return row.email;
}

export async function signIn(page: Page, userKey: string): Promise<void> {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(emailFor(userKey));
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function selectOrg(page: Page, orgName: string): Promise<void> {
  await page.waitForURL("**/org-switch");
  await expect(page.getByRole("heading", { name: "Switch organization" })).toBeVisible();
  const row = page.locator("li").filter({ hasText: orgName });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Switch" }).click();
  await page.waitForURL("**/projects");
}

export async function signInToOrg(page: Page, userKey: string, orgName: string): Promise<void> {
  await signIn(page, userKey);
  await selectOrg(page, orgName);
}

export async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = `${name}-${testInfo.project.name}.png`;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, file), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath(file), fullPage: true });
}

export function apiFrom(page: Page): APIRequestContext {
  return page.request;
}

export async function apiJson(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  apiPath: string,
  options?: { data?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await page.request.fetch(`${WEB}${apiPath}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(options?.headers ?? {}),
    },
    data: options?.data,
  });
  const text = await response.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status(), body };
}
