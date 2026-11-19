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
  test.skip(testInfo.project.name !== "desktop", "one project saves the settings");
  await signInAsOwner(page);
  await page.goto("/admin/sites/figbud/results");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results & success story");
  const preview = page.locator("[data-results-preview]");
  // Featured by default; the figures read as every website shows them.
  await expect(preview.locator("[data-results-layout=featured]")).toBeVisible();
  await expect(preview.locator("[data-figure] .sr-only").nth(1)).toHaveText("1.3K+");
  await page.getByLabel("Layout").selectOption("cards");
  await expect(preview.locator("[data-results-layout=cards]")).toBeVisible();
  // The columns follow the figures: two figures share the band, no empty cells beside them.
  const band = (await preview.locator("[data-results-layout=cards]").boundingBox())!;
  for (const figure of await preview.locator("[data-results-layout=cards] [data-figure]").all())
    expect((await figure.boundingBox())!.width).toBeGreaterThan(band.width * 0.4);
  await page.getByLabel("Heading (optional)").fill(`Measured, not estimated ${testInfo.project.name}`);
  await expect(preview.getByRole("heading", { level: 2 })).toContainText("Measured, not estimated");
  // (Drafts are saved on Expense Now below: other tests save FigBud Global's settings in parallel.)
  expect(await axe(page)).toEqual([]);

  // Our Success Story: figures from this website only, in order, previewed on its dark band.
  await page.getByRole("tab", { name: "Our Success Story" }).click();
  await expect(preview).toContainText("Choose figures to preview the story.");
  await page.getByLabel("Headline").fill("One vision. Real-world impact.");
  const figures = page.locator("[data-story-figures]");
  await figures.getByRole("checkbox", { name: /Synthetic test people/ }).check();
  await figures.getByRole("checkbox", { name: /Synthetic test metric/ }).check();
  await expect(preview.locator("[data-success-story=strip]")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "One vision. Real-world impact." })).toBeVisible();
  await expect(preview.locator("[data-figure]").first()).toContainText("Synthetic test people");
  await figures.getByRole("button", { name: "Move Synthetic test metric earlier" }).click();
  await expect(preview.locator("[data-figure]").first()).toContainText("Synthetic test metric");
  await page.getByLabel("Layout").selectOption("cards");
  await expect(preview.locator("[data-success-story=cards]")).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Website display: FigBud Global's are the defaults every website inherits.
  await page.getByRole("tab", { name: /Website display/ }).click();
  await expect(page.getByText("Defaults for every website")).toBeVisible();
  await expect(page.getByLabel("Figures", { exact: true })).toHaveValue("compact");

  // Drafts save per website (Expense Now: no other test writes its settings), never reaching visitors.
  await page.goto("/admin/sites/expense_now/results");
  await page.getByLabel("Heading (optional)").fill("Every expense accounted for.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  await page.getByRole("tab", { name: "Our Success Story" }).click();
  await page.getByLabel("Headline").fill("Every expense accounted for.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
  // After a reload the drafts are still there.
  await page.reload();
  await expect(page.getByLabel("Heading (optional)")).toHaveValue("Every expense accounted for.");
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
  await expect(page.getByText("No figures for Ziwa LMS yet.")).toBeVisible();
});

test("Our Success Story's figures are added, edited, duplicated, limited and deleted in place", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project changes the shared figures");
  await signInAsOwner(page);
  // Ziwa LMS: no figures yet, so this test's figures are the only ones there.
  await page.goto("/admin/sites/ziwa/results");
  await page.getByRole("tab", { name: "Our Success Story" }).click();
  const manager = page.locator("[data-story-figures]");
  await expect(manager).toContainText("No figures for Ziwa LMS yet.");
  await manager.getByRole("button", { name: "Add figure" }).click();
  const editor = manager.locator("[data-figure-editor]");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Metric title").fill("Loans processed");
  await editor.getByLabel("Actual value").fill("25000000");
  await editor.getByLabel("Shown as").selectOption("currency");
  await editor.getByLabel("Currency code").fill("KES");
  await editor.getByLabel("After the number").fill("+");
  await expect(editor.locator("[data-figure-preview]")).toHaveText("KES 25M+");
  await editor.getByLabel("Data source").fill("Ziwa loan ledger");
  await editor.getByLabel("Reporting period").fill("Jan–Nov 2026");
  await editor.getByRole("button", { name: "Save figure" }).click();
  await expect(editor.getByRole("status")).toHaveText("Figure saved as a draft.");
  await expect(manager).toContainText("1 of up to 8 in the story");
  // The story previews it while it's still a draft.
  await expect(page.locator("[data-results-preview] [data-figure]").first()).toContainText("Loans processed");

  // A copy is a new draft (to be verified again).
  await manager.getByRole("button", { name: "Duplicate Loans processed" }).click();
  await expect(manager.getByText("Loans processed (copy)")).toBeVisible();
  await expect(manager).toContainText("2 of up to 8 in the story");

  // The limit is the website's to set; at the limit, it says so.
  await page.getByLabel("Figures in the story at most").fill("2");
  await expect(
    manager.getByRole("status").filter({ hasText: "The story shows up to 2 figures" }),
  ).toBeVisible();

  // Preview widths show the tablet and phone layouts.
  await page.getByRole("group", { name: "Preview width" }).getByRole("button", { name: "phone" }).click();
  await expect(page.locator("[data-results-preview]")).toHaveAttribute("data-preview-width", "phone");

  // Never-published figures are deleted outright.
  for (const name of ["Loans processed (copy)", "Loans processed"]) {
    await manager.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
    await expect(manager.getByText(name, { exact: true })).toHaveCount(0);
  }
  await expect(manager).toContainText("No figures for Ziwa LMS yet.");
});
