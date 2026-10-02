import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const EVIDENCE = path.resolve(process.cwd(), "../docs/ux/evidence/m4.8");
const PROJECT_A = "33333333-3333-4333-8333-333333333333";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("correct-horse-12");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");
}

test.describe("M4.8 mock viewport evidence", () => {
  test("captures List Kanban Gantt Marcos at both viewports", async ({ page }, testInfo) => {
    mkdirSync(EVIDENCE, { recursive: true });
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await signIn(page);
    await page.getByRole("link", { name: "Residencial Aurora - Torre A" }).click();
    await page.waitForURL(`**/projects/${PROJECT_A}/overview`);

    await page.goto(`/projects/${PROJECT_A}/planner`);
    await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `list-${tag}.png`), fullPage: true });

    await page.goto(`/projects/${PROJECT_A}/planner?view=kanban`);
    await expect(page.getByRole("region", { name: "Quadro Kanban" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `kanban-${tag}.png`), fullPage: true });

    await page.goto(`/projects/${PROJECT_A}/planner?view=gantt`);
    await expect(page.getByRole("region", { name: "Cronograma Gantt" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `gantt-${tag}.png`), fullPage: true });

    await page.goto(`/projects/${PROJECT_A}/planner?view=milestones`);
    await expect(page.getByRole("tab", { name: "Marcos" })).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: path.join(EVIDENCE, `marcos-${tag}.png`), fullPage: true });

    await page.getByRole("button", { name: "Concept freeze", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `marcos-risk-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.goto(`/projects/${PROJECT_A}/planner`);
    await page.getByRole("button", { name: /Atualizar malha estrutural/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `inspector-assigned-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("button", { name: /Lançar fundações/ }).click();
    await expect(page.locator(".planner-dep-block")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `inspector-start-block-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByLabel("Buscar tarefas").fill("zzzz-no-match");
    await expect(page.getByRole("heading", { name: "Nenhuma tarefa corresponde aos filtros" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `list-filtered-${tag}.png`), fullPage: true });

    await page.goto(`/projects/${PROJECT_A}/deliverables`);
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await page.getByRole("button", { name: /DEL-ARCH-001/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tarefas" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `deliverable-refs-${tag}.png`), fullPage: true });

    await page.goto("/projects/44444444-4444-4444-8444-444444444444/planner");
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `authz-forbidden-${tag}.png`), fullPage: true });
  });
});
