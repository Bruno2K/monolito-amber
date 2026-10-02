import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const EVIDENCE_M42 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.2");
const EVIDENCE_M43 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.3");
const EVIDENCE_M44 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.4");

const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("correct-horse-12");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");
}

test.describe("M4.2 Planning List", () => {
  test("M4.2-UI-01/02 shell reachability, list ids, states, a11y tabs", async ({ page }, testInfo) => {
    await signIn(page);
    await page.getByRole("link", { name: "Residencial Aurora - Torre A" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/overview`);
    await page.getByRole("link", { name: "Planejamento" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/planner`);
    await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Planejamento" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("tablist", { name: "Projeções de planejamento" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Atualizar malha estrutural")).toBeVisible();
    await expect(page.getByText("Issue relacionada: Choque de malha")).toBeVisible();
    await expect(page.getByText("Emitir planta atrasada")).toBeVisible();
    await expect(page.locator(".planner-late").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova Tarefa" })).toBeEnabled();

    mkdirSync(EVIDENCE_M42, { recursive: true });
    mkdirSync(EVIDENCE_M43, { recursive: true });
    mkdirSync(EVIDENCE_M44, { recursive: true });
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await page.screenshot({ path: path.join(EVIDENCE_M42, `planner-list-${tag}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`planner-${testInfo.project.name}.png`), fullPage: true });

    await page.getByRole("button", { name: /Atualizar malha estrutural/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_A}/planner\\?inspect=task-grid`));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atualizar malha estrutural" })).toBeVisible();
    await expect(page.getByText("A Issue não é esta Tarefa")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Histórico e auditoria" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bloquear" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Concluir" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE_M43, `inspector-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Nova Tarefa" }).click();
    await expect(page.getByRole("heading", { name: "Nova tarefa" })).toBeVisible();
    await page.getByLabel("Título").fill(`Mock create ${testInfo.project.name}`);
    await page.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(page.getByRole("heading", { name: `Mock create ${testInfo.project.name}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible();
    await page.getByRole("button", { name: "Iniciar" }).click();
    await expect(page.getByRole("dialog").locator(".status-pill")).toHaveText("Em andamento");
    await page.screenshot({ path: path.join(EVIDENCE_M43, `create-start-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("button", { name: /Lançar fundações/ }).click();
    await expect(page.getByRole("heading", { name: "Dependências (término-início)" })).toBeVisible();
    await expect(page.getByText("Aguardando predecessor")).toBeVisible();
    await expect(page.getByText(/não é o estado Bloqueada/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Predecessores" })).toBeVisible();
    await expect(page.getByText("Levantamento topográfico")).toBeVisible();
    await expect(page.getByLabel("Adicionar predecessor")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover predecessor" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE_M44, `inspector-deps-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Remover predecessor" }).click();
    await expect(page.getByText("Nenhum predecessor.")).toBeVisible();
    await page.getByLabel("Adicionar predecessor").selectOption("task-survey");
    await page.getByRole("button", { name: "Adicionar dependência" }).click();
    await expect(page.getByRole("button", { name: "Remover predecessor" })).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByLabel("Buscar tarefas").fill("zzzz-no-match");
    await expect(page.getByRole("heading", { name: "Nenhuma tarefa corresponde aos filtros" })).toBeVisible();

    await page.getByRole("tab", { name: "Kanban" }).click();
    await expect(page).toHaveURL(new RegExp(`view=kanban`));
    await expect(page.getByRole("heading", { name: /Kanban em um marco posterior/ })).toBeVisible();
  });

  test("M4.2-ADV unauthorized project deep link does not leak the other tenant", async ({ page }) => {
    await signIn(page);
    await page.goto(`/projects/${PROJECT_B}/planner`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await expect(page.getByText("Campus Norte")).toHaveCount(0);
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
  });
});
