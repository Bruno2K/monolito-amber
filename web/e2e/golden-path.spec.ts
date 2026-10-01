import { expect, test } from "@playwright/test";

const PROJECT_A = "33333333-3333-4333-8333-333333333333";

test.describe("M3.2 golden path", () => {
  test("sign-in → visible project → overview → org switch → prior project denied", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/projects");
    await expect(page.getByRole("heading", { name: "Todos os Projetos" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação do aplicativo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Todos os Projetos" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Meus Calendários")).toBeVisible();
    await expect(page.getByText("Disponível em um marco posterior").first()).toBeVisible();

    await page.getByRole("link", { name: "Residencial Aurora - Torre A" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/overview`);
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Visão Geral" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Trilha de navegação" })).toContainText("Residencial Aurora");
    await expect(page.getByText("Ativo", { exact: true })).toBeVisible();

    await page.getByLabel("Trocar Organization").selectOption({ label: "Atlas Partner" });
    await page.waitForURL("**/projects");
    await expect(page.getByRole("heading", { name: "Todos os Projetos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Campus Norte" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Residencial Aurora - Torre A" })).toHaveCount(0);

    await page.goto(`/projects/${PROJECT_A}/overview`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await expect(page.getByText("Você não tem permissão para acessar este recurso.")).toBeVisible();
  });

  test("keyboard landmarks and no color-only active state", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("correct-horse-12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/projects");

    await expect(page.getByRole("link", { name: "Ir para o conteúdo" })).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Ir para o conteúdo" })).toBeFocused();

    const active = page.getByRole("link", { name: "Todos os Projetos" });
    await expect(active).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".nav-item.is-active .nav-active-dot")).toHaveCount(1);

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação do aplicativo" })).toBeVisible();
  });
});
