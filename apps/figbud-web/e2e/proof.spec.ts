import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

// Customers & proof (P10-T1..T3). The mock API seeds one synthetic, clearly
// labelled organisation, testimonial and metric, published for FigBud Global.

test("the home page shows published Trusted By logos, verified metrics and testimonials", async ({
  page,
  request,
}) => {
  // Figures and quotes are in the server HTML (count-ups start from the final value).
  const html = await (await request.get("/en")).text();
  expect(html).toContain("Trusted by teams building what comes next.");
  expect(html).toContain("Synthetic test quotation used only by automated tests.");
  expect(html).toContain("KES");

  await page.goto("/en");
  const trusted = page.getByRole("region", { name: "Trusted by teams building what comes next." });
  await trusted.scrollIntoViewIfNeeded();
  const logo = trusted.getByRole("img", { name: "Synthetic Test Organisation" }).first();
  await expect(logo).toBeVisible();
  // Logos load from this website's origin, and only because a published record uses them.
  expect(await logo.getAttribute("src")).toMatch(/^\/media\/[0-9a-f-]{36}$/);
  // It opens the organisation's own website, in a new tab.
  const link = trusted.getByRole("link", { name: /Synthetic Test Organisation/ }).first();
  await expect(link).toHaveAttribute("href", "https://example.com");
  await expect(link).toHaveAttribute("target", "_blank");
  const metrics = page.getByRole("region", { name: "Measured, not estimated." });
  await metrics.scrollIntoViewIfNeeded();
  await expect(metrics.getByText("Synthetic test metric")).toBeVisible();
  // Each figure carries its source and period.
  await expect(metrics.getByText("Source: Test fixture · Test period")).toBeVisible();
  await expect(page.getByRole("region", { name: "In our customers' words." })).toContainText(
    "Synthetic Test Organisation",
  );
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

// Studio tests run one after another: the mock's passkey sign-in handles one
// registration at a time.
test.describe("Studio", () => {
  test.describe.configure({ mode: "serial" });

  test("Studio: an organisation is published only with recorded permission, for chosen websites", async ({
    page,
  }, testInfo) => {
    // Shared mock data: edit it from one project only.
    test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
    test.setTimeout(90_000);
    await signInAsOwner(page);
    await page.goto("/admin/marketing");
    const tabs = page.getByRole("navigation", { name: "Content & Marketing" });
    await tabs.getByRole("link", { name: "Trusted By" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trusted By");
    await expect(page.getByRole("link", { name: /Synthetic Test Organisation/ })).toBeVisible();

    await page.getByRole("button", { name: "Add organisation" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New organisation");
    const name = `Proof Test ${randomBytes(3).toString("hex")}`;
    await page.getByLabel("Organisation name").fill(name);
    // The checklist follows unsaved edits; one logo is enough (no separate icon).
    await expect(page.getByText("Add the organisation's approved logo.")).toBeVisible();
    await expect(page.getByText("Icon", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Approved logo" }).click();
    const library = page.getByRole("dialog", { name: "Approved logo: choose an image" });
    await library.getByRole("searchbox", { name: "Search the media library" }).fill("synthetic logo");
    await library
      .getByRole("button", { name: /Synthetic logo/ })
      .first()
      .click();
    await expect(library).toBeHidden();
    await expect(page.getByRole("button", { name: "Replace" })).toBeVisible();
    await expect(page.getByText("Add the organisation's approved logo.")).toHaveCount(0);
    await page.getByLabel("Show on FigBud Global").check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    // Without recorded permission it can't go for approval.
    await expect(
      page.getByText("Confirm the relationship and their approval to be shown publicly."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask for approval" })).toBeDisabled();

    await page.getByLabel("The relationship is confirmed with the organisation").check();
    await page.getByLabel("They approved showing their name and logo publicly").check();
    await page.getByLabel("Where the approval is recorded").fill("Signed consent form (test)");
    // Complete before saving: one click saves and asks for approval.
    await expect(page.getByText("Ready for approval")).toBeVisible();
    await page.getByRole("button", { name: "Save and ask for approval" }).click();
    await expect(page.getByText(/Approval requested by you/)).toBeVisible();
    // Owners may approve their own request; reviewers need a colleague (API rule).
    await page.getByRole("button", { name: "Approve and publish" }).click();
    await expect(page.getByText(/Published version 1, shown on figbud/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Versions" }).locator("..")).toContainText("Version 1");

    const results = await new AxeBuilder({ page: await themeSettled(page) })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);

    // Hide, then unpublish and archive, so other tests see the seeded data only.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.getByText("Not shown on any website.")).toBeVisible();
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Archived", { exact: true }).first()).toBeVisible();
  });

  test("Studio: metrics need a source, a period and verification", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
    test.setTimeout(60_000);
    await signInAsOwner(page);
    await page.goto("/admin/proof?kind=metric");
    await page.getByRole("button", { name: "Add metric" }).click();
    await page.getByLabel("What it measures").fill("Payroll processed");
    await page.getByLabel("Figure", { exact: true }).fill("2000000");
    await page.getByLabel("Shown as").selectOption("currency");
    await page.getByLabel("Show on FigBud Global").check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Use a three-letter currency code such as KES.")).toBeVisible();
    await page.getByLabel("Currency code").fill("KES");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByText("Every published figure needs its source and measurement period."),
    ).toBeVisible();
    await expect(page.getByText("Confirm the figure was checked against its source.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask for approval" })).toBeDisabled();
    await page.getByRole("button", { name: "Archive" }).click();
  });
});
