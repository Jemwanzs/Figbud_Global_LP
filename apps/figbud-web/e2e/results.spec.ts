import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import { scrolledToTop, themeSettled } from "./theme-settled";

// Results & achievements and Our Success Story in the Studio (P10-R1/R2),
// against e2e/mock-api.mjs: FigBud Global has two published synthetic
// figures. The preview renders the websites' own components. Saving drafts
// runs on the desktop project only, so parallel projects never race one
// version of FigBud Global's settings.

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
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Olu" })).toBeVisible();
}

const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page: await themeSettled(await scrolledToTop(page)) })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test("the Results band and Our Success Story are designed, previewed and saved per website", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project saves FigBud Global's settings");
  await signInAsOwner(page);
  await page.goto("/admin/sites/figbud/results");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results & success story");
  const preview = page.locator("[data-results-preview]");
  // Featured by default; the figures read as every website shows them.
  await expect(preview.locator("[data-results-layout=featured]")).toBeVisible();
  await expect(preview.locator("[data-figure] .sr-only").nth(1)).toHaveText("1.3K+");
  await page.getByLabel("Layout").selectOption("cards");
  await expect(preview.locator("[data-results-layout=cards]")).toBeVisible();
  await page.getByLabel("Heading (optional)").fill(`Measured, not estimated ${testInfo.project.name}`);
  await expect(preview.getByRole("heading", { level: 2 })).toContainText("Measured, not estimated");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Our Success Story: figures from this website only, in order, previewed on its dark band.
  await page.getByRole("tab", { name: "Our Success Story" }).click();
  await expect(preview).toContainText("Choose figures to preview the story.");
  await page.getByLabel("Headline").fill("One vision. Real-world impact.");
  const figures = page.locator("[data-story-figures]");
  await figures.getByLabel(/Synthetic test people/).check();
  await figures.getByLabel(/Synthetic test metric/).check();
  await expect(preview.locator("[data-success-story=strip]")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "One vision. Real-world impact." })).toBeVisible();
  await expect(preview.locator("[data-figure]").first()).toContainText("Synthetic test people");
  await figures.getByRole("button", { name: "Move Synthetic test metric earlier" }).click();
  await expect(preview.locator("[data-figure]").first()).toContainText("Synthetic test metric");
  await page.getByLabel("Layout").selectOption("cards");
  await expect(preview.locator("[data-success-story=cards]")).toBeVisible();
  // A draft only (switched off): nothing reaches the home page from this test.
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Website display: FigBud Global's are the defaults every website inherits.
  await page.getByRole("tab", { name: /Website display/ }).click();
  await expect(page.getByText("Defaults for every website")).toBeVisible();
  await expect(page.getByLabel("Figures", { exact: true })).toHaveValue("compact");
});

test("a product website inherits FigBud Global's website display until it sets its own", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/sites/ziwa/results");
  await page.getByRole("tab", { name: "Website display" }).click();
  const inherit = page.getByLabel("Use FigBud Global's website display");
  await expect(inherit).toBeChecked();
  await expect(page.getByLabel("Figures", { exact: true })).toHaveCount(0);
  await inherit.uncheck();
  await expect(page.getByLabel("Figures", { exact: true })).toHaveValue("compact");
  // No figures are published for Ziwa: the story says where they come from.
  await page.getByRole("tab", { name: "Our Success Story" }).click();
  await expect(page.getByText("No figures are published for Ziwa LMS yet.")).toBeVisible();
});
