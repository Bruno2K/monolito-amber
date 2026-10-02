import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { apiJson, capture, IDS, signInToOrg } from "./helpers";

const EVIDENCE = path.resolve(process.cwd(), "../docs/ux/evidence/m4.8");

function tagFor(projectName: string): "1440x900" | "1180x820" {
  return projectName.includes("1180") ? "1180x820" : "1440x900";
}

test.describe("M4.8 Local RC golden path + cross-view consistency", () => {
  test("M4.8-UI-01/R03/R04/R05 golden path stays consistent across List Kanban Gantt Marcos", async ({
    page,
  }, testInfo) => {
    mkdirSync(EVIDENCE, { recursive: true });
    const tag = tagFor(testInfo.project.name);
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.getByRole("link", { name: "Alpha Tower" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/overview`);

    await page.getByRole("link", { name: "Planejamento" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/planner`);
    await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("Buscar tarefas").fill("Seed outline programme");
    await expect(page.getByRole("button", { name: /Seed outline programme/ })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `list-filtered-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-list-filtered");

    await page.getByRole("button", { name: "Nova Tarefa" }).click();
    await expect(page.getByRole("heading", { name: "Nova tarefa" })).toBeVisible();
    const title = `RC golden ${stamp}`;
    await page.getByLabel("Título").fill(title);
    await page.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // Assign form mounts only when `row && !creating`. After create the List
    // filter is still "Seed outline programme", so reopen unfiltered inspect.
    const listed = await apiJson(
      page,
      "GET",
      `/api/v1/projects/${IDS.projectA1}/planning?q=${encodeURIComponent(title)}`,
    );
    expect(listed.status).toBe(200);
    const created = ((listed.body.tasks as Array<{ id: string; title: string }>) ?? []).find((row) => row.title === title);
    expect(created?.id).toBeTruthy();
    await page.goto(`/projects/${IDS.projectA1}/planner?inspect=${created!.id}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator("#task-assignee")).toContainText("Seed Contributor A");
    await page.locator("#task-assignee").selectOption({ label: "Seed Contributor A" });
    await page.getByRole("button", { name: "Atribuir" }).click();
    await expect(page.getByRole("dialog")).toContainText("Seed Contributor A");
    await page.getByRole("button", { name: "Iniciar" }).click();
    await expect(page.getByRole("dialog").locator(".status-pill")).toHaveText("Em andamento");
    await page.screenshot({ path: path.join(EVIDENCE, `inspector-assigned-${tag}.png`), fullPage: true });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    const pred = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m48-pred-${stamp}` },
      data: { title: `RC pred ${stamp}` },
    });
    const succ = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m48-succ-${stamp}` },
      data: {
        title: `RC succ ${stamp}`,
        plannedStartAt: "2026-10-10T00:00:00.000Z",
        dueDate: "2026-10-20T00:00:00.000Z",
      },
    });
    expect(pred.status).toBeLessThan(400);
    expect(succ.status).toBeLessThan(400);
    const linked = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${succ.body.id}/dependencies`, {
      headers: { "Idempotency-Key": `m48-dep-${stamp}` },
      data: { predecessorTaskId: pred.body.id, type: "FINISH_TO_START" },
    });
    expect(linked.status).toBeLessThan(400);

    await page.goto(`/projects/${IDS.projectA1}/planner?inspect=${succ.body.id}`);
    await expect(page.getByRole("heading", { name: `RC succ ${stamp}` })).toBeVisible();
    await expect(page.locator(".planner-dep-block")).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar" })).toBeDisabled();
    await page.screenshot({ path: path.join(EVIDENCE, `inspector-start-block-${tag}.png`), fullPage: true });
    const startBlocked = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${succ.body.id}/start`, {
      headers: { "Idempotency-Key": `m48-start-block-${stamp}` },
      data: { expectedVersion: succ.body.version },
    });
    expect(startBlocked.status).toBeGreaterThanOrEqual(400);

    const predStarted = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${pred.body.id}/start`, {
      headers: { "Idempotency-Key": `m48-pred-start-${stamp}` },
      data: { expectedVersion: pred.body.version },
    });
    const predDone = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks/${pred.body.id}/complete`, {
      headers: { "Idempotency-Key": `m48-pred-done-${stamp}` },
      data: { expectedVersion: predStarted.body.version },
    });
    expect(predDone.status).toBeLessThan(400);
    await page.reload();
    await expect(page.getByRole("button", { name: "Iniciar" })).toBeEnabled();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.goto(`/projects/${IDS.projectA1}/planner?view=gantt&q=${encodeURIComponent(`RC succ ${stamp}`)}`);
    await expect(page.getByRole("region", { name: "Cronograma Gantt" })).toBeVisible();
    await page.getByLabel("Tarefa cujas datas serão salvas").selectOption(String(succ.body.id));
    const startInput = page.locator(`#gantt-dates-${succ.body.id}`);
    await startInput.scrollIntoViewIfNeeded();
    await startInput.fill("2026-10-12");
    await page.locator(`input[name="due-${succ.body.id}"]`).fill("2026-10-22");
    await page.getByRole("button", { name: "Salvar datas da tarefa" }).click();
    await expect(page.locator(".gantt-status")).toContainText(/Sucessores e pais não foram deslocados|Datas de/i);
    await page.screenshot({ path: path.join(EVIDENCE, `gantt-date-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-gantt");

    const riskTitle = `RC marco ${stamp}`;
    const milestone = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/milestones`, {
      headers: { "Idempotency-Key": `m48-ms-${stamp}` },
      data: { title: riskTitle, targetDate: "2099-01-01T00:00:00.000Z" },
    });
    expect(milestone.status).toBeLessThan(400);
    const late = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m48-late-${stamp}` },
      data: { title: `${riskTitle} late`, milestoneId: milestone.body.id, dueDate: "2000-01-01T00:00:00.000Z" },
    });
    expect(late.status).toBeLessThan(400);

    await page.goto(`/projects/${IDS.projectA1}/planner?view=milestones`);
    await expect(page.getByRole("tab", { name: "Marcos" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: riskTitle, exact: true }).click();
    const inspector = page.getByRole("dialog");
    await expect(inspector.getByText("LINKED_TASK_LATE")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `marcos-risk-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-marcos");

    const list = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=list`);
    const kanban = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=kanban`);
    const gantt = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=gantt`);
    const marcos = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/planning?view=milestones`);
    expect(list.status).toBe(200);
    const listIds = ((list.body.tasks as Array<{ id: string }>) ?? []).map((row) => row.id).sort();
    expect(((kanban.body.tasks as Array<{ id: string }>) ?? []).map((row) => row.id).sort()).toEqual(listIds);
    expect(((gantt.body.tasks as Array<{ id: string }>) ?? []).map((row) => row.id).sort()).toEqual(listIds);
    expect(((marcos.body.tasks as Array<{ id: string }>) ?? []).map((row) => row.id).sort()).toEqual(listIds);
    const listedMs = (list.body.milestones as Array<{ id: string; status: string; risk?: { explanation: string } }>).find(
      (row) => row.id === milestone.body.id,
    );
    const projected = (marcos.body.milestones as Array<{ id: string; status: string; risk?: { explanation: string } }>).find(
      (row) => row.id === milestone.body.id,
    );
    expect(listedMs?.status).toBe("AT_RISK");
    expect(projected?.status).toBe("AT_RISK");
    expect(listedMs?.risk?.explanation).toBe(projected?.risk?.explanation);

    const issue = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/issues/${IDS.issueGrid}`);
    const deliverable = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/deliverables/${IDS.delArch001}`);
    const workPackage = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/work-packages/${IDS.wpOutline}`);
    const phase = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/phases/${IDS.phaseConcept}`);
    expect(issue.body.status).toBe("OPEN");
    expect(deliverable.body.status).toBe("PLANNED");
    expect(workPackage.body.status).toBe("PLANNED");
    expect(phase.body.status).toBe("PLANNED");

    await page.goto(`/projects/${IDS.projectA1}/deliverables?inspect=${IDS.delArch001}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tarefas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Marcos" })).toBeVisible();
    await expect(page.getByText("Seed outline programme")).toBeVisible();
    await expect(page.getByText("Seed Concept freeze")).toBeVisible();
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    const afterDeliverable = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/deliverables/${IDS.delArch001}`);
    expect(afterDeliverable.body.status).toBe(deliverable.body.status);
    expect(afterDeliverable.body.ownerProjectMembershipId).toBe(deliverable.body.ownerProjectMembershipId);
    expect(afterDeliverable.body.ownerTeamId ?? null).toBe(deliverable.body.ownerTeamId ?? null);
    await page.screenshot({ path: path.join(EVIDENCE, `deliverable-refs-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-deliverable-refs");
  });
});
