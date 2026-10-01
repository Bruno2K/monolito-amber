import { expect, test, type Page } from "@playwright/test";
import { capture, IDS, logoutToSignIn, signInToOrg } from "./helpers";

async function expectOperationalHub(page: Page) {
  await expect(page.getByRole("heading", { name: "Visão Geral" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projeto e fase" })).toBeVisible();
  await expect(page.getByText("Alpha Tower").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Developed Design" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Progresso das entregas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bloqueados e atenção" })).toBeVisible();
}

test.describe("M3.8 local RC golden path (real API + Postgres)", () => {
  test("sign-in → org → project → Phase → Deliverable → WorkPackage → Hub → linked context → logout", async ({
    page,
  }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await expect(page.getByRole("heading", { name: "Todos os Projetos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alpha Tower" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alpha Plant" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Beta Campus" })).toHaveCount(0);
    await capture(page, testInfo, "golden-projects");

    await page.getByRole("link", { name: "Alpha Tower" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/overview`);
    await expectOperationalHub(page);
    await capture(page, testInfo, "golden-hub");

    await page.getByRole("link", { name: "Estrutura" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/structure`);
    await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
    await expect(page.getByText("ARCH")).toBeVisible();
    await expect(page.getByText("Concept")).toBeVisible();
    const tag = testInfo.project.name.includes("1180") ? "n" : "d";
    await page.getByRole("button", { name: "Nova Phase" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Nome").fill(`RC Detailed Design ${tag}`);
    await page.getByRole("dialog").getByLabel("Sequência").fill(tag === "n" ? "19" : "9");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: `RC Detailed Design ${tag}` })).toBeVisible();
    await page.getByRole("button", { name: "Ativar" }).click();
    await expect(page.getByRole("dialog").getByText("Status: Ativa")).toBeVisible();
    await capture(page, testInfo, "golden-structure");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("link", { name: "Entregas" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/deliverables`);
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await page.getByRole("button", { name: /DEL-ARCH-001/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pacotes ligados" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidências (Documentos / Revisões)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tarefas" })).toBeVisible();
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    await capture(page, testInfo, "golden-deliverable-context");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("button", { name: "Nova Entrega" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Código").fill(`DEL-RC-${tag.toUpperCase()}`);
    await page.getByRole("dialog").getByLabel("Título").fill(`RC pack ${tag}`);
    await page.getByRole("dialog").getByLabel("Fase").selectOption({ label: "Concept" });
    await page.getByRole("dialog").locator("#deliverable-discipline").selectOption({ label: "ARCH Architecture" });
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog").getByText(`RC pack ${tag}`)).toBeVisible();
    await page.getByRole("button", { name: "Iniciar" }).click();
    await expect(page.getByRole("dialog").getByText(/Em curso/)).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("link", { name: "Pacotes" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/work-packages`);
    await expect(page.getByRole("heading", { name: "Pacotes de trabalho" })).toBeVisible();
    await page.getByRole("button", { name: /WP-PLAN-001/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evidências (Documentos / Revisões)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tarefas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gates (somente leitura)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir entrega" })).toBeVisible();
    await capture(page, testInfo, "golden-work-package-context");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("button", { name: "Novo pacote" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Título").fill(`RC package ${tag}`);
    await page.getByRole("dialog").getByLabel("Fase").selectOption({ label: "Concept" });
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog").getByText(`RC package ${tag}`)).toBeVisible();
    await page.getByRole("button", { name: "Ativar" }).click();
    await expect(page.getByRole("dialog").getByText(/Ativo/)).toBeVisible();
    await page.getByLabel("Motivo do bloqueio").fill("RC blocked for homologation");
    await page.getByRole("button", { name: "Bloquear" }).click();
    await expect(page.getByRole("dialog").getByText(/Bloqueado|BLOCKED|motivo/)).toBeVisible();
    await page.getByRole("button", { name: "Desbloquear" }).click();
    await expect(page.getByRole("button", { name: "Concluir" })).toBeVisible();
    await page.getByRole("button", { name: "Concluir" }).click();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("link", { name: "Visão Geral" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/overview`);
    await expectOperationalHub(page);

    await page.getByRole("link", { name: "Entregas" }).click();
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await expect(page.getByText(`RC pack ${tag}`)).toBeVisible();

    await logoutToSignIn(page);
    await capture(page, testInfo, "golden-logout");
  });

  test("keyboard landmarks and skip link on the real shell", async ({ page }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
    await expect(skip).toHaveCount(1);
    await skip.focus();
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.getAttribute("href")))
      .toBe("#main-content");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação do aplicativo" })).toBeVisible();
    await capture(page, testInfo, "a11y-landmarks");
  });
});
