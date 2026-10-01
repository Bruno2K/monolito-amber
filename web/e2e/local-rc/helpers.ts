import { createHash } from "node:crypto";
import path from "node:path";
import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

/** Well-known local synthetic (packages/shared M3_SEED_PASSWORD). Not a production secret. */
export const SEED_PASSWORD = process.env.AMBER_E2E_PASSWORD ?? "correct-horse-12";

export const EVIDENCE_DIR = path.resolve(process.cwd(), "../docs/development/m3.8-evidence");

export const WEB = process.env.AMBER_WEB_URL ?? "http://127.0.0.1:3000";

const EMAILS: Record<string, string> = {
  "coord-a": "coordinator.a@amber.test",
  "coord-b": "coordinator.b@amber.test",
  "discipline-a": "discipline.a@amber.test",
  "contributor-a": "contributor.a@amber.test",
  "viewer-a": "viewer.a@amber.test",
  "external-a": "external.a@amber.test",
  "suspended-a": "suspended.a@amber.test",
  "removed-a": "removed.a@amber.test",
  unauthorized: "unauthorized@amber.test",
  "team-only-a": "team.only.a@amber.test",
};

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
  const email = EMAILS[key];
  if (!email) {
    throw new Error(`unknown seed user ${key}`);
  }
  return email;
}

export async function expectSignIn(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeEditable();
}

export async function expectOrgSwitch(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: /Switch organization|Organization necessária/ }).first(),
  ).toBeVisible();
}

/** Seed login lands on org-switch (no active org) or, if a session already has an org, /projects. */
export async function expectPostAuthLanded(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", {
      name: /Switch organization|Organization necessária|Todos os Projetos|Nenhum projeto/,
    }).first(),
  ).toBeVisible();
}

/** Unauthenticated project routes may land on /sign-in?next=… or the session StateScreen. */
export async function expectUnauthenticatedSurface(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /Sign in|Sessão necessária|Sessão encerrada/ })).toBeVisible();
}

export async function closeInspectorIfOpen(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Fechar", exact: true });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}

export async function signIn(page: Page, userKey: string): Promise<void> {
  await page.goto("/sign-in");
  await expectSignIn(page);
  await page.getByLabel("Email").fill(emailFor(userKey));
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  const loginPost = page.waitForResponse(
    (res) => res.url().includes("/api/v1/auth/login") && res.request().method() === "POST",
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  await loginPost;
  await page.waitForURL((url) => {
    const path = url.pathname;
    return path.includes("/org-switch") || path.startsWith("/projects") || path.includes("/mfa/");
  }, { timeout: 20_000 });
  await expectPostAuthLanded(page);
}

export async function selectOrg(page: Page, orgName: string): Promise<void> {
  const projects = page.getByRole("heading", { name: /Todos os Projetos|Nenhum projeto/ });
  if (await projects.isVisible().catch(() => false)) {
    return;
  }
  await expectOrgSwitch(page);
  const row = page.locator("li").filter({ hasText: orgName });
  await expect(row).toBeVisible();
  const switchBtn = row.getByRole("button", { name: "Switch" });
  if ((await switchBtn.count()) === 0) {
    return;
  }
  await switchBtn.click();
  await expect(projects).toBeVisible();
}

export async function signInToOrg(page: Page, userKey: string, orgName: string): Promise<void> {
  await signIn(page, userKey);
  await selectOrg(page, orgName);
}

export async function logoutToSignIn(page: Page): Promise<void> {
  await closeInspectorIfOpen(page);
  await page.getByRole("button", { name: "Sair" }).click({ force: true });
  await expectSignIn(page);
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
