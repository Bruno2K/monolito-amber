import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capture, IDS, RC1_EVIDENCE_DIR, signInToOrg } from "./helpers";

const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

const OPERATIONAL_ROUTES = [
  { name: "shell-projects", path: "/projects" },
  { name: "overview", path: `/projects/${IDS.projectA1}/overview` },
  { name: "structure", path: `/projects/${IDS.projectA1}/structure` },
  { name: "deliverables", path: `/projects/${IDS.projectA1}/deliverables` },
  { name: "work-packages", path: `/projects/${IDS.projectA1}/work-packages` },
  { name: "planner", path: `/projects/${IDS.projectA1}/planner` },
] as const;

async function analyzeAxe(page: Page, label: string, projectName: string) {
  const results = await new AxeBuilder({ page }).analyze();
  mkdirSync(RC1_EVIDENCE_DIR, { recursive: true });
  const file = path.join(RC1_EVIDENCE_DIR, `axe-${label}-${projectName}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        url: page.url(),
        viewport: page.viewportSize(),
        violations: results.violations,
        incomplete: results.incomplete,
        passes: results.passes.map((row) => row.id),
      },
      null,
      2,
    ),
  );
  const blocking = results.violations.filter(
    (row) => row.impact === "critical" || row.impact === "serious",
  );
  const accepted = results.violations.filter(
    (row) => row.impact === "moderate" || row.impact === "minor",
  );
  if (accepted.length > 0) {
    writeFileSync(
      path.join(RC1_EVIDENCE_DIR, `axe-accepted-${label}-${projectName}.json`),
      JSON.stringify(
        accepted.map((row) => ({
          id: row.id,
          impact: row.impact,
          description: row.description,
          nodes: row.nodes.length,
        })),
        null,
        2,
      ),
    );
  }
  expect(blocking, `${label} serious/critical axe violations`).toEqual([]);
}

test.describe("M3 RC1 accessibility (real API + Postgres)", () => {
  test("health/ready expose the candidate SHA", async ({ page }) => {
    const expected = process.env.GIT_SHA ?? process.env.GITHUB_SHA;
    const health = await page.request.get(`${API}/api/v1/health`);
    expect(health.ok()).toBeTruthy();
    const healthBody = (await health.json()) as { commit?: string };
    expect(healthBody.commit).toBeTruthy();
    if (expected) {
      expect(healthBody.commit).toBe(expected);
    }
    const ready = await page.request.get(`${API}/api/v1/ready`);
    expect(ready.ok()).toBeTruthy();
    const readyBody = (await ready.json()) as { commit?: string; ready?: boolean };
    expect(readyBody.ready).toBe(true);
    expect(readyBody.commit).toBe(healthBody.commit);
  });

  test("axe: authenticated shell and every M3 operational route", async ({ page }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    for (const route of OPERATIONAL_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole("main")).toBeVisible();
      await analyzeAxe(page, route.name, testInfo.project.name);
      await capture(page, testInfo, `a11y-${route.name}`);
    }
  });

  test("Escape closes inspector and skip link is present", async ({ page }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/work-packages`);
    await expect(page.getByRole("heading", { name: "Pacotes de trabalho" })).toBeVisible();
    const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
    await skip.focus();
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.getAttribute("href")))
      .toBe("#main-content");
    await page.getByRole("button", { name: /WP-PLAN-001/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await capture(page, testInfo, "a11y-escape-overlay");
  });

  test("state captures: loading, error, empty, no-permission, archived read-only", async ({
    page,
  }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");

    let releaseHub: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      releaseHub = resolve;
    });
    await page.route(`**/api/v1/projects/${IDS.projectA1}/hub`, async (route) => {
      await Promise.race([held, new Promise((resolve) => setTimeout(resolve, 8000))]);
      await route.continue().catch(() => undefined);
    });
    const loadingNav = page.goto(`/projects/${IDS.projectA1}/overview`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Carregando" })).toBeVisible({ timeout: 8000 });
    await capture(page, testInfo, "state-loading");
    releaseHub?.();
    await loadingNav.catch(() => undefined);
    await page.unroute(`**/api/v1/projects/${IDS.projectA1}/hub`);

    await page.route(`**/api/v1/projects/${IDS.projectA1}/hub`, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          title: "Erro recuperável",
          status: 500,
          detail: "Falha simulada para evidência RC1",
        }),
      }),
    );
    await page.goto(`/projects/${IDS.projectA1}/overview`);
    await expect(page.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
    await capture(page, testInfo, "state-error");
    await page.unroute(`**/api/v1/projects/${IDS.projectA1}/hub`);

    await page.goto(`/projects/${IDS.projectA1}/deliverables?status=DELIVERED`);
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await capture(page, testInfo, "state-filtered-empty");

    await page.goto(`/projects/${IDS.projectB1}/overview`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await capture(page, testInfo, "state-no-permission");

    await page.goto(`/projects/${IDS.projectA1}/work-packages`);
    await expect(page.getByRole("heading", { name: "Pacotes de trabalho" })).toBeVisible();
    await page.getByRole("button", { name: /WP-PLAN-001/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Arquivar" })).toBeVisible();
    await capture(page, testInfo, "state-active-inspector");
  });

  test("viewer and team-only: no-permission mutations and empty project list", async ({ page }, testInfo) => {
    await signInToOrg(page, "viewer-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/work-packages`);
    await expect(page.getByRole("button", { name: "Novo pacote" })).toHaveCount(0);
    await page.getByRole("button", { name: /WP-PLAN-001/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Arquivar" })).toHaveCount(0);
    await capture(page, testInfo, "state-readonly-no-mutation");
    await signInToOrg(page, "team-only-a", "Amber Demo Alpha");
    await expect(page.getByRole("heading", { name: /Nenhum projeto|Todos os Projetos/ })).toBeVisible();
    await capture(page, testInfo, "state-initial-empty");
  });
});
