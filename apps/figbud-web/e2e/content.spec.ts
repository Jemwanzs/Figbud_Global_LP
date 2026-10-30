import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Content library (P7-D1) against e2e/mock-api.mjs: "Data promise" is
// published and used on Ziwa's Security page.

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  test.skip(testInfo.project.name !== "desktop", "edits shared mock data from the desktop project");
});

async function signInAsOwner(page: Page) {
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
}

test("create, publish and version shared content, and use it on pages", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAsOwner(page);
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Content" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Content library");
  const promise = page.getByRole("listitem").filter({ hasText: "Data promise" });
  await expect(promise).toContainText("Version 1");
  await expect(promise).toContainText("On 1 page · 1 website");

  // A new item starts as an unpublished draft.
  const name = `Support hours ${randomBytes(2).toString("hex")}`;
  await expect(async () => {
    await page.getByLabel("Name").fill(name);
    await expect(page.getByRole("button", { name: "Create" })).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Kind of section").selectOption("text");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Not published: pages using it don't show it yet.")).toBeVisible();

  // Edit, save, then publish with a note (the owner can publish).
  await page.getByLabel("Text (Markdown)").fill("Our team answers **8am to 6pm**, Monday to Friday.");
  await expect(page.getByRole("region", { name: "Preview", exact: true })).toContainText("8am to 6pm");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  const publish = page.getByRole("button", { name: /^Publish to/ });
  await expect(publish).toBeDisabled();
  await page.getByLabel("What changed").fill("First version");
  await publish.click();
  await expect(page.getByRole("status").filter({ hasText: "Published everywhere it's used." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Versions" })).toContainText("Version 1");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // An item in use lists its pages and can't be archived.
  await page.goto("/admin/content");
  await page.getByRole("link", { name: "Data promise" }).click();
  await expect(page.getByRole("region", { name: "Used on" })).toContainText("Ziwa LMS · Security");
  await expect(page.getByRole("button", { name: "Archive" })).toBeDisabled();

  // In the page builder, the Shared content section shows the published item.
  await page
    .getByRole("region", { name: "Used on" })
    .getByRole("link", { name: /Security/ })
    .click();
  const sections = page.getByRole("list", { name: "Sections" });
  await sections.getByRole("button", { name: /^Shared content/ }).click();
  await expect(page.getByRole("combobox", { name: /^Shared content/ })).toHaveValue(/0b6f2c1e/);
  const preview = page.getByRole("region", { name: "Live preview" });
  await expect(preview.getByRole("heading", { name: "Our data promise" })).toBeVisible();
});
