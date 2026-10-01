import { expect, test } from "@playwright/test";

const PROJECT_A = "33333333-3333-4333-8333-333333333333";

test.describe("M3.3 structure", () => {
  test("opens ordered Phases, Discipline context, inspector, and a stable deep link", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: "Residencial Aurora - Torre A" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/overview`);
    await page.getByRole("link", { name: "Estrutura" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/structure`);
    await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Estrutura" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("ARCH")).toBeVisible();
    await expect(page.getByText("Concept")).toBeVisible();
    await expect(page.getByText("Brief")).toBeVisible();
    await page.getByRole("button", { name: /Concept/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A}/structure\\?phase=phase-concept`));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Status:")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`structure-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("narrow overlay keeps the inspector usable at 1180px", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.goto(`/projects/${PROJECT_A}/structure?phase=phase-concept`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
    const inspector = page.getByRole("dialog");
    const box = await inspector.boundingBox();
    expect(box).toBeTruthy();
    expect((box?.width ?? 0) <= 1180).toBe(true);
  });
});
