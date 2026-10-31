import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { studioLink } from "./studio-nav";

// SEO & search visibility in the Studio (P9-S1) against e2e/mock-api.mjs.

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  test.skip(testInfo.project.name !== "desktop", "edits shared mock data from the desktop project");
});

test("overview across websites, then one website's search identity and page checks", async ({ page }) => {
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

  await studioLink(page, "SEO");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("SEO & search visibility");
  const zirahr = page.getByRole("row", { name: /ZiraHR/ });
  await expect(zirahr).toContainText("Tag published");
  await zirahr.getByRole("link", { name: "ZiraHR" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ZiraHR: SEO & search visibility");

  // Page checks come from the published pages; data services are clearly not connected.
  await expect(page.getByRole("list", { name: "Page checks" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Search data" })).toContainText("not connected");

  // The website's own title template, with a live preview; saved only with changes.
  const save = page.getByRole("button", { name: "Save SEO settings" });
  await expect(save).toBeDisabled();
  await page.getByLabel(/^Search title template/).fill("%s · ZiraHR HR software");
  await expect(page.getByText(/Preview: “.+ · ZiraHR HR software”/)).toBeVisible();
  await page.getByRole("button", { name: /^Add a market/ }).click();
  await page.getByRole("combobox", { name: "Search countries" }).fill("uganda");
  await page.getByRole("combobox", { name: "Search countries" }).press("Enter");
  await expect(page.getByRole("list", { name: "Target markets" })).toContainText("Uganda");
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "SEO settings saved." })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
