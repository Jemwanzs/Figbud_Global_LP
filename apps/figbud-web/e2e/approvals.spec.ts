import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import { studioLink } from "./studio-nav";
import { themeSettled } from "./theme-settled";

// The approval queue across websites and the activity log (P7-F2), against
// e2e/mock-api.mjs.

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

const scan = async (page: Page) =>
  (
    await new AxeBuilder({ page: await themeSettled(page) })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("the queue lists every website's requests and links to where they're decided", async ({ page }) => {
  await signInAsOwner(page);

  // The Overview says how many are waiting, and the menu leads there.
  await expect(page.getByRole("link", { name: /^Approvals.*waiting for you$/ })).toContainText("3");
  await studioLink(page, "Approvals");
  await expect(page.getByRole("heading", { level: 1, name: "Approvals" })).toBeVisible();

  const yours = page.getByRole("region", { name: /Waiting for you/ });
  await expect(yours.getByRole("listitem")).toHaveCount(3);
  await expect(yours).toContainText("New module wording");
  await expect(yours).toContainText("Edna Editor");

  // Each item opens its own screen, where its preview and rules live.
  await expect(yours.getByRole("link", { name: "Review: Platform" })).toHaveAttribute(
    "href",
    "/admin/sites/zirahr/pages/queue-page",
  );
  await expect(yours.getByRole("link", { name: "Review: Payroll Calculator rules" })).toHaveAttribute(
    "href",
    "/admin/sites/zirahr/payroll-calculator",
  );
  await expect(yours.getByRole("link", { name: "Review: Sample organisation" })).toHaveAttribute(
    "href",
    "/admin/proof/queue-proof",
  );

  // Narrow it to one website.
  const filter = page.getByRole("navigation", { name: "Filter by website" });
  await filter.getByRole("link", { name: "Jasiri LMS" }).click();
  await expect(page).toHaveURL(/site=jasiri/);
  await expect(yours.getByRole("listitem")).toHaveCount(1);
  await expect(filter.getByRole("link", { name: "Jasiri LMS" })).toHaveAttribute("aria-current", "true");
  await filter.getByRole("link", { name: "All websites" }).click();
  await expect(yours.getByRole("listitem")).toHaveCount(3);

  expect(await scan(page)).toEqual([]);
  // The theme switch lives in the account menu; the menu closes again before scanning.
  await page.getByRole("banner").getByRole("button", { name: /Olu/ }).click();
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  await page.keyboard.press("Escape");
  expect(await scan(page)).toEqual([]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("the sidebar shows every main tab at desktop widths, beside the content", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "sets its own widths");
  await signInAsOwner(page);
  const nav = page.getByRole("navigation", { name: "Admin" });
  for (const width of [1024, 1100, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
    // Overview, then the seven main tabs with sub-tabs.
    await expect(nav.getByRole("link", { name: "Overview" })).toBeInViewport();
    await expect(nav.locator(":scope > ul > li")).toHaveCount(8);
    await expect(page.getByRole("button", { name: /Olu/ })).toBeInViewport();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  }
});

test("the activity log shows what changed, as text, by website", async ({ page, request }) => {
  await signInAsOwner(page);
  await request.post("http://localhost:3199/v1/__test/audit-change");

  await page.goto("/admin/activity?site=zirahr");
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  const entry = page.getByRole("listitem").filter({ hasText: "Published a page" }).first();
  const toggle = entry.getByRole("button", { name: "Show changes" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(entry.getByRole("button", { name: "Hide changes" })).toHaveAttribute("aria-expanded", "true");
  await expect(entry.getByText("<b>Old heading</b>")).toBeVisible();
  await expect(entry.getByText("New heading")).toBeVisible();
  await expect(entry.getByText("(empty)")).toBeVisible();

  expect(await scan(page)).toEqual([]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("approval rules: two approvals for website status; a request assigned to one approver", async ({
  page,
}) => {
  // P13-B5 (owner's brief, 12 Nov 2026). The mock keeps rules per owner, so parallel
  // tests aren't affected.
  test.setTimeout(90_000);
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
  const run = randomBytes(3).toString("hex");
  const name = `Rae Owner ${run}`;
  await page.goto(`/admin/invite#token=${randomBytes(32).toString("hex")}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Create passkey and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Rae");

  // The rules, in Users & access: chosen people need at least one; website status needs two.
  await page.goto("/admin/settings/team");
  const rules = page.getByRole("region", { name: "Approval rules" });
  await expect(rules.getByRole("listitem")).toHaveCount(9);
  const pages = rules.getByRole("listitem").filter({ hasText: "Pages" });
  await pages.getByLabel("Who approves").selectOption("people");
  await expect(pages).toContainText("Choose at least one approver");
  await expect(pages.getByRole("button", { name: "Save the rule for Pages" })).toBeDisabled();
  await pages.getByLabel("Who approves").selectOption("reviewer");
  const status = rules.getByRole("listitem").filter({ hasText: "Website status" });
  await status.getByLabel("Approvals needed").selectOption("2");
  await status.getByRole("button", { name: "Save the rule for Website status" }).click();
  await expect(status.getByRole("status")).toContainText("Saved");

  // A new website's launch: the first approval is recorded, not applied.
  await page.goto("/admin/sites/new");
  await expect(async () => {
    await page.getByLabel("Website name").fill(`Rules ${run}`);
    await expect(page.getByLabel("Identifier")).not.toHaveValue("", { timeout: 1_000 });
  }).toPass();
  await page.getByRole("radio", { name: "Lending & Credit" }).click();
  await page.getByRole("radio", { name: /Coming soon/ }).click();
  await page.getByLabel("Domain").fill(`rules-${run}.example.com`);
  await page.getByRole("button", { name: "Create draft website" }).click();
  const lifecycle = page.getByRole("complementary", { name: "Marketing status" });
  await lifecycle.getByRole("button", { name: "Approve my request" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your approval is recorded (1 of 2)" }),
  ).toBeVisible();
  await expect(lifecycle.locator("[aria-current=step]")).toHaveText("Draft");
  await lifecycle.getByRole("button", { name: "Approve my request" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already approved" })).toBeVisible();

  // Reassignment in Approvals: to one approver, then back to everyone.
  await page.goto("/admin/approvals");
  const item = page.getByRole("listitem").filter({ hasText: "New module wording" });
  await item.getByLabel("Assign to").selectOption({ label: `${name} (owner)` });
  await item.getByRole("button", { name: "Assign Platform" }).click();
  await expect(item.getByRole("status")).toContainText(`Assigned to ${name}.`);
  await expect(item).toContainText(`Assigned to ${name}`);
  await item.getByLabel("Assign to").selectOption("");
  await item.getByRole("button", { name: "Assign Platform" }).click();
  await expect(item.getByRole("status")).toContainText("Open to every approver again.");

  expect(await scan(page)).toEqual([]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
