import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type BrowserContext, type Page, expect, test } from "@playwright/test";

import { studioLink } from "./studio-nav";

// Campaigns & promotions (P8-M1) against e2e/mock-api.mjs. Campaigns target
// /en/legal/terms only, so other tests never see them.

test.describe.configure({ timeout: 120_000 });

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  test.skip(testInfo.project.name !== "desktop", "publishes shared mock campaigns from the desktop project");
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

/** The browser calls the API directly; in tests that's the mock (like the consent tests' routing). */
async function routeCampaignCalls(context: BrowserContext) {
  await context.route("http://localhost:8080/v1/campaigns/**", (route) =>
    route.continue({ url: route.request().url().replace("localhost:8080", "localhost:3199") }),
  );
}

async function create(page: Page, name: string, type: string) {
  await studioLink(page, "Marketing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Campaigns & Promotions");
  await expect(async () => {
    await page.getByLabel("Campaign name").fill(name);
    await expect(page.getByRole("button", { name: "Create" })).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await page
    .getByRole("combobox", { name: /^Website/ })
    .first()
    .selectOption("figbud");
  await page.getByRole("combobox", { name: /^Type/ }).first().selectOption({ label: type });
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

/** Only on the terms page, so no other test sees the campaign. */
async function targetTermsPage(page: Page) {
  await page.getByRole("combobox", { name: /^Pages/ }).selectOption("custom");
  await page.getByLabel("Page paths").fill("/legal/terms");
}

async function submitAndApprove(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByLabel("What changed?").fill("Ready to go");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText(/Version 1 is awaiting approval/)).toBeVisible();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved and published." })).toBeVisible();
}

test("build, approve and show a campaign; dismiss and pause it", async ({ page, browser }) => {
  await signInAsOwner(page);
  const run = randomBytes(2).toString("hex");
  await create(page, `Year-end demos ${run}`, "Announcement bar");
  const headline = `Year-end demos are open ${run}`;
  await page.getByLabel("Headline", { exact: true }).fill(headline);
  await page.getByLabel("Badge (optional)").fill("New");
  await expect(page.getByRole("group", { name: "Campaign preview" })).toContainText(headline);
  await targetTermsPage(page);
  // Nothing goes live until it's saved, submitted and approved.
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeDisabled();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await submitAndApprove(page);
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();

  // A visitor sees it on the chosen page only, with the enquiry link attributed.
  const visitor = await browser.newContext();
  const site = await visitor.newPage();
  await site.goto("/en/legal/terms");
  const bar = site.getByRole("region", { name: headline });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link", { name: /Request a demo/ })).toHaveAttribute(
    "href",
    /\/en\/contact\?product=figbud&kind=demo_request&campaign=[0-9a-f-]{36}$/,
  );
  await site.goto("/en/legal/privacy");
  await expect(site.getByRole("region", { name: headline })).toHaveCount(0);
  // Dismissed for the rest of the visit.
  await site.goto("/en/legal/terms");
  await site.getByRole("region", { name: headline }).getByRole("button", { name: "Dismiss" }).click();
  await expect(site.getByRole("region", { name: headline })).toHaveCount(0);
  await site.reload();
  await expect(site.getByRole("region", { name: headline })).toHaveCount(0);
  await visitor.close();

  // Paused: off the website at once.
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("status").filter({ hasText: /paused/ })).toBeVisible();
  const fresh = await browser.newContext();
  const again = await fresh.newPage();
  await again.goto("/en/legal/terms");
  await expect(again.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(again.getByRole("region", { name: headline })).toHaveCount(0);
  await fresh.close();
});

test("spin to win: rules, a reward decided by the API and a code", async ({ page, browser }) => {
  await signInAsOwner(page);
  const run = randomBytes(2).toString("hex");
  await create(page, `Spin ${run}`, "Interactive rewards");
  const headline = `Spin for a FigBud reward ${run}`;
  await page.getByLabel("Headline", { exact: true }).fill(headline);
  await page.getByLabel("Centred dialog").uncheck();
  await page.getByLabel("Above the footer").check();
  await targetTermsPage(page);
  await page.getByLabel("Reward", { exact: true }).fill("Free training session");
  await page.getByLabel("Quantity").fill("5");
  await page.getByLabel("How to redeem it").fill("Book your session with the code.");
  await page.getByLabel("Who can take part").fill("Organisations in Kenya. Free to enter.");
  await page.getByLabel("Ends (your time zone)").fill("2030-01-01T00:00");
  await page
    .getByLabel("Terms and conditions (required, Markdown)")
    .fill("Free to enter. One attempt per email.");
  await page
    .getByLabel("Legal review (required to submit)")
    .fill("Reviewed for Kenya by counsel; free entry only.");
  await submitAndApprove(page);

  const visitor = await browser.newContext({ reducedMotion: "reduce" });
  await routeCampaignCalls(visitor);
  const site = await visitor.newPage();
  await site.goto("/en/legal/terms");
  const promo = site.getByRole("region", { name: headline });
  await expect(promo).toBeVisible();
  const spin = promo.getByRole("button", { name: "Spin the wheel" });
  await expect(spin).toBeDisabled();
  await promo.getByLabel("Your email").fill(`visitor-${run}@example.com`);
  await promo.getByLabel(/I accept the rules/).check();
  await spin.click();
  const result = promo.getByRole("status");
  await expect(result).toContainText("You won");
  await expect(result).toContainText("Free training session");
  await expect(result).toContainText(/FB-[0-9A-F-]{10}/);
  await visitor.close();

  // The Studio counts the claim.
  await page.reload();
  await expect(page.getByRole("region", { name: "Results" })).toContainText("Reward claims");
});
