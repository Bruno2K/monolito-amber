import { expect, test } from "@playwright/test";
import { apiJson, CALENDAR_IDS, clearBrowserToSignIn, IDS, m5SeedUuid, signInToOrg } from "./helpers";

const DIRECT_ID = m5SeedUuid("conversation:dm-coord-contributor");
const TEAM_ID = m5SeedUuid("conversation:team-a-chat");

test.describe("M5.5 Direct and Team messaging UX", () => {
  test("inbox, direct reuse, team boundary, send, edit, tombstone, links, revocation, keyboard", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const stamp = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
    const body = `M55 olá ${stamp}`;
    const edited = `M55 editada ${stamp}`;

    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    const first = await apiJson(page, "POST", "/api/v1/conversations/direct", {
      headers: { "Idempotency-Key": `m55-direct-a-${stamp}` },
      data: { organizationMembershipId: CALENDAR_IDS.memContributorA },
    });
    const second = await apiJson(page, "POST", "/api/v1/conversations/direct", {
      headers: { "Idempotency-Key": `m55-direct-b-${stamp}` },
      data: { organizationMembershipId: CALENDAR_IDS.memContributorA },
    });
    expect(first.status).toBeLessThan(300);
    expect(second.body.id).toBe(first.body.id);
    expect(first.body.id).toBe(DIRECT_ID);

    const inbox = await apiJson(page, "GET", "/api/v1/conversations?pageSize=100");
    const items = inbox.body.items as Array<{ id: string; kind: string; unreadCount: number; lastMessage: { snippet?: string } | null }>;
    expect(items.some((item) => item.id === DIRECT_ID && item.kind === "DIRECT")).toBe(true);
    expect(items.some((item) => item.id === TEAM_ID)).toBe(false);
    expect(JSON.stringify(inbox.body)).not.toContain("Amber Demo Beta");

    const linked = await apiJson(page, "POST", `/api/v1/conversations/${DIRECT_ID}/messages`, {
      headers: { "Idempotency-Key": `m55-link-${stamp}` },
      data: {
        body: `referência ${stamp}`,
        resourceLinks: [
          { type: "PROJECT", id: IDS.projectA1 },
          { type: "PROJECT", id: IDS.projectB1 },
        ],
      },
    });
    expect(linked.status).toBeLessThan(300);

    await page.getByRole("link", { name: "Mensagens" }).click();
    await page.waitForURL("**/messages");
    await expect(page.getByRole("heading", { name: "Mensagens" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Conversas autorizadas" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Seed Contributor A|Conversa direta/ }).first()).toBeVisible();
    await expect(page.getByText("Alpha Structure Team")).toHaveCount(0);

    await page.getByRole("button", { name: "Nova conversa" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: /Seed Contributor A/ })).toBeVisible();
    await expect(dialog.getByText("Seed Suspended Member A")).toHaveCount(0);
    await expect(dialog.getByText("Seed Coordinator B")).toHaveCount(0);
    await dialog.getByRole("button", { name: /Seed Contributor A/ }).click();
    await page.waitForURL(`**/messages/${DIRECT_ID}`);
    await expect(page.getByText(`referência ${stamp}`)).toBeVisible();
    await expect(page.getByText("Vínculo de colaboração. Não é uma decisão governada.").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir projeto" })).toBeVisible();
    await expect(page.getByText("Recurso protegido").first()).toBeVisible();
    await expect(page.getByText("Beta Campus")).toHaveCount(0);

    const composer = page.getByLabel("Mensagem");
    await composer.fill(body);
    await page.route(`**/api/v1/conversations/${DIRECT_ID}/messages`, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "falha temporária" }) });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("alert")).toContainText("falha temporária");
    await expect(page.getByText(body)).toHaveCount(1);
    await page.unroute(`**/api/v1/conversations/${DIRECT_ID}/messages`);
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByText(body)).toHaveCount(1);
    await expect(page.locator("[data-pending='true']")).toHaveCount(0);

    await page.getByRole("button", { name: "Editar a sua mensagem" }).last().click();
    await page.getByLabel("Texto da mensagem").fill(edited);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(edited)).toBeVisible();
    await expect(page.getByText("Editada").last()).toBeVisible();

    await page.getByRole("button", { name: "Remover a sua mensagem" }).last().click();
    await page.getByRole("button", { name: "Remover", exact: true }).click();
    await expect(page.getByText("Mensagem removida").last()).toBeVisible();
    await expect(page.getByText(edited)).toHaveCount(0);

    await page.getByLabel("Filtrar conversas autorizadas").focus();
    await page.keyboard.press("Tab");
    const row = page.getByRole("button", { name: /Seed Contributor A|Conversa direta/ }).first();
    await row.focus();
    await expect(row).toBeFocused();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
    const sendBox = await page.getByRole("button", { name: "Enviar" }).boundingBox();
    expect(sendBox).not.toBeNull();
    expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(testInfo.project.use.viewport?.height ?? 900);

    await page.route(`**/api/v1/conversations/${DIRECT_ID}**`, async (route) => {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ status: 403, code: "TENANCY_DENIED", detail: "revoked" }) });
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Conversa indisponível" })).toBeVisible();
    await expect(page.getByRole("log")).toHaveCount(0);
    await expect(page.getByLabel("Mensagem")).toHaveCount(0);
    await page.unroute(`**/api/v1/conversations/${DIRECT_ID}**`);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "team-only-a", "Amber Demo Alpha");
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Mensagens" })).toBeVisible();
    const teamInbox = await apiJson(page, "GET", "/api/v1/conversations?pageSize=100");
    const teamItems = teamInbox.body.items as Array<{ id: string; kind: string; teamArchived?: boolean; access?: string }>;
    expect(teamItems.some((item) => item.id === TEAM_ID && item.kind === "TEAM")).toBe(true);
    expect(teamItems.some((item) => item.id === DIRECT_ID)).toBe(false);
    await page.locator(".messages-row", { hasText: /Alpha Structure Team|^Equipe/ }).first().click();
    await expect(page.getByLabel("Mensagem")).toBeVisible();

    await page.route(`**/api/v1/conversations/${TEAM_ID}`, async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as { access?: string; teamArchived?: boolean };
      json.access = "read_only";
      json.teamArchived = true;
      await route.fulfill({ response, json });
    });
    await page.reload();
    await expect(page.getByText("Somente leitura")).toBeVisible();
    await expect(page.getByLabel("Mensagem")).toHaveCount(0);

    await clearBrowserToSignIn(page);
    await signInToOrg(page, "coord-b", "Amber Demo Beta");
    const foreign = await apiJson(page, "GET", "/api/v1/conversations?pageSize=100");
    const foreignItems = (foreign.body.items as Array<{ id: string }> | undefined) ?? [];
    expect(foreignItems.some((item) => item.id === DIRECT_ID || item.id === TEAM_ID)).toBe(false);
    const foreignSearch = await apiJson(page, "GET", `/api/v1/conversations/search?q=${encodeURIComponent(stamp)}`);
    expect(JSON.stringify(foreignSearch.body)).not.toContain(stamp);
    await page.goto("/messages");
    await expect(page.getByText(stamp)).toHaveCount(0);
  });
});
