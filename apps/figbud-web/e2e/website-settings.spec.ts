import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Navigation, footer & forms per website (P7-E2). In the mock API, Jasiri LMS
// isn't taking enquiries (a fixture); the Studio test edits Ziwa LMS's menu.

test("a product closed to enquiries says so on the contact form and can't be chosen", async ({ page }) => {
  await page.goto("/en/contact?kind=demo_request&product=jasiri");
  const note = page.getByRole("note", { name: "Jasiri LMS isn't taking enquiries right now" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("Jasiri LMS is taking enquiries through its partners for now.");
  // The form starts on FigBud Global instead, and Jasiri can't be picked.
  await expect(page.getByLabel("Product")).toHaveValue("figbud");
  await expect(page.locator('option[value="jasiri"]')).toBeDisabled();
  await expect(page.locator('option[value="jasiri"]')).toHaveText("Jasiri LMS (not taking enquiries)");
  // Open products are unaffected.
  await page.goto("/en/contact?kind=demo_request&product=zirahr");
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(page.getByLabel("Product")).toHaveValue("zirahr");
});

test("if a product closes while the form is open, the API's refusal is explained", async ({ page }) => {
  await page.route("**/v1/enquiries", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "enquiries_closed", message: "Closed." } }),
    }),
  );
  await page.goto("/en/contact?kind=waitlist&product=ziwa");
  await expect(async () => {
    await page.getByLabel("Full name").fill("Amina Otieno");
    await expect(page.getByLabel("Full name")).toHaveValue("Amina Otieno", { timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Work email").fill("amina@example.co.ke");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Ziwa LMS isn't taking enquiries right now.", { exact: false })).toBeVisible();
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

test("Studio: a website's navigation, footer and enquiry switch", async ({ page }, testInfo) => {
  // Shared mock data: edit it from one project only.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(60_000);
  await signInAsOwner(page);
  await page.goto("/admin/sites/ziwa");
  await page.getByRole("link", { name: "Navigation & forms" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Navigation, footer & forms");
  await expect(page.getByRole("switch", { name: "Taking enquiries" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText(/Shown now: Platform/)).toBeVisible();

  // Closing is a deliberate switch; here it's turned back before saving.
  await expect(async () => {
    await page.getByRole("switch", { name: "Taking enquiries" }).click();
    await expect(page.getByRole("switch", { name: "Not taking enquiries" })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole("switch", { name: "Not taking enquiries" }).click();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();

  // A custom menu: unsafe addresses are refused, then saved and kept.
  await page.getByRole("radio", { name: /Links I choose/ }).click();
  await page.getByRole("button", { name: "Add link to menu links" }).click();
  await page.getByLabel("Menu links: link 1 label").fill("Platform");
  await page.getByLabel("Menu links: link 1 address").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Links go to a page path such as /platform")).toBeVisible();
  await page.getByLabel("Menu links: link 1 address").fill("/platform");
  await page.getByLabel("Footer note").fill("Lending that flows with your business.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: /Links I choose/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Menu links: link 1 address")).toHaveValue("/platform");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Put the menu back for other tests; the corporate website can't close enquiries.
  await page.getByRole("radio", { name: /The website's pages/ }).click();
  await page.getByLabel("Footer note").fill("");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.goto("/admin/sites/figbud/website");
  await expect(page.getByRole("switch", { name: "Taking enquiries" })).toBeDisabled();
  await expect(page.getByText("The corporate website always takes enquiries.")).toBeVisible();
});
