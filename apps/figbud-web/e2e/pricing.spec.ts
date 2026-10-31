import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Pricing Studio (P11) against the mock API, which mirrors the API's rules;
// the exact arithmetic is tested in Rust (services/api/src/pricing/engine.rs).

const API = "http://localhost:3199";

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

test("ZiraHR pricing: rates, approval, calculator, quotation, customer link; hidden from the website by default", async ({
  page,
  browser,
  request,
}, testInfo) => {
  // Shared mock data: edit it from one project only.
  test.skip(testInfo.project.name !== "desktop", "edited from the desktop project");
  test.setTimeout(120_000);

  // Public pricing is off before anything happens.
  expect(await (await request.get(`${API}/v1/sites/zirahr/pricing`)).json()).toEqual({ visible: false });

  await signInAsOwner(page);
  await page.goto("/admin/sites/zirahr");
  await page.getByRole("link", { name: "Pricing" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ZiraHR: Pricing Studio");
  await expect(page.getByText("Hidden from the website")).toBeVisible();
  await expect(page.getByText(/no rate yet/)).toBeVisible();

  // Modules: KES, rates start unset; planned modules can't be public.
  const sections = page.getByRole("navigation", { name: "Pricing sections" });
  await sections.getByRole("button", { name: "Modules & items" }).click();
  const core = page.locator('[data-item="core_hr"]');
  await expect(core.getByLabel(/Rate/)).toHaveValue("");
  await core.getByLabel(/Rate/).fill("100");
  await page.locator('[data-item="payroll"]').getByLabel(/Rate/).fill("150");
  await expect(page.locator('[data-item="ai_assistant"]').getByText("Planned")).toBeVisible();
  await expect(
    page.locator('[data-item="ai_assistant"]').getByLabel("Show publicly when pricing is on the website"),
  ).toBeDisabled();
  await core.getByLabel(/Rate/).fill("1o0");
  await expect(page.getByText("Use a number such as 1250 or 99.50.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await core.getByLabel(/Rate/).fill("100");
  await sections.getByRole("button", { name: "Implementation" }).click();
  await page.locator('[data-item="setup_configuration"]').getByLabel(/Rate/).fill("80000");
  await sections.getByRole("button", { name: "Billing, tax & terms" }).click();
  await page.getByLabel("Tax rate %").fill("16");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();

  // Publishing: approval first (owners may approve their own request).
  await sections.getByRole("button", { name: "Publishing" }).click();
  await expect(page.getByRole("switch", { name: "Prices are hidden from the website" })).toBeDisabled();
  await page.getByRole("button", { name: "Ask for approval" }).click();
  await expect(page.getByText(/Approval requested by you/)).toBeVisible();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  // Published, still hidden from the website.
  expect(await (await request.get(`${API}/v1/sites/zirahr/pricing`)).json()).toEqual({ visible: false });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Calculator: 250 employees, Core HR + Payroll monthly, setup once.
  await page.reload();
  await page
    .getByRole("navigation", { name: "Pricing sections" })
    .getByRole("button", { name: "Calculator" })
    .click();
  await page.getByLabel("Employees / licences").fill("250");
  await page.getByRole("checkbox", { name: /Core HR/ }).check();
  await page.getByRole("checkbox", { name: /Payroll & compliance/ }).check();
  await page.getByRole("checkbox", { name: /Initial system configuration/ }).check();
  const summary = page.getByRole("complementary", { name: "Calculation summary" });
  await expect(summary.getByText("KES 62,500.00").first()).toBeVisible();
  await expect(summary.getByText("Renewal per month")).toBeVisible();
  await expect(summary.getByText("KES 72,500.00")).toBeVisible();
  // First period: 72,500 + 80,000 + 16% VAT on setup.
  await expect(summary.getByText("KES 165,300.00")).toBeVisible();
  // Planned modules can't be chosen.
  await expect(page.getByRole("checkbox", { name: /AI assistant/ })).toBeDisabled();

  // Quotation: draft → approval → customer link.
  await summary.getByRole("button", { name: "Create quotation" }).click();
  await summary.getByLabel("Customer or organisation").fill("Example Ltd");
  await summary.getByLabel("Internal notes (never shown to the customer)").fill("Margin check pending");
  await summary.getByRole("button", { name: "Save draft quotation" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /ZIRAHR-Q-/ })).toBeVisible();
  await page.getByRole("button", { name: "Ask for approval" }).click();
  await expect(page.getByText("Pending approval")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Create customer link" }).click();
  const link = await page.getByText(/\/quote#t=[0-9a-f]{64}/).textContent();

  const customer = await (await browser.newContext()).newPage();
  await customer.goto(link!.trim());
  await expect(customer.getByRole("heading", { level: 1, name: /ZIRAHR-Q-/ })).toBeVisible();
  await expect(customer.getByText("Example Ltd")).toBeVisible();
  await expect(customer.getByText("KES 165,300.00")).toBeVisible();
  await expect(customer.getByText("Margin check pending")).toHaveCount(0);
  await expect(customer.getByRole("navigation")).toHaveCount(0);
  // An unknown link (a fresh page: changing only the fragment doesn't reload).
  const stranger = await customer.context().newPage();
  await stranger.goto("/quote#t=" + "0".repeat(64));
  await expect(stranger.getByText("This quotation link isn't available")).toBeVisible();

  // Show pricing on the website: only public items, then hidden again.
  await page.goto("/admin/sites/zirahr/pricing?tab=publishing");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("switch", { name: "Prices are hidden from the website" }).click();
  await expect(page.getByRole("switch", { name: "Prices are shown on the website" })).toBeVisible();
  const shown = await (await request.get(`${API}/v1/sites/zirahr/pricing`)).json();
  expect(shown.visible).toBe(true);
  expect(shown.book.items).toEqual([]);
  expect(shown.book.terms).toBe("");
  await page.getByRole("switch", { name: "Prices are shown on the website" }).click();
  await expect(page.getByRole("switch", { name: "Prices are hidden from the website" })).toBeVisible();

  // The full-screen workspace: the calculator without Studio navigation.
  await page.goto("/admin/pricing-workspace/zirahr");
  await expect(page.getByRole("heading", { level: 1, name: "ZiraHR pricing calculator" })).toBeAttached();
  await expect(page.getByText("Published prices · version 1")).toBeVisible();
  await expect(page.getByRole("link", { name: "Websites" })).toHaveCount(0);
});
