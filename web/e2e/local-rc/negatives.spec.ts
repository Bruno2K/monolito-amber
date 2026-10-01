import { expect, test } from "@playwright/test";
import {
  apiJson,
  capture,
  emailFor,
  expectOrgSwitch,
  expectUnauthenticatedSurface,
  IDS,
  logoutToSignIn,
  signIn,
  signInToOrg,
} from "./helpers";

test.describe("M3.8 local RC security negatives (real API + Postgres)", () => {
  test("wrong org/project: Org A coordinator cannot open Org B project", async ({ page }, testInfo) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectB1}/overview`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    await capture(page, testInfo, "negative-wrong-org");
  });

  test("revoked membership: suspended member cannot switch into the org; deep-link denied", async ({
    page,
  }, testInfo) => {
    await signIn(page, "suspended-a");
    await expectOrgSwitch(page);
    const row = page.locator("li").filter({ hasText: "Amber Demo Alpha" });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Switch" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Switch" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Alpha Tower" })).toHaveCount(0);

    await page.goto(`/projects/${IDS.projectA1}/overview`);
    await expect(
      page.getByRole("heading", {
        name: /Switch organization|Organization necessária|Acesso negado|Contexto inativo/,
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Alpha Tower" })).toHaveCount(0);
    await capture(page, testInfo, "negative-revoked");
  });

  test("missing permissions: viewer cannot mutate Phase / Deliverable / WorkPackage", async ({ page }, testInfo) => {
    await signInToOrg(page, "viewer-a", "Amber Demo Alpha");
    await page.getByRole("link", { name: "Alpha Tower" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/overview`);
    await page.getByRole("link", { name: "Estrutura" }).click();
    await expect(page.getByRole("button", { name: "Nova Phase" })).toHaveCount(0);
    await page.getByRole("link", { name: "Entregas" }).click();
    await expect(page.getByRole("button", { name: "Nova Entrega" })).toHaveCount(0);
    await page.getByRole("link", { name: "Pacotes" }).click();
    await expect(page.getByRole("button", { name: "Novo pacote" })).toHaveCount(0);
    await capture(page, testInfo, "negative-missing-perms");
  });

  test("external collaborator cannot see the other Org A project", async ({ page }, testInfo) => {
    await signInToOrg(page, "external-a", "Amber Demo Alpha");
    await expect(page.getByRole("link", { name: "Alpha Tower" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alpha Plant" })).toHaveCount(0);
    await page.goto(`/projects/${IDS.projectA2}/overview`);
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
    await capture(page, testInfo, "negative-external");
  });

  test("TeamMembership without ProjectMembership does not grant Project access", async ({ page }, testInfo) => {
    await signInToOrg(page, "team-only-a", "Amber Demo Alpha");
    await expect(page.getByRole("link", { name: "Alpha Tower" })).toHaveCount(0);
    await page.goto(`/projects/${IDS.projectA1}/overview`);
    await expect(page.getByRole("heading", { name: /Acesso negado|Nenhum projeto/ })).toBeVisible();
    await capture(page, testInfo, "negative-team-only");
  });

  test("stale expectedVersion and duplicate Idempotency-Key", async ({ page }) => {
    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.getByRole("link", { name: "Alpha Tower" }).click();
    await page.waitForURL(`**/projects/${IDS.projectA1}/overview`);

    const listed = await apiJson(page, "GET", `/api/v1/projects/${IDS.projectA1}/phases`);
    expect(listed.status).toBe(200);
    const items = (listed.body.items as Array<{ id: string; name: string; version: number; status: string }>) ?? [];
    const concept = items.find((row) => row.name === "Concept");
    expect(concept).toBeTruthy();
    const stale = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/phases/${concept!.id}/activate`, {
      data: { expectedVersion: 0 },
      headers: { "Idempotency-Key": `stale-${Date.now()}` },
    });
    expect(stale.status).toBeGreaterThanOrEqual(400);

    const tag = Date.now();
    const key = `idem-${tag}`;
    const first = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/phases`, {
      data: { name: `Idempotent ${key}`, sequence: 70 + (tag % 20) },
      headers: { "Idempotency-Key": key },
    });
    expect(first.status).toBeLessThan(400);
    const second = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/phases`, {
      data: { name: `Idempotent ${key}`, sequence: 70 + (tag % 20) },
      headers: { "Idempotency-Key": key },
    });
    expect(second.status).toBeLessThan(400);
    expect(second.body.id).toBe(first.body.id);

    const clash = await apiJson(page, "POST", `/api/v1/projects/${IDS.projectA1}/phases`, {
      data: { name: `Idempotent clash ${key}`, sequence: 91 },
      headers: { "Idempotency-Key": key },
    });
    expect(clash.status).toBeGreaterThanOrEqual(400);
  });

  test("inaccessible deep-link and session expiry after logout", async ({ page }, testInfo) => {
    await page.goto(`/projects/${IDS.projectA1}/deliverables?inspect=${IDS.delArch001}`);
    await expectUnauthenticatedSurface(page);

    await signInToOrg(page, "coord-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/deliverables?inspect=${IDS.delArch001}`);
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await logoutToSignIn(page);
    await page.goto(`/projects/${IDS.projectA1}/overview`);
    await expectUnauthenticatedSurface(page);
    await capture(page, testInfo, "negative-session");
  });

  test("hidden counts: unauthorized context is omitted without leak copy", async ({ page }, testInfo) => {
    await signInToOrg(page, "viewer-a", "Amber Demo Alpha");
    await page.goto(`/projects/${IDS.projectA1}/deliverables?inspect=${IDS.delArch001}`);
    await expect(page.getByRole("heading", { name: "Entregas" })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("1 item oculto")).toHaveCount(0);
    await expect(page.getByText("item oculto")).toHaveCount(0);
    await expect(page.getByText("hidden item")).toHaveCount(0);
    const deniedOrEmpty = page
      .getByText("Sem permissão para esta seção.")
      .or(page.getByText("Nenhum documento ligado."))
      .or(page.getByText("Nenhuma tarefa ligada."));
    await expect(deniedOrEmpty.first()).toBeVisible();
    await capture(page, testInfo, "negative-hidden-counts");
  });

  test("removed membership cannot select an organization", async ({ page }, testInfo) => {
    await signIn(page, "removed-a");
    await expectOrgSwitch(page);
    await expect(page.getByRole("button", { name: "Switch" })).toHaveCount(0);
    await capture(page, testInfo, "negative-removed");
  });

  test("wrong password stays on sign-in without leaking accounts", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(emailFor("coord-a"));
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/sign-in/);
  });
});
