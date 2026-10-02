import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const EVIDENCE_M42 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.2");
const EVIDENCE_M43 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.3");
const EVIDENCE_M44 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.4");
const EVIDENCE_M45 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.5");
const EVIDENCE_M46 = path.resolve(process.cwd(), "../docs/ux/evidence/m4.6");

const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("correct-horse-12");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");
}
