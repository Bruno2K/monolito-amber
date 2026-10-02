import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { apiJson, capture, IDS, signInToOrg } from "./helpers";

const EVIDENCE_M42 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.2");
const EVIDENCE_M43 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.3");

test.describe("M4.2 Local RC Planning List", () => {
  test("M4.2-UI-01/NARROW-01 Planejamento is reachable and List matches the query", async ({ page }, testInfo) => {
    mkdirSync(EVIDENCE_M42, { recursive: true });
    mkdirSync(EVIDENCE_M43, { recursive: true });
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.getByRole("link", { name: "Alpha Tower" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/overview`);

    await page.getByRole("link", { name: "Planejamento" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/planner`);
    await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Nova Tarefa" })).toBeEnabled();

    const created = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m43-${testInfo.project.name}-${Date.now()}` },
      data: {
        title: `RC Planner ${testInfo.project.name}`,
        dueDate: "2020-01-02T00:00:00.000Z",
        progressPercent: 15,
      },
    });
    expect(created.status).toBeLessThan(400);
    const taskId = String(created.body.id);

    await page.goto(`/projects/${IDS.projectA1}/planner?q=${encodeURIComponent(`RC Planner ${testInfo.project.name}`)}`);
    await expect(page.getByText(`RC Planner ${testInfo.project.name}`)).toBeVisible();
    await expect(page.locator(".planner-late").first()).toBeVisible();

    const listed = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=list&q=${encodeURIComponent(`RC Planner ${testInfo.project.name}`)}`);
    expect(listed.status).toBe(200);
    const tasks = (listed.body.tasks as Array<{ id: string; title: string; late?: boolean; status: string }>) ?? [];
    expect(tasks.some((row) => row.id === taskId)).toBe(true);
    expect(tasks.find((row) => row.id === taskId)?.late).toBe(true);
    expect(tasks.find((row) => row.id === taskId)?.status).toBe("TODO");

    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await page.screenshot({ path: path.join(EVIDENCE_M42, `planner-list-${tag}.png`), fullPage: true });
    await capture(page, testInfo, `planner-list`);

    await page.goto(`/projects/${IDS.projectA1}/planner?inspect=${taskId}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/status armazenado permanece/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Histórico e auditoria" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE_M43, `inspector-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Iniciar" }).click();
    await expect(page.getByRole("dialog").locator(".status-pill")).toHaveText("Em andamento");
    await page.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByText(/não altera Issue/i)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar conclusão" }).click();
    await expect(page.getByRole("dialog").locator(".status-pill")).toHaveText("Concluída");
    await capture(page, testInfo, `planner-inspector`);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Nova Tarefa" }).click();
    await expect(page.getByRole("heading", { name: "Nova tarefa" })).toBeVisible();
    await page.getByLabel("Título").fill(`UI create ${testInfo.project.name}`);
    await page.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(page.getByRole("heading", { name: `UI create ${testInfo.project.name}` })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE_M43, `create-${tag}.png`), fullPage: true });
  });

  test("M4.2-UI-02 filtered empty and M4.2-ADV-01 unauthorized inspect", async ({ page }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/planner?q=zzz-no-such-task`);
    await expect(page.getByRole("heading", { name: "Nenhuma tarefa corresponde aos filtros" })).toBeVisible();

    await page.goto(`/projects/${IDS.projectB1}/planner?inspect=${IDS.projectA1}`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await expect(page.getByText("Beta Campus")).toHaveCount(0);
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    await capture(page, testInfo, "planner-forbidden");
  });
});
