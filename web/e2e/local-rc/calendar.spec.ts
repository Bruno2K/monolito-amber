import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  apiJson,
  CALENDAR_IDS,
  capture,
  clearBrowserToSignIn,
  IDS,
  signInToOrg,
} from "./helpers";

const EVIDENCE = path.resolve(process.cwd(), "../docs/ux/evidence/m5.3");

test.describe("M5.3 Calendar UX / My Schedule", () => {
  test("R01–R15 hub, views, share/revoke, overlays, re-auth, no cascade", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    mkdirSync(EVIDENCE, { recursive: true });
    const tag = testInfo.project.name.includes("1180") ? "1180x820" : "1440x900";
    const stamp = `${tag}-${testInfo.workerIndex}`;
    const calendarName = `M53 Privado ${stamp}`;
    const teamCalendarName = `M53 Equipe ${stamp}`;
    const eventTitle = `M53 Manual ${stamp}`;

    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.getByRole("link", { name: "Meus Calendários" }).click();
    await page.waitForURL("**/calendars");
    await expect(page.getByRole("heading", { name: "Meus Calendários" })).toBeVisible();
    await expect(page.getByText("Coordinator private")).toBeVisible();
    await expect(page.getByText("Proprietário").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Mensagens" })).toHaveAttribute("href", "/messages");

    await page.locator(".calendar-create").getByLabel("Nome").fill(calendarName);
    await page.getByRole("button", { name: "Criar calendário" }).click();
    await expect(page.getByRole("link", { name: new RegExp(calendarName) })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `hub-${tag}.png`), fullPage: true });
    await capture(page, testInfo, "m53-hub");

    await page.getByRole("link", { name: new RegExp(calendarName) }).click();
    await expect(page.getByRole("heading", { name: new RegExp(calendarName) })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Mês" })).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: path.join(EVIDENCE, `month-${tag}.png`), fullPage: true });

    await page.getByRole("tab", { name: "Semana" }).click();
    await expect(page.getByRole("tab", { name: "Semana" })).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: path.join(EVIDENCE, `week-${tag}.png`), fullPage: true });
    await page.getByRole("tab", { name: "Dia" }).click();
    await expect(page.getByRole("tab", { name: "Dia" })).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: path.join(EVIDENCE, `day-${tag}.png`), fullPage: true });
    await page.getByRole("tab", { name: "Agenda" }).click();
    await expect(page.getByRole("tab", { name: "Agenda" })).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: path.join(EVIDENCE, `agenda-${tag}.png`), fullPage: true });

    await page.getByRole("button", { name: "Novo evento" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Título").fill(eventTitle);
    await page.getByRole("dialog").getByRole("button", { name: "Criar evento" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(eventTitle).first()).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `editor-${tag}.png`), fullPage: true });

    const listed = await apiJson(page, "GET", "/api/v1/calendars");
    const created = ((listed.body.items as Array<{ id: string; name: string }>) ?? []).find((row) => row.name === calendarName);
    expect(created?.id).toBeTruthy();
    const calendarId = String(created?.id);

    await page.locator(".calendar-workspace-actions").getByRole("link", { name: "Compartilhar" }).click();
    await page.waitForURL(`**/calendars/${calendarId}/share`);
    await expect(page.getByRole("heading", { name: new RegExp(`Compartilhar ${calendarName}`) })).toBeVisible();
    await expect(page.getByText("Acesso intrínseco")).toBeVisible();
    await page.getByLabel("Buscar pessoa ou equipe").fill("Contributor");
    await expect(page.getByRole("button", { name: /Seed Contributor A/ })).toBeVisible();
    await page.getByRole("button", { name: /Seed Contributor A/ }).click();
    await page.getByLabel("Papel").selectOption("VIEWER");
    await page.getByRole("button", { name: "Compartilhar" }).click();
    await expect(page.getByText("Seed Contributor A")).toBeVisible();
    await expect(page.getByText(/Usuário direto/)).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `share-${tag}.png`), fullPage: true });

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "viewer-a", "Amber Demo Alpha");
    await page.goto("/calendars");
    await expect(page.getByRole("heading", { name: "Meus Calendários" })).toBeVisible();
    await expect(page.getByText(calendarName)).toHaveCount(0);
    await expect(page.getByText("Coordinator private")).toHaveCount(0);
    await page.goto(`/calendars/${calendarId}`);
    await expect(page.getByRole("heading", { name: /Acesso negado|Acesso encerrado/ })).toBeVisible();
    await expect(page.getByText(calendarName)).toHaveCount(0);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "contributor-a", "Amber Demo Alpha");
    await page.goto("/calendars");
    const sharedCard = page.getByRole("link", { name: new RegExp(calendarName) });
    await expect(sharedCard).toBeVisible();
    await expect(sharedCard).toContainText("Visualizador · compartilhamento direto");
    await sharedCard.click();
    await expect(page.getByText(eventTitle).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo evento" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Compartilhar" })).toHaveCount(0);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto(`/calendars/${calendarId}/share`);
    await page.getByRole("button", { name: "Tornar editor" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/não pode compartilhar/i)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.locator(".calendar-grant-row").filter({ hasText: "Seed Contributor A" })).toContainText("Editor");

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "contributor-a", "Amber Demo Alpha");
    await page.goto(`/calendars/${calendarId}`);
    await expect(page.getByRole("button", { name: "Novo evento" })).toBeVisible();
    await page.getByRole("button", { name: "Novo evento" }).click();
    await page.getByRole("dialog").getByLabel("Título").fill(`Editor ${stamp}`);
    await page.getByRole("dialog").getByRole("button", { name: "Criar evento" }).click();
    await expect(page.getByText(`Editor ${stamp}`).first()).toBeVisible();

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto(`/calendars/${calendarId}/share`);
    await page.getByRole("button", { name: "Revogar" }).click();
    await expect(page.getByText(/remove o acesso imediatamente/i)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Concessão revogada.")).toBeVisible();

    await page.goto(`/calendars/${calendarId}`);
    await expect(page.getByText(eventTitle).first()).toBeVisible();

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "contributor-a", "Amber Demo Alpha");
    await page.goto("/calendars");
    await expect(page.getByText(calendarName)).toHaveCount(0);
    await page.goto(`/calendars/${calendarId}`);
    await expect(page.getByRole("heading", { name: /Acesso negado|Acesso encerrado/ })).toBeVisible();
    await expect(page.getByText(eventTitle)).toHaveCount(0);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    const teamCal = await apiJson(page, "POST", "/api/v1/calendars", {
      headers: { "Idempotency-Key": `m53-team-${stamp}` },
      data: { name: teamCalendarName, timeZone: "UTC" },
    });
    expect(teamCal.status).toBeLessThan(400);
    const teamCalendarId = String(teamCal.body.id);
    const teamGrant = await apiJson(page, "POST", `/api/v1/calendars/${teamCalendarId}/grants`, {
      headers: { "Idempotency-Key": `m53-team-grant-${stamp}` },
      data: { principalKind: "TEAM", teamId: CALENDAR_IDS.teamAStructure, role: "VIEWER" },
    });
    expect(teamGrant.status).toBeLessThan(400);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "team-only-a", "Amber Demo Alpha");
    await page.goto("/calendars");
    const teamCard = page.getByRole("link", { name: new RegExp(teamCalendarName) });
    await expect(teamCard).toBeVisible();
    await expect(teamCard).toContainText("herdado via equipe");
    await page.goto(`/calendars/${teamCalendarId}/share`);
    await expect(page.getByText("Somente o proprietário ativo administra concessões. Editor não compartilha nem arquiva.")).toBeVisible();
    await expect(page.locator(".calendar-grant-row").getByText("Não editável diretamente")).toBeVisible();

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    const grants = await apiJson(page, "GET", `/api/v1/calendars/${teamCalendarId}/grants`);
    const teamRow = ((grants.body.items as Array<{ id: string; principalKind: string }>) ?? []).find((row) => row.principalKind === "TEAM");
    expect(teamRow?.id).toBeTruthy();
    const revoked = await apiJson(page, "DELETE", `/api/v1/calendars/${teamCalendarId}/grants/${teamRow?.id}`, {
      headers: { "Idempotency-Key": `m53-team-revoke-${stamp}` },
    });
    expect(revoked.status).toBeLessThan(400);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "team-only-a", "Amber Demo Alpha");
    await page.goto("/calendars");
    await expect(page.getByText(teamCalendarName)).toHaveCount(0);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto("/calendars/schedule");
    await expect(page.getByRole("heading", { name: "Minha Agenda" })).toBeVisible();
    await expect(page.getByLabel("Calendários próprios")).toBeChecked();
    await expect(page.getByText(/Seed outline programme|Manual timed|Manual all-day|M53/).first()).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, `schedule-${tag}.png`), fullPage: true });
    await page.getByLabel("Datas de projeto autorizadas").uncheck();
    await expect(page.getByLabel("Datas de projeto autorizadas")).not.toBeChecked();
    await page.getByLabel("Datas de projeto autorizadas").check();
    await expect(page.getByLabel("Datas de projeto autorizadas")).toBeChecked();

    await page.goto(`/calendars/${CALENDAR_IDS.sharedEditor}`);
    await expect(page.getByRole("button", { name: /Seed outline programme/ }).first()).toBeVisible();
    await expect(page.getByText("must-not-be-source-of-truth")).toHaveCount(0);
    await page.getByRole("button", { name: /Seed outline programme/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/não altera Tarefa/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Abrir Tarefa de origem/ })).toHaveAttribute(
      "href",
      `/projects/${IDS.projectA1}/planner?inspect=${IDS.taskTodo}`,
    );

    const refCreate = await apiJson(page, "POST", `/api/v1/calendars/${calendarId}/events`, {
      headers: { "Idempotency-Key": `m53-ref-${stamp}` },
      data: {
        kind: "REFERENCED",
        title: "ignored-snapshot",
        allDay: false,
        startsAt: "2026-10-06T00:00:00.000Z",
        endsAt: "2026-10-06T01:00:00.000Z",
        timeZone: "UTC",
        referenceType: "TASK",
        referenceId: IDS.taskTodo,
        linkedProjectId: IDS.projectA1,
      },
    });
    expect(refCreate.status).toBeLessThan(400);
    const refId = String(refCreate.body.id);
    const beforeTask = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/tasks/${IDS.taskTodo}`);
    expect(beforeTask.status).toBe(200);
    const deleted = await apiJson(page, "DELETE", `/api/v1/calendars/${calendarId}/events/${refId}`, {
      headers: { "Idempotency-Key": `m53-ref-del-${stamp}` },
      data: { expectedVersion: refCreate.body.version },
    });
    expect(deleted.status).toBeLessThan(400);
    const afterTask = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/tasks/${IDS.taskTodo}`);
    expect(afterTask.status).toBe(200);
    expect(afterTask.body.title).toBe(beforeTask.body.title);

    await page.goto(`/calendars/${calendarId}?view=agenda`);
    await expect(page.getByText(eventTitle).first()).toBeVisible();
    await capture(page, testInfo, "m53-final");
  });
});
