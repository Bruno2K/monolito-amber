import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const EVIDENCE_M42 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.2");
const EVIDENCE_M43 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.3");
const EVIDENCE_M44 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.4");
const EVIDENCE_M45 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.5");
const EVIDENCE_M46 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.6");
const EVIDENCE_M47 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.7");

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
    mkdirSync(EVIDENCE_M45, { recursive: true });
    mkdirSync(EVIDENCE_M46, { recursive: true });
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
    await expect(page.locator(".planner-dep-block")).toBeVisible();
    await expect(page.locator(".planner-dep-block")).toContainText(/não é o estado Bloqueada/i);
    await expect(page.getByRole("heading", { name: "Predecessores" })).toBeVisible();
    await expect(page.locator(".planner-deps").getByText("Levantamento topográfico")).toBeVisible();
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

    await page.goto(`/projects/${PROJECT_A}/planner?view=kanban&q=zzzz-no-match`);
    await expect(page).toHaveURL(new RegExp(`view=kanban`));
    await expect(page.getByRole("heading", { name: "Nenhuma tarefa corresponde aos filtros" })).toBeVisible();
    await page.goto(`/projects/${PROJECT_A}/planner?view=kanban`);
    await expect(page.getByRole("region", { name: "Quadro Kanban" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PLANEJADAS" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "EM ANDAMENTO" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "EM RISCO" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "BLOQUEADAS" })).toBeVisible();
    await expect(page.getByText(/EM RISCO é atraso derivado/i)).toBeVisible();
    await expect(page.locator('[data-kanban-column="EM_RISCO"] [data-task-id="task-late"]')).toBeVisible();
    await expect(page.locator('[data-kanban-column="EM_ANDAMENTO"] [data-task-id="task-grid"]')).toBeVisible();
    await expect(page.locator('[data-task-id="task-late"]')).toHaveCount(1);
    await page.screenshot({ path: path.join(EVIDENCE_M45, `kanban-${tag}.png`), fullPage: true });
  });

  test("M4.5-UI-02/03 List and Kanban stay consistent; invalid drop and keyboard move", async ({ page }, testInfo) => {
    await signIn(page);
    const title = `Kanban move ${testInfo.project.name} ${Date.now()}`;
    const created = await page.request.post(`/api/v1/projects/${PROJECT_A}/tasks`, {
      headers: { "Idempotency-Key": `m45-move-${testInfo.project.name}-${Date.now()}` },
      data: { title },
    });
    expect(created.ok()).toBeTruthy();
    const task = (await created.json()) as { id: string };
    await page.goto(`/projects/${PROJECT_A}/planner?view=kanban&q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("region", { name: "Quadro Kanban" })).toBeVisible();
    const card = page.locator(`[data-task-id="${task.id}"]`);
    await expect(page.locator(`[data-kanban-column="PLANEJADAS"] [data-task-id="${task.id}"]`)).toBeVisible();
    await card.dragTo(page.locator('[data-kanban-column="EM_RISCO"]'));
    await expect(page.locator(".kanban-shell [role='alert']")).toContainText(/visão derivada/i);
    await expect(page.locator(`[data-kanban-column="PLANEJADAS"] [data-task-id="${task.id}"]`)).toBeVisible();

    await page.getByLabel(`Mover ${title}`).selectOption("EM_ANDAMENTO");
    await expect(page.locator(`[data-kanban-column="EM_ANDAMENTO"] [data-task-id="${task.id}"]`)).toBeVisible();

    await page.getByRole("tab", { name: "Lista" }).click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByRole("dialog").locator(".status-pill")).toHaveText("Em andamento");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("tab", { name: "Kanban" }).click();
    await expect(page.locator(`[data-kanban-column="EM_ANDAMENTO"] [data-task-id="${task.id}"]`)).toBeVisible();

    await page.goto(`/projects/${PROJECT_A}/planner?view=kanban`);
    await page.getByLabel("Mover Lançar fundações").selectOption("EM_ANDAMENTO");
    await expect(page.locator(".kanban-shell [role='alert']")).toContainText(
      /prerequisite|predecessor|término-início|finish-to-start/i,
    );
    await expect(page.locator('[data-kanban-column="PLANEJADAS"] [data-task-id="task-waiting"]')).toBeVisible();
  });

  test("M4.5-ADV concurrency rejection restores the card", async ({ page }, testInfo) => {
    await signIn(page);
    const title = `Kanban stale ${testInfo.project.name} ${Date.now()}`;
    const created = await page.request.post(`/api/v1/projects/${PROJECT_A}/tasks`, {
      headers: { "Idempotency-Key": `m45-stale-${testInfo.project.name}-${Date.now()}` },
      data: { title },
    });
    expect(created.ok()).toBeTruthy();
    const task = (await created.json()) as { id: string; version: number };
    await page.goto(`/projects/${PROJECT_A}/planner?view=kanban&q=${encodeURIComponent(title)}`);
    await expect(page.locator(`[data-task-id="${task.id}"]`)).toBeVisible();
    const bumped = await page.request.post(`/api/v1/projects/${PROJECT_A}/tasks/${task.id}/start`, {
      headers: { "Idempotency-Key": `m45-stale-start-${testInfo.project.name}-${Date.now()}` },
      data: { expectedVersion: task.version },
    });
    expect(bumped.ok()).toBeTruthy();
    await page.getByLabel(`Mover ${title}`).selectOption("EM_ANDAMENTO");
    await expect(page.locator(".kanban-shell [role='alert']")).toContainText(/Optimistic lock|versão|conflito/i);
    await expect(page.locator(`[data-kanban-column="PLANEJADAS"] [data-task-id="${task.id}"]`)).toBeVisible();
  });

  test("M4.6-UI Gantt projection, table date edit, stale collision, dependency rejection", async ({ page }, testInfo) => {
    await signIn(page);
    mkdirSync(EVIDENCE_M46, { recursive: true });
    const title = `Gantt edit ${testInfo.project.name} ${Date.now()}`;
    const created = await page.request.post(`/api/v1/projects/${PROJECT_A}/tasks`, {
      headers: { "Idempotency-Key": `m46-create-${testInfo.project.name}-${Date.now()}` },
      data: {
        title,
        plannedStartAt: "2026-10-02T00:00:00.000Z",
        dueDate: "2026-10-09T00:00:00.000Z",
      },
    });
    expect(created.ok()).toBeTruthy();
    const task = (await created.json()) as { id: string; version: number };

    await page.goto(`/projects/${PROJECT_A}/planner?view=gantt&q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("region", { name: "Cronograma Gantt" })).toBeVisible();
    await expect(page.getByText("Hierarquia")).toBeVisible();
    await expect(page.locator('[data-lane-kind="TASK"][data-source-id="' + task.id + '"]').first()).toBeVisible();
    await expect(page.getByText("Tabela de datas do cronograma", { exact: false })).toBeVisible();
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await page.screenshot({ path: path.join(EVIDENCE_M46, `gantt-${tag}.png`), fullPage: true });

    await page.getByLabel("Tarefa cujas datas serão salvas").selectOption(task.id);
    const startInput = page.locator(`#gantt-dates-${task.id}`);
    await startInput.scrollIntoViewIfNeeded();
    await startInput.fill("2026-10-04");
    await page.locator(`input[name="due-${task.id}"]`).fill("2026-10-12");
    await page.getByRole("button", { name: "Salvar datas da tarefa" }).click();
    await expect(page.locator(".gantt-status")).toContainText(/Sucessores e pais não foram deslocados/i);

    await page.goto(`/projects/${PROJECT_A}/planner?q=${encodeURIComponent(title)}`);
    await expect(page.locator(".planner-table").getByRole("button", { name: new RegExp(title) })).toBeVisible();
    await expect(page.locator(".planner-table")).toContainText("2026-10-04 / 2026-10-12");

    await page.getByRole("tab", { name: "Gantt" }).click();
    await expect(page.locator(`#gantt-dates-${task.id}`)).toHaveValue("2026-10-04");

    const stale = await page.request.patch(`/api/v1/projects/${PROJECT_A}/tasks/${task.id}`, {
      headers: { "Idempotency-Key": `m46-stale-${testInfo.project.name}-${Date.now()}` },
      data: {
        dueDate: "2026-10-20T00:00:00.000Z",
        expectedVersion: task.version,
      },
    });
    expect(stale.ok()).toBeFalsy();

    const current = await page.request.get(`/api/v1/projects/${PROJECT_A}/tasks/${task.id}`);
    expect(current.ok()).toBeTruthy();
    const currentTask = (await current.json()) as { version: number };
    const propagate = await page.request.patch(`/api/v1/projects/${PROJECT_A}/tasks/${task.id}`, {
      headers: { "Idempotency-Key": `m46-prop-${testInfo.project.name}-${Date.now()}` },
      data: {
        dueDate: "2026-10-22T00:00:00.000Z",
        expectedVersion: currentTask.version,
        propagateDates: true,
      },
    });
    expect(propagate.ok()).toBeFalsy();
    expect(JSON.stringify(await propagate.json())).toMatch(/DEPENDENCY_DATE_SHIFT_REJECTED|do not propagate/i);

    await page.getByLabel("Também deslocar sucessores").check();
    await page.getByRole("button", { name: "Salvar datas da tarefa" }).click();
    await expect(page.locator(".gantt-alert")).toContainText(/não se propagam|sucessores/i);

    await page.goto(`/projects/${PROJECT_A}/planner?view=gantt`);
    await expect(page.locator('[data-lane-kind="PHASE"]').first()).toBeVisible();
    await expect(page.locator('[data-lane-kind="DELIVERABLE"]').first()).toBeVisible();
    await expect(page.locator('[data-lane-kind="WORK_PACKAGE"]').first()).toBeVisible();
    await expect(page.locator('[data-lane-kind="MILESTONE"]').first()).toBeVisible();
    await expect(page.locator(".gantt-diamond").first()).toBeVisible();

    const startBlocked = await page.request.post(`/api/v1/projects/${PROJECT_A}/tasks/task-waiting/start`, {
      headers: { "Idempotency-Key": `m46-start-${testInfo.project.name}-${Date.now()}` },
      data: { expectedVersion: 1 },
    });
    expect(startBlocked.ok()).toBeFalsy();
    expect(JSON.stringify(await startBlocked.json())).toMatch(/predecessor|DEPENDENCY|término-início|finish-to-start/i);
  });

  test("M4.7-UI Marcos KPIs, derived chips, explicit achieve, and evidence", async ({ page }, testInfo) => {
    await signIn(page);
    mkdirSync(EVIDENCE_M47, { recursive: true });
    await page.goto(`/projects/${PROJECT_A}/planner?view=milestones`);
    await expect(page.getByRole("tab", { name: "Marcos" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-node-id="242:6853"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Próximo marco" })).toBeVisible();
    await expect(page.getByText(/não são controles de status/i)).toBeVisible();
    await expect(page.getByText("Concept freeze")).toBeVisible();
    await expect(page.getByText("Em risco").first()).toBeVisible();
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await page.screenshot({ path: path.join(EVIDENCE_M47, `marcos-${tag}.png`), fullPage: true });

    await page.getByRole("button", { name: /Concept freeze/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/LINKED_TASK_LATE|atrasada/i)).toBeVisible();
    await expect(page.getByText(/Issue permanece fora da posse/i)).toBeVisible();
    await expect(page.locator('select[name="status"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Alcançar" }).click();
    await page.getByRole("button", { name: "Confirmar alcance" }).click();
    await expect(page.getByText(/Armazenado Concluído/i)).toBeVisible();

    const list = await page.request.get(`/api/v1/projects/${PROJECT_A}/planning?view=list`);
    const gantt = await page.request.get(`/api/v1/projects/${PROJECT_A}/planning?view=gantt`);
    const marcos = await page.request.get(`/api/v1/projects/${PROJECT_A}/planning?view=milestones`);
    const listed = ((await list.json()) as { milestones: Array<{ id: string; status: string; risk?: { explanation: string } }> }).milestones.find((row) => row.id === "ms-concept");
    const projected = ((await marcos.json()) as { milestones: Array<{ id: string; status: string; risk?: { explanation: string } }> }).milestones.find((row) => row.id === "ms-concept");
    const lane = ((await gantt.json()) as { schedule: { lanes: Array<{ id: string; kind: string; status: string | null }> } }).schedule.lanes.find((row) => row.kind === "MILESTONE" && row.id === "ms-concept");
    expect(listed?.status).toBe("ACHIEVED");
    expect(projected?.status).toBe("ACHIEVED");
    expect(lane?.status).toBe("ACHIEVED");
    expect(listed?.risk?.explanation).toBe(projected?.risk?.explanation);

    await page.getByLabel("Buscar marcos").fill("zzzz-no-match");
    await expect(page.getByRole("heading", { name: /Nenhum marco corresponde/i })).toBeVisible();
  });

  test("M4.2-ADV unauthorized project deep link does not leak the other tenant", async ({ page }) => {
    await signIn(page);
    await page.goto(`/projects/${PROJECT_B}/planner`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await expect(page.getByText("Campus Norte")).toHaveCount(0);
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
  });
});
