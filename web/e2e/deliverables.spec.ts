import { expect, test } from "@playwright/test";

const PROJECT_A = "33333333-3333-4333-8333-333333333333";

test.describe("M3.4 Entregas", () => {
  test("opens Entregas list, inspector, create, assign, and start", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.getByRole("link", { name: "Residencial Aurora - Torre A" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/overview`);
    await page.getByRole("link", { name: "Entregas" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/deliverables`);
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Entregas" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.getByText("DEL-ARCH-001")).toBeVisible();
    await page.getByRole("button", { name: /DEL-ARCH-001/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A}/deliverables\\?inspect=del-arch-001`));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/Status:/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pacotes ligados" })).toBeVisible();
    await expect(page.getByRole("dialog").getByText("WP-PLAN-001")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`entregas-${testInfo.project.name}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Nova Entrega" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Código").fill("DEL-E2E-001");
    await page.getByRole("dialog").getByLabel("Título").fill("E2E pack");
    await page.getByRole("dialog").getByLabel("Fase").selectOption("phase-concept");
    await page.getByRole("dialog").getByLabel("Disciplina").selectOption("disc-arch");
    await page.getByRole("dialog").locator('select[name="ownerKind"]').selectOption("user");
    await page.getByRole("dialog").locator('select[name="ownerProjectMembershipId"]').selectOption("pm-ada");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog").getByText("E2E pack")).toBeVisible();
    await page.getByRole("button", { name: "Iniciar" }).click();
    await expect(page.getByRole("dialog").getByText(/Em curso/)).toBeVisible();
  });

  test("narrow overlay keeps the Entregas inspector usable at 1180px", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");
    await page.goto(`/projects/${PROJECT_A}/deliverables?inspect=del-arch-001`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    const inspector = page.getByRole("dialog");
    const box = await inspector.boundingBox();
    expect(box).toBeTruthy();
    expect((box?.width ?? 0) <= 1180).toBe(true);
  });
});
