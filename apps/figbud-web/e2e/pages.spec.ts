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
  // Typing before hydration finishes would skip the identifier suggestion; retry until it appears.
  await expect(async () => {
    await page.getByLabel("Website name").fill(`Pageful ${run}`);
    await expect(page.getByLabel("Identifier")).not.toHaveValue("", { timeout: 1_000 });
  }).toPass();
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

  // The website's category set comes first, with a suggested title and address.
  const create = page.getByRole("button", { name: "Create page" });
  await expect(page.getByText("For HR & Workforce websites")).toBeVisible();
  await expect(page.getByRole("radio", { name: /HR home page/ })).toBeChecked();
  await expect(page.getByLabel("Page title")).toHaveValue("Home");
  await page.getByRole("radio", { name: /Integrations/ }).check();
  await expect(page.getByLabel("Page title")).toHaveValue("Integrations");
  await expect(page.getByLabel("Address")).toHaveValue("integrations");

  // Create from a template; the address follows the title.
  await page.getByRole("radio", { name: /^Home page/ }).check();
  await page.getByLabel("Page title").fill("Platform");
  await expect(page.getByLabel("Address")).toHaveValue("platform");
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

  // An address already in use is caught before creating.
  await page.getByRole("radio", { name: /^Blank page/ }).check();
  await page.getByRole("textbox", { name: "Page title" }).fill("Platform");
  await expect(page.getByText("/platform is already used by “Platform”")).toBeVisible();
  await expect(create).toBeDisabled();
});

test("schedule a change, approve it for later, and call it off", async ({ page }) => {
  await signInAsOwner(page);
  await newSite(page);
  await page.getByRole("link", { name: "Pages" }).click();
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");

  // Choosing "At a set time" suggests an hour from now; past times are refused.
  const publishing = page.getByRole("region", { name: "Publishing" });
  await publishing.getByLabel("What changed?").fill("Launch copy");
  await publishing.getByRole("radio", { name: "At a set time" }).check();
  const goLive = publishing.getByLabel(/Go-live time/);
  await expect(goLive).not.toHaveValue("");
  await goLive.fill("2020-01-01T09:00");
  await expect(publishing.getByText("Choose a time at least a minute from now")).toBeVisible();
  await expect(publishing.getByRole("button", { name: "Submit for publishing" })).toBeDisabled();
  await goLive.fill(`${new Date().getFullYear() + 1}-01-15T09:00`);
  await publishing.getByRole("button", { name: "Submit for publishing" }).click();

  // Approval schedules it; the current version stays as it is until then.
  await expect(publishing).toContainText("Version 1 is awaiting approval");
  await expect(publishing).toContainText("once approved");
  await publishing.getByRole("button", { name: "Schedule my change" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved and scheduled." })).toBeVisible();
  await expect(publishing).toContainText("Version 1 goes live");
  await expect(page.getByRole("region", { name: "Version history" })).toContainText(
    "Version 1 · Scheduled for",
  );
  const results = await new AxeBuilder({ page })
    .include(`section[aria-labelledby$="-publish"]`)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // The pages list shows it; then it is called off.
  await page.goto(page.url().replace(/\/pages\/[0-9a-f-]+$/, "/pages"));
  await expect(page.getByRole("list", { name: "Pages" })).toContainText("Scheduled ·");
  await page.getByRole("list", { name: "Pages" }).getByRole("link", { name: "Edit Home" }).click();
  await publishing.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Schedule cancelled." })).toBeVisible();
  await expect(publishing.getByRole("button", { name: "Submit for publishing" })).toBeVisible();
});

test("the page editor is accessible", async ({ page }) => {
  await signInAsOwner(page);
  await newSite(page);
  await page.getByRole("link", { name: "Pages" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ pages$/);
  // The new-page form, template gallery included, passes the same checks.
  const list = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(list.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
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

test("hide a section, and manage a page's visibility without losing it", async ({ page }) => {
  await signInAsOwner(page);
  await newSite(page);
  await page.getByRole("link", { name: "Pages" }).click();
  await page.getByRole("radio", { name: /^Features/ }).check();
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Features");

  // Hiding a section keeps it in the draft, labelled in the list and the preview.
  const sections = page.getByRole("list", { name: "Sections" });
  const toggle = sections.getByRole("button", { name: /^Hide Call to action section/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(sections.getByRole("listitem").filter({ hasText: "Call to action" })).toContainText("Hidden");
  await expect(page.getByRole("region", { name: "Live preview" }).locator("[data-hidden]")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({ timeout: 10_000 });

  // A section style puts it on a band in the website's theme colours (part of the draft).
  await sections.getByRole("button", { name: /^Hero/ }).click();
  const style = page.getByRole("radiogroup", { name: "Hero section style" });
  await expect(style.getByRole("radio", { name: /Default/ })).toHaveAttribute("aria-checked", "true");
  await style.getByRole("radio", { name: /Brand band/ }).click();
  await expect(page.getByRole("region", { name: "Live preview" }).locator('[data-tone="brand"]')).toHaveCount(
    1,
  );
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible({ timeout: 10_000 });

  // Visibility switches change the page at once; the home page can't go offline.
  const visibility = page.getByRole("region", { name: "Visibility" });
  const online = visibility.getByRole("switch", { name: "Online" });
  const inNav = visibility.getByRole("switch", { name: "Show in navigation" });
  await expect(online).toHaveAttribute("aria-checked", "true");
  page.once("dialog", (dialog) => dialog.accept());
  await online.click();
  await expect(page.getByRole("status").filter({ hasText: "Page taken offline." })).toBeVisible();
  await expect(online).toHaveAttribute("aria-checked", "false");
  await inNav.click();
  await expect(inNav).toHaveAttribute("aria-checked", "false");

  await page.goto(page.url().replace(/\/pages\/[0-9a-f-]+$/, "/pages"));
  const row = page.getByRole("list", { name: "Pages" }).getByRole("listitem").filter({ hasText: "Features" });
  await expect(row).toContainText("Offline");
  await expect(row).toContainText("Not in navigation");
  await expect(row).toContainText("1 hidden section");

  // Back online, from the editor.
  await row.getByRole("link", { name: /^Edit Features/ }).click();
  await online.click();
  await expect(online).toHaveAttribute("aria-checked", "true");
  const results = await new AxeBuilder({ page })
    .include(`section[aria-labelledby$="-visibility"]`)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
