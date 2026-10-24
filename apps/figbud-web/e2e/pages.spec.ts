import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Page builder (Admin Studio, Phase C) against e2e/mock-api.mjs.

test.describe.configure({ timeout: 90_000 });

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
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

/** A fresh website so parallel runs never share pages. */
async function newSite(page: Page) {
  const run = randomBytes(3).toString("hex");
  await page.goto("/admin/sites/new");
  await page.getByLabel("Website name").fill(`Pageful ${run}`);
  await page.getByRole("button", { name: "Create draft website" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Pageful ${run}`);
  return run;
}

const saved = (page: Page) =>
  expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({ timeout: 10_000 });

test("build a page from a template, publish it, and manage pages", async ({ page }) => {
  await signInAsOwner(page);
  const run = await newSite(page);
  await page.getByRole("link", { name: "Pages" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Pageful ${run} pages`);
  await expect(page.getByText("No pages yet. Start with a home page.")).toBeVisible();

  // Create from a template; the address follows the title.
  const create = page.getByRole("button", { name: "Create page" });
  await page.getByLabel("Page title").fill("Platform");
  await expect(page.getByLabel("Address")).toHaveValue("platform");
  await page.getByLabel("Start from").selectOption("home");
  await create.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Platform");
  const sections = page.getByRole("list", { name: "Sections" });
  await expect(sections.getByRole("listitem")).toHaveCount(3);
  const preview = page.getByRole("region", { name: "Live preview" });

  // Edit the hero; the preview follows immediately and the draft autosaves.
  await sections.getByRole("button", { name: /^Hero/ }).click();
  await sections.getByLabel("Headline").fill("Every loan. A smoother journey.");
  await expect(preview.getByRole("heading", { name: "Every loan. A smoother journey." })).toBeVisible();
  await saved(page);

  // Add a questions section and move it above the call to action.
  await page.getByLabel("Add a section").selectOption("faq");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sections.getByRole("listitem")).toHaveCount(4);
  await sections.getByRole("button", { name: "Move Questions section up" }).click();
  await expect(sections.getByRole("listitem").nth(2)).toContainText("Questions");
  await saved(page);

  // Unsafe links are refused and nothing is saved until fixed.
  await sections.getByRole("button", { name: /^Call to action/ }).click();
  const link = sections.getByLabel("Link");
  await link.fill("javascript:alert(1)");
  await expect(page.getByRole("alert").filter({ hasText: "Links must be a page on the site" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Draft not saved" })).toBeVisible();
  await link.fill("/contact");
  await saved(page);

  // Submit and publish (owners may approve their own change, audited).
  const publishing = page.getByRole("region", { name: "Publishing" });
  await expect(publishing.getByRole("button", { name: "Submit for publishing" })).toBeDisabled();
  await expect(publishing.getByText("Say what changed")).toBeVisible();
  await publishing.getByLabel("What changed?").fill("First version");
  await publishing.getByRole("button", { name: "Submit for publishing" }).click();
  await expect(publishing).toContainText("Version 1 is awaiting approval");
  await publishing.getByRole("button", { name: "Publish my change" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Page published." })).toBeVisible();
  const history = page.getByRole("region", { name: "Version history" });
  await expect(history).toContainText("Version 1 · Published");

  // A later edit can be discarded back to the published page.
  await sections.getByRole("button", { name: /^Hero/ }).click();
  await sections.getByLabel("Headline").fill("A different headline");
  await saved(page);
  await publishing.getByRole("button", { name: "Discard draft changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft reset to the published page." }),
  ).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Every loan. A smoother journey." })).toBeVisible();

  // The full preview shows the saved draft, marked private.
  const [full] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("link", { name: /Full preview/ }).click(),
  ]);
  await expect(full.getByText(/Draft preview of/)).toBeVisible();
  await expect(
    full.getByRole("heading", { level: 1, name: "Every loan. A smoother journey." }),
  ).toBeVisible();
  await full.close();

  // Back to the list: duplicate and reorder.
  await page.goto(page.url().replace(/\/pages\/[0-9a-f-]+$/, "/pages"));
  const list = page.getByRole("list", { name: "Pages" });
  await list.getByRole("button", { name: "Duplicate Platform" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("/platform-copy");
  const saveOrder = page.getByRole("button", { name: "Save order" });
  await expect(saveOrder).toBeDisabled();
  await list.getByRole("button", { name: "Move Platform (copy) up" }).click();
  await expect(saveOrder).toBeEnabled();
  await saveOrder.click();
  await expect(page.getByRole("status").filter({ hasText: "Order saved." })).toBeVisible();
  await expect(list.getByRole("listitem").first()).toContainText("Platform (copy)");

  // Archive from the editor, restore from the list.
  await list.getByRole("link", { name: "Edit Platform (copy)" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Pageful ${run} pages`);
  await expect(page.getByRole("region", { name: "Archived" })).toContainText("Platform (copy)");
  await page.getByRole("button", { name: "Restore Platform (copy)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Page restored." })).toBeVisible();
});

test("the page editor is accessible", async ({ page }) => {
  await signInAsOwner(page);
  await newSite(page);
  await page.getByRole("link", { name: "Pages" }).click();
  await page.getByLabel("Page title").fill("Home");
  await page.getByLabel("Address").fill("");
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
  await page.getByRole("list", { name: "Sections" }).getByRole("button", { name: /^Hero/ }).click();
  // No sideways scrolling, even with a section form open (phones included).
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
});
