import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { capture, IDS, signInToOrg } from "./helpers";

const EVIDENCE = path.resolve(process.cwd(), "../docs/ux/evidence/m4.8");

test.describe("M4.8 Local RC viewport evidence", () => {
  test("M4.8-NARROW-01 List Kanban Gantt Marcos at both viewports", async ({ page }, testInfo) => {
    mkdirSync(EVIDENCE, { recursive: true });
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");

    await page.goto(`/projects/${IDS.projectA1}/planner`);
    await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Seed outline programme/ })).toBeVisible();
    await expect(page.locator(".planner-late").first()).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `list-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-list");

    await page.goto(`/projects/${IDS.projectA1}/planner?view=kanban`);
    await expect(page.getByRole("region", { name: "Quadro Kanban" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PLANEJADAS" })).toBeVisible();
    await expect(page.locator(`[data-kanban-column="EM_RISCO"] [data-task-id="${IDS.taskLate}"]`)).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `kanban-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-kanban");

    await page.goto(`/projects/${IDS.projectA1}/planner?view=gantt`);
    await expect(page.getByRole("region", { name: "Cronograma Gantt" })).toBeVisible();
    await expect(page.locator('[data-lane-kind="TASK"]').first()).toBeVisible();
    await expect(page.locator('[data-lane-kind="MILESTONE"]').first()).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `gantt-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-gantt-overview");

    await page.goto(`/projects/${IDS.projectA1}/planner?view=milestones`);
    await expect(page.getByRole("tab", { name: "Marcos" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Seed Concept freeze", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Seed risk checkpoint", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `marcos-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-marcos-overview");

    const nova = page.getByRole("button", { name: "Novo Marco" }).or(page.getByRole("button", { name: "Nova Tarefa" }));
    await expect(nova.first()).toBeVisible();
    const box = await nova.first().boundingBox();
    expect(box).toBeTruthy();
    expect((box?.width ?? 0) * (box?.height ?? 0)).toBeGreaterThan(0);
  });
});
