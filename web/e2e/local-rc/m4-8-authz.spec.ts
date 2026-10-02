import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { apiJson, capture, clearBrowserToSignIn, IDS, signIn, signInToOrg } from "./helpers";

const EVIDENCE = path.resolve(process.cwd(), "../docs/ux/evidence/m4.8");

test.describe("M4.8 Local RC AuthZ adversarial", () => {
  test("M4.8-ADV-01 tenant isolation, deep links, hidden counts, search, linked preview", async ({
    page,
  }, testInfo) => {
    mkdirSync(EVIDENCE, { recursive: true });
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");

    await page.goto(`/projects/${IDS.projectB1}/planner`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await expect(page.getByText("Beta Campus")).toHaveCount(0);
    await expect(page.getByText("Seed Beta hidden task")).toHaveCount(0);
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCE, `authz-forbidden-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-authz-forbidden");

    const planning = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectB1}/planning`);
    expect(planning.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(planning.body)).not.toContain("Seed Beta hidden task");

    await page.goto(`/projects/${IDS.projectA1}/planner?inspect=${IDS.taskB1}`);
    await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
    await expect(page.getByText("Seed Beta hidden task")).toHaveCount(0);

    await page.goto(`/projects/${IDS.projectA1}/planner?q=${encodeURIComponent("Seed Beta hidden task")}`);
    await expect(page.getByRole("heading", { name: "Nenhuma tarefa corresponde aos filtros" })).toBeVisible();
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCE, `authz-search-empty-${tag}.png`), fullPage: true });

    const searched = await apiJson(
      page,
      "GET",
      `/api/v1/projects/${IDS.projectA1}/planning?q=${encodeURIComponent("Seed Beta hidden task")}`,
    );
    expect(searched.status).toBe(200);
    expect(((searched.body.tasks as unknown[]) ?? []).length).toBe(0);
    expect(JSON.stringify(searched.body)).not.toContain("Seed Beta hidden task");

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "viewer-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/planner`);
    await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
    // Viewer chrome keeps Nova Tarefa in the DOM (disabled). AuthZ is the POST ≥400, not absence.
    await expect(page.getByRole("button", { name: "Nova Tarefa" })).toBeDisabled();
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    const mutate = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/tasks`, {
      headers: { "Idempotency-Key": `m48-viewer-${testInfo.project.name}` },
      data: { title: "viewer must not create" },
    });
    expect(mutate.status).toBeGreaterThanOrEqual(400);

    await page.goto(`/projects/${IDS.projectA1}/deliverables?inspect=${IDS.delArch001}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCE, `authz-viewer-preview-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m48-authz-viewer");
  });

  test("M4.8-ADV revoked membership cannot open Planning deep links", async ({ page }, testInfo) => {
    await signIn(page, "suspended-a");
    await page.goto(`/projects/${IDS.projectA1}/planner?inspect=${IDS.taskTodo}`);
    await expect(
      page.getByRole("heading", { name: /Organization necessária|Switch organization|Acesso negado/ }).first(),
    ).toBeVisible();
    await expect(page.getByText("Seed outline programme")).toHaveCount(0);
    await capture(page, testInfo, "m48-authz-revoked");
  });
});
