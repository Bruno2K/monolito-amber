import { expect, test } from "@playwright/test";

const PROJECT_A = "33333333-3333-4333-8333-333333333333";

test.describe("M3.6 Operational Project Hub", () => {
  test("sign-in → project hub → Entregas and Pacotes drill-down", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: "Residencial Aurora - Torre A" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/overview`);

    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Visão Geral" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Projeto e fase" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Progresso das entregas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bloqueados e atenção" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Concept", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "DEL-ARCH-001 · Concept pack" })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`hub-${testInfo.project.name}.png`),
      fullPage: true,
    });

    await page.getByRole("link", { name: "DEL-ARCH-001 · Concept pack" }).click();
    await page.waitForURL(new RegExp(`/projects/${PROJECT_A}/deliverables\\?inspect=del-arch-001`));
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.goto(`/projects/${PROJECT_A}/overview`);
    await page.getByRole("link", { name: "WP-PLAN-001 · Outline programme" }).click();
    await page.waitForURL(new RegExp(`/projects/${PROJECT_A}/work-packages\\?inspect=`));
    await expect(page.getByRole("heading", { name: "Pacotes de trabalho" })).toBeVisible();
  });

  test("narrow viewport stacks hub cards", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.goto(`/projects/${PROJECT_A}/overview`);
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
    const grid = page.locator(".hub-grid");
    const box = await grid.boundingBox();
    expect(box).toBeTruthy();
    expect((box?.width ?? 0) <= 1180).toBe(true);
  });
});
