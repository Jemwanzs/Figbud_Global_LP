import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";

import { studioLink } from "./studio-nav";
import { themeSettled } from "./theme-settled";

// Customer & partner banners (P10-B1) against e2e/mock-api.mjs.

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
  test.skip(testInfo.project.name !== "desktop", "creates shared mock data from the desktop project");
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

async function routeCampaignCalls(context: BrowserContext) {
  await context.route("http://localhost:8080/v1/campaigns/**", (route) =>
    route.continue({ url: route.request().url().replace("localhost:8080", "localhost:3199") }),
  );
}

const scan = async (page: Page) =>
  (
    await new AxeBuilder({ page: await themeSettled(page) })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

async function visitor(browser: Browser) {
  const context = await browser.newContext();
  await routeCampaignCalls(context);
  return context.newPage();
}

test("a banner names an approved organisation, keeps its own theme and can be hidden per website", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const run = randomBytes(2).toString("hex");
  const organisation = `Mfano ${run}`;
  await request.post("http://localhost:3199/v1/__test/banner-org", {
    data: { name: organisation, sites: ["figbud"] },
  });
  await signInAsOwner(page);
  await studioLink(page, "Campaigns & promotions");
  const name = `Customer news ${run}`;
  await expect(async () => {
    await page.getByLabel("Campaign name").fill(name);
    await expect(page.getByRole("button", { name: "Create" })).toBeEnabled({ timeout: 1_000 });
  }).toPass();
  await page
    .getByRole("combobox", { name: /^Website/ })
    .first()
    .selectOption("figbud");
  await page
    .getByRole("combobox", { name: /^Type/ })
    .first()
    .selectOption({ label: "Customer & partner banner" });
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // Without an organisation, a customer announcement can't go forward.
  await page.getByRole("combobox", { name: "What is this about?" }).selectOption("new_customer");
  const headline = `Welcome aboard ${run}`;
  await page.getByLabel("Headline", { exact: true }).fill(headline);
  await page.getByRole("combobox", { name: /^Pages/ }).selectOption("custom");
  await page.getByLabel("Page paths").fill("/legal/terms");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByLabel("What changed?").fill("Ready");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Choose the organisation this banner names.")).toBeVisible();

  // Choosing a website it isn't approved for says so before anyone submits.
  await page.getByRole("combobox", { name: /^Organisation/ }).selectOption({ label: organisation });
  await page.getByRole("checkbox", { name: "Jasiri LMS" }).check();
  await expect(page.getByText(/Not yet approved for: jasiri/)).toBeVisible();
  await page.getByRole("checkbox", { name: "Jasiri LMS" }).uncheck();
  await expect(page.getByText(/Not yet approved for/)).toHaveCount(0);

  await page.getByRole("combobox", { name: "Appearance" }).selectOption("light");
  const preview = page.getByRole("group", { name: "Campaign preview" });
  await expect(preview).toContainText(organisation);
  await expect(preview).toContainText(headline);
  expect(await scan(page)).toEqual([]);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText(/Version 1 is awaiting approval/)).toBeVisible();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved and published." })).toBeVisible();

  // Visitors see it with the organisation, in light even on the dark default.
  const site = await visitor(browser);
  await site.goto("/en/legal/terms");
  const banner = site.getByRole("region", { name: headline });
  await expect(banner).toContainText(organisation);
  await expect(banner).toContainText("New customer");
  await expect(banner.locator("xpath=.//ancestor-or-self::*[@data-theme='light'][1]")).toHaveCount(1);
  expect(await scan(site)).toEqual([]);
  // Clicked from inside the page, as a visitor's click is: Playwright's own click scrolls
  // the header button into view first, which can tuck the banner under the sticky header.
  await site
    .getByRole("button", { name: /Switch to (light|dark) theme/ })
    .evaluate((button) => (button as HTMLButtonElement).click());
  expect(await scan(site)).toEqual([]);

  // Hidden on this website at once, with no new approval.
  const showing = page.getByRole("switch", { name: "FigBud Global" });
  await showing.click();
  await expect(page.getByRole("status").filter({ hasText: "Hidden on FigBud Global." })).toBeVisible();
  await expect(showing).not.toBeChecked();
  const again = await visitor(browser);
  await again.goto("/en/legal/terms");
  await expect(again.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(again.getByText(headline)).toHaveCount(0);
});
