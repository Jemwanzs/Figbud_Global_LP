import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// The testimonial band's display in the Studio (P10-R4), against
// e2e/mock-api.mjs: Ziwa LMS has two published synthetic testimonials and
// ZiraHR one; saving happens on a new website, so no other spec is affected.

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

test("the testimonial band's layout and spacing are previewed, drafted and published per website (P10-R4)", async ({
  page,
}) => {
  await signInAsOwner(page);

  // Previewed with the website's own published testimonials: a carousel for two, a grid on request.
  await page.goto("/admin/sites/ziwa/results");
  await page.getByRole("tab", { name: "Testimonials" }).click();
  const preview = page.locator("[data-results-preview]");
  await expect(page.getByLabel("Layout", { exact: true })).toHaveValue("auto");
  await expect(page.getByLabel("Spacing", { exact: true })).toHaveValue("compact");
  await expect(preview.locator('[data-testimonials="carousel"]')).toBeVisible();
  await page.getByLabel("Layout", { exact: true }).selectOption("grid");
  await expect(preview.locator('[data-testimonials="grid"]')).toBeVisible();
  await page.getByLabel("Layout", { exact: true }).selectOption("card");
  await expect(preview.locator('[data-testimonials="card"] [data-testimonial]')).toHaveCount(2);
  // At phone width too.
  await page.getByRole("button", { name: "phone" }).click();
  await expect(preview).toHaveAttribute("data-preview-width", "phone");

  // On a new website: draft, then publish.
  const run = randomBytes(3).toString("hex");
  await page.goto("/admin/sites/new");
  await expect(async () => {
    await page.getByLabel("Website name").fill(`Quotes ${run}`);
    await expect(page.getByLabel("Identifier")).not.toHaveValue("", { timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: "Create draft website" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Quotes ${run}`);
  await page.goto(`${new URL(page.url()).pathname}/results`);
  await page.getByRole("tab", { name: "Testimonials" }).click();
  await expect(page.getByText(/Nothing to preview until testimonials are published/)).toBeVisible();
  await page.getByLabel("Layout", { exact: true }).selectOption("carousel");
  await page.getByLabel("Spacing", { exact: true }).selectOption("standard");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Testimonials" }).click();
  await expect(page.getByLabel("Layout", { exact: true })).toHaveValue("carousel");
  await expect(page.getByLabel("Spacing", { exact: true })).toHaveValue("standard");
});
