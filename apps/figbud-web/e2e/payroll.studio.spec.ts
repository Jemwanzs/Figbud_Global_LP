import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

// Studio → Websites → ZiraHR → Payroll Calculator (P14-C). The rules behind
// this are tested in services/api/tests/payroll.rs and the engine's unit tests.

test("rules can't be published unchecked; draft, approve, switch on and roll back", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Studio flow, on desktop Chromium");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(`/admin/invite#token=${randomBytes(32).toString("hex")}`);
  await page.getByLabel("Your name").fill("Olu Owner");
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Olu");

  await page.goto("/admin/sites/zirahr");
  await page.getByRole("link", { name: "Payroll Calculator" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Payroll Calculator");

  // Off by default, and can't be switched on with nothing published.
  const live = page.getByRole("switch", { name: "Show on the website" });
  await expect(live).toHaveAttribute("aria-checked", "false");
  await expect(live).toBeDisabled();

  // Try the saved draft: the API's figures, with the working shown.
  const calculator = page.getByTestId("payroll-calculator");
  await calculator.getByLabel("Gross monthly pay (KES)").fill("150000");
  await expect(page.getByTestId("payroll-answer")).toContainText("103,618.15", { timeout: 15_000 });

  // Nothing checked yet: approval isn't offered, and it says why.
  await expect(page.getByText("Not checked yet").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask for approval" })).toBeDisabled();
  await expect(page.getByText("Record when the rules were checked")).toBeVisible();

  // Edit the rules: a slipped rate is refused.
  const current = page.locator('[data-rule-set="2026-02-01"]');
  await current.locator("summary").click();
  await current.getByLabel(/^Rate/).first().fill("600");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("percentages from 0 to 100");
  await current.getByLabel(/^Rate/).first().fill("6");

  // Record the checks, save and ask for approval.
  await current.getByLabel("Checked against official sources on").fill("2026-11-05");
  const older = page.locator('[data-rule-set="2025-02-01"]');
  await older.locator("summary").click();
  await older.getByLabel("Checked against official sources on").fill("2026-11-05");
  await expect(current.getByText("Checked 2026-11-05")).toBeVisible();
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByRole("button", { name: "Ask for approval" }).click();
  await expect(page.getByText(/You asked for approval/)).toBeVisible();

  // A draft reaches nobody, even approved, until the switch is on.
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  const publicState = async () =>
    (await (await request.get("http://localhost:3199/v1/sites/zirahr/payroll-calculator")).json()).calculator;
  expect(await publicState()).toBeNull();

  await expect(live).toBeEnabled();
  await live.click();
  await expect(live).toHaveAttribute("aria-checked", "true");
  expect((await publicState()).version).toBe(1);

  // A second version, then one step back.
  await page.getByLabel("Introduction").fill("A clearer introduction.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByRole("button", { name: "Ask for approval" }).click();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  expect((await publicState()).intro).toBe("A clearer introduction.");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Roll back to this" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rolled back to version 1." })).toBeVisible();
  expect((await publicState()).intro).not.toBe("A clearer introduction.");
  expect((await publicState()).version).toBe(3);

  // Only websites it applies to have this page.
  await page.goto("/admin/sites/jasiri/payroll-calculator");
  await expect(page.getByRole("heading", { name: "Payroll Calculator" })).toHaveCount(0);

  // New block types in the page builder.
  await page.goto("/admin/sites/zirahr/pages");
  await expect(page.locator("body")).toContainText("Home");
});
