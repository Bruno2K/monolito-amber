import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { apiJson, capture, clearBrowserToSignIn, IDS, signInToOrg } from "./helpers";

const EVIDENCE_M42 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.2");
const EVIDENCE_M43 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.3");
const EVIDENCE_M44 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.4");
const EVIDENCE_M45 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.5");
const EVIDENCE_M46 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.6");
const EVIDENCE_M47 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.7");

test.describe("M4.2 Local RC Planning List", () => {
  test("M4.2-UI-01/NARROW-01 Planejamento is reachable and List matches the query", async ({ page }, testInfo) => {
    mkdirSync(EVIDENCE_M42, { recursive: true });
    mkdirSync(EVIDENCE_M43, { recursive: true });
    mkdirSync(EVIDENCE_M44, { recursive: true });
    mkdirSync(EVIDENCE_M45, { recursive: true });
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

    const pred = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m44-pred-${testInfo.project.name}-${Date.now()}` },
      data: { title: `RC Pred ${testInfo.project.name}` },
    });
    const succ = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m44-succ-${testInfo.project.name}-${Date.now()}` },
      data: { title: `RC Succ ${testInfo.project.name}` },
    });
    expect(pred.status).toBeLessThan(400);
    expect(succ.status).toBeLessThan(400);
    const linked = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${succ.body.id}/dependencies`, {
      headers: { "Idempotency-Key": `m44-dep-${testInfo.project.name}-${Date.now()}` },
      data: { predecessorTaskId: pred.body.id, type: "FINISH_TO_START" },
    });
    expect(linked.status).toBeLessThan(400);

    await page.goto(`/projects/${IDS.projectA1}/planner?inspect=${succ.body.id}`);
    await expect(page.getByRole("heading", { name: "Dependências (término-início)" })).toBeVisible();
    await expect(page.locator(".planner-dep-block")).toBeVisible();
    await expect(page.locator(".planner-dep-block")).toContainText(/não é o estado Bloqueada/i);
    await expect(page.locator(".planner-dep-list").getByText(`RC Pred ${testInfo.project.name}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover predecessor" })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE_M44, `inspector-deps-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Remover predecessor" }).focus();
    await expect(page.getByRole("button", { name: "Remover predecessor" })).toBeFocused();
    await page.getByRole("button", { name: "Remover predecessor" }).click();
    await expect(page.getByText("Nenhum predecessor.")).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.getByRole("button", { name: "Nova Tarefa" }).click();
    await expect(page.getByRole("heading", { name: "Nova tarefa" })).toBeVisible();
    await page.getByRole("dialog").getByLabel("Título").fill(`UI create ${testInfo.project.name}`);
    await page.getByRole("dialog").getByRole("button", { name: "Criar tarefa" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: `UI create ${testInfo.project.name}` })).toBeVisible();
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

  test("M4.5-UI List\u2194Kanban consistency, keyboard move, concurrency, viewer cannot move", async ({ page }, testInfo) => {
    mkdirSync(EVIDENCE_M45, { recursive: true });
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    const title = `RC Kanban ${testInfo.project.name} ${Date.now()}`;
    const created = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m45-${testInfo.project.name}-${Date.now()}` },
      data: { title },
    });
    expect(created.status).toBeLessThan(400);
    const taskId = String(created.body.id);
    const version = Number(created.body.version);

    await page.goto(`/projects/${IDS.projectA1}/planner?view=kanban&q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("region", { name: "Quadro Kanban" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PLANEJADAS" })).toBeVisible();
    await expect(page.getByText(/EM RISCO é atraso derivado/i)).toBeVisible();
    await expect(page.locator(`[data-kanban-column="PLANEJADAS"] [data-task-id="${taskId}"]`)).toBeVisible();
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await page.screenshot({ path: path.join(EVIDENCE_M45, `kanban-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "planner-kanban");

    await page.locator(`[data-task-id="${taskId}"]`).dragTo(page.locator('[data-kanban-column="EM_RISCO"]'));
    await expect(page.locator(".kanban-shell [role='alert']")).toContainText(/visão derivada|estado armazenado/i);
    await expect(page.locator(`[data-kanban-column="PLANEJADAS"] [data-task-id="${taskId}"]`)).toBeVisible();

    const stale = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${taskId}/start`, {
      headers: { "Idempotency-Key": `m45-stale-${testInfo.project.name}-${Date.now()}` },
      data: { expectedVersion: version },
    });
    expect(stale.status).toBeLessThan(400);
    await page.getByLabel(`Mover ${title}`).selectOption("EM_ANDAMENTO");
    await expect(page.locator(".kanban-shell [role='alert']")).toContainText(/Optimistic lock|versão|conflito/i);

    await page.reload();
    await expect(page.locator(`[data-kanban-column="EM_ANDAMENTO"] [data-task-id="${taskId}"]`)).toBeVisible();
    await page.getByRole("tab", { name: "Lista" }).click();
    await expect(page.getByRole("button", { name: new RegExp(title) })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByRole("dialog").locator(".status-pill")).toHaveText("Em andamento");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    const pred = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m45-pred-${testInfo.project.name}-${Date.now()}` },
      data: { title: `RC Kanban pred ${testInfo.project.name}` },
    });
    const succ = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m45-succ-${testInfo.project.name}-${Date.now()}` },
      data: { title: `RC Kanban succ ${testInfo.project.name}` },
    });
    const linked = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${succ.body.id}/dependencies`, {
      headers: { "Idempotency-Key": `m45-dep-${testInfo.project.name}-${Date.now()}` },
      data: { predecessorTaskId: pred.body.id, type: "FINISH_TO_START" },
    });
    expect(linked.status).toBeLessThan(400);
    await page.goto(`/projects/${IDS.projectA1}/planner?view=kanban&q=${encodeURIComponent(`RC Kanban succ ${testInfo.project.name}`)}`);
    await page.getByLabel(`Mover RC Kanban succ ${testInfo.project.name}`).selectOption("EM_ANDAMENTO");
    await expect(page.locator(".kanban-shell [role='alert']")).toContainText(
      /prerequisite|predecessor|término-início|finish-to-start/i,
    );
    await expect(page.locator(`[data-kanban-column="PLANEJADAS"] [data-task-id="${succ.body.id}"]`)).toBeVisible();

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "viewer-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/planner?view=kanban&q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("region", { name: "Quadro Kanban" })).toBeVisible();
    await expect(page.getByLabel(`Mover ${title}`)).toBeDisabled();
  });

  test("M4.6-UI Gantt date edit, List consistency, stale collision, viewer cannot mutate", async ({ page }, testInfo) => {
    mkdirSync(EVIDENCE_M46, { recursive: true });
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    const title = `RC Gantt ${testInfo.project.name} ${Date.now()}`;
    const predTitle = `RC Gantt pred ${testInfo.project.name}`;
    const succTitle = `RC Gantt succ ${testInfo.project.name}`;
    const pred = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m46-pred-${testInfo.project.name}-${Date.now()}` },
      data: { title: predTitle, plannedStartAt: "2026-09-01T00:00:00.000Z", dueDate: "2026-09-08T00:00:00.000Z" },
    });
    const created = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m46-${testInfo.project.name}-${Date.now()}` },
      data: { title, plannedStartAt: "2026-10-02T00:00:00.000Z", dueDate: "2026-10-09T00:00:00.000Z" },
    });
    expect(created.status).toBeLessThan(400);
    const taskId = String(created.body.id);
    const version = Number(created.body.version);
    const linked = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${taskId}/dependencies`, {
      headers: { "Idempotency-Key": `m46-dep-${testInfo.project.name}-${Date.now()}` },
      data: { predecessorTaskId: pred.body.id, type: "FINISH_TO_START" },
    });
    expect(linked.status).toBeLessThan(400);
    expect(predTitle).toBeTruthy();
    expect(succTitle).toBeTruthy();

    await page.goto(`/projects/${IDS.projectA1}/planner?view=gantt&q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("region", { name: "Cronograma Gantt" })).toBeVisible();
    await expect(page.getByLabel("Ordenar lista")).toHaveCount(0);
    await expect(page.getByLabel("Direção da ordenação")).toHaveCount(0);
    await expect(page.getByLabel("Buscar tarefas")).toBeVisible();
    await expect(page.getByLabel("Filtrar por status armazenado")).toBeVisible();
    await expect(page.getByLabel("Filtrar por atraso derivado")).toBeVisible();
    await expect(page.getByLabel("Filtrar por fase")).toBeVisible();
    await expect(page.locator(`[data-lane-kind="TASK"][data-source-id="${taskId}"]`).first()).toBeVisible();
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await page.screenshot({ path: path.join(EVIDENCE_M46, `gantt-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "planner-gantt");

    await page.getByLabel("Tarefa cujas datas serão salvas").selectOption(taskId);
    const startInput = page.locator(`#gantt-dates-${taskId}`);
    await startInput.scrollIntoViewIfNeeded();
    await startInput.fill("2026-10-05");
    await page.locator(`input[name="due-${taskId}"]`).fill("2026-10-15");
    await page.getByRole("button", { name: "Salvar datas da tarefa" }).click();
    await expect(page.locator(".gantt-status")).toContainText(/Sucessores e pais não foram deslocados|Datas de/i);

    const listed = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=list&q=${encodeURIComponent(title)}`);
    expect(listed.status).toBe(200);
    const listedTasks = (listed.body.tasks as Array<{ id: string; plannedStartAt: string | null; dueDate: string | null; version: number }>) ?? [];
    const row = listedTasks.find((item) => item.id === taskId);
    expect(row?.plannedStartAt?.slice(0, 10)).toBe("2026-10-05");
    expect(row?.dueDate?.slice(0, 10)).toBe("2026-10-15");
    const predAfter = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/tasks/${pred.body.id}`);
    expect(String(predAfter.body.dueDate).slice(0, 10)).toBe("2026-09-08");

    const stale = await apiJson(page, "PATCH", `/api/v1/projects/${IDS.projectA1}/tasks/${taskId}`, {
      headers: { "Idempotency-Key": `m46-stale-${testInfo.project.name}-${Date.now()}` },
      data: { dueDate: "2026-10-20T00:00:00.000Z", expectedVersion: version },
    });
    expect(stale.status).toBeGreaterThanOrEqual(400);

    const startBlocked = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${taskId}/start`, {
      headers: { "Idempotency-Key": `m46-start-${testInfo.project.name}-${Date.now()}` },
      data: { expectedVersion: row?.version ?? 99 },
    });
    expect(startBlocked.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(startBlocked.body)).toMatch(/predecessor|DEPENDENCY|término-início|finish-to-start/i);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "viewer-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/planner?view=gantt&q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("region", { name: "Cronograma Gantt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar datas da tarefa" })).toHaveCount(0);
    const forbidden = await apiJson(page, "PATCH", `/api/v1/projects/${IDS.projectA1}/tasks/${taskId}`, {
      headers: { "Idempotency-Key": `m46-viewer-${testInfo.project.name}-${Date.now()}` },
      data: { dueDate: "2026-11-01T00:00:00.000Z", expectedVersion: 1 },
    });
    expect(forbidden.status).toBeGreaterThanOrEqual(400);
  });

  test("M4.7-UI Marcos explanation changes with facts and stays consistent", async ({ page }, testInfo) => {
    mkdirSync(EVIDENCE_M47, { recursive: true });
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    const title = `RC Marco ${testInfo.project.name} ${Date.now()}`;
    const created = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/milestones`, {
      headers: { "Idempotency-Key": `m47-${testInfo.project.name}-${Date.now()}` },
      data: { title, targetDate: "2099-01-01T00:00:00.000Z" },
    });
    expect(created.status).toBeLessThan(400);
    expect(created.body.status).toBe("PLANNED");
    const late = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m47-late-${testInfo.project.name}-${Date.now()}` },
      data: { title: `${title} late`, milestoneId: created.body.id, dueDate: "2000-01-01T00:00:00.000Z" },
    });
    expect(late.status).toBeLessThan(400);

    await page.goto(`/projects/${IDS.projectA1}/planner?view=milestones`);
    await expect(page.getByRole("tab", { name: "Marcos" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText(/não são controles de status/i)).toBeVisible();
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await page.screenshot({ path: path.join(EVIDENCE_M47, `marcos-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "planner-marcos");

    await page.getByRole("button", { name: title, exact: true }).click();
    const inspector = page.getByRole("dialog");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("LINKED_TASK_LATE")).toBeVisible();

    const entity = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/milestones/${created.body.id}`);
    const list = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=list`);
    const gantt = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=gantt`);
    const marcos = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=milestones`);
    const listed = (list.body.milestones as Array<{ id: string; status: string; risk?: { explanation: string } }>).find((row) => row.id === created.body.id);
    const projected = (marcos.body.milestones as Array<{ id: string; status: string; risk?: { explanation: string } }>).find((row) => row.id === created.body.id);
    const lane = (gantt.body.schedule.lanes as Array<{ id: string; kind: string; status: string | null; risk?: { text: string } }>).find((row) => row.kind === "MILESTONE" && row.id === created.body.id);
    expect(entity.body.status).toBe("AT_RISK");
    expect(listed?.status).toBe("AT_RISK");
    expect(projected?.status).toBe("AT_RISK");
    expect(listed?.risk?.explanation).toBe(entity.body.risk.explanation);
    expect(lane?.risk?.text).toContain("late");

    await inspector.getByRole("button", { name: "Alcançar" }).click();
    await inspector.getByRole("button", { name: "Confirmar alcance" }).click();
    await expect(inspector.getByText(/Armazenado Concluído/i)).toBeVisible();
    const after = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/milestones/${created.body.id}`);
    expect(after.body.recordedStatus).toBe("ACHIEVED");
    expect(after.body.status).toBe("ACHIEVED");
  });

  test("M4.8.1 board Novo Marco stays in create mode, Esc dismisses, and submit adds a row", async ({ page }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/planner?view=milestones`);
    await expect(page.getByRole("tab", { name: "Marcos" })).toHaveAttribute("aria-selected", "true");

    const boardCreate = page.locator('[data-surface="milestones"]').getByRole("button", { name: "Novo Marco" });
    await boardCreate.click();
    const inspector = page.getByRole("dialog");
    await expect(inspector.getByRole("heading", { name: "Novo marco" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Novo marco" })).toHaveCount(0);

    await page.getByLabel("Buscar marcos").fill("zzzz-no-match-m481");
    await expect(page.getByRole("heading", { name: /Nenhum marco corresponde/i })).toBeVisible();
    await boardCreate.click();
    await expect(inspector.getByRole("heading", { name: "Novo marco" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Novo marco" })).toHaveCount(0);
    await page.getByLabel("Buscar marcos").fill("");
    await expect(page.getByRole("button", { name: "Seed Concept freeze", exact: true })).toBeVisible();

    const title = `UI Marco ${testInfo.project.name} ${Date.now()}`;
    await boardCreate.click();
    await expect(inspector.getByRole("heading", { name: "Novo marco" })).toBeVisible();
    await inspector.getByLabel("Título").fill(title);
    await inspector.getByRole("button", { name: "Criar marco" }).click();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
  });
});
