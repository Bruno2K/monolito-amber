import { expect, test } from "@playwright/test";

const PROJECT_A = "33333333-3333-4333-8333-333333333333";

test.describe("M3.5 Work Packages", () => {
  test("opens Pacotes list, inspector, filters, create, and activate", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: "Residencial Aurora - Torre A" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/overview`);
    await page.getByRole("link", { name: "Pacotes" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/work-packages`);
    await expect(page.getByRole("heading", { name: "Pacotes de trabalho" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pacotes" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.getByText("WP-PLAN-001")).toBeVisible();
    await page.getByRole("button", { name: /WP-PLAN-001/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A}/work-packages\\?inspect=wp-outline`));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/Status:/)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`work-packages-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Novo pacote" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Título").fill("E2E package");
    await page.getByRole("dialog").getByLabel("Fase", { exact: true }).selectOption("phase-concept");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog").getByText("E2E package")).toBeVisible();
    await page.getByRole("button", { name: "Ativar" }).click();
    await expect(page.getByRole("dialog").getByText(/Ativo/)).toBeVisible();
  });

  test("narrow overlay keeps the WorkPackage inspector usable at 1180px", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.goto(`/projects/${PROJECT_A}/work-packages?inspect=wp-outline`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pacotes de trabalho" })).toBeVisible();
    const inspector = page.getByRole("dialog");
    const box = await inspector.boundingBox();
    expect(box).toBeTruthy();
    expect((box?.width ?? 0) <= 1180).toBe(true);
  });
});
