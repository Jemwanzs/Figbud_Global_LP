import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// Africa expansion map: FigBud's origin and the product logos come from the
// website registry and brand profiles (e2e/mock-api.mjs).

const section = (page: Page) => page.locator("section[aria-labelledby=africa-title]");

test("Nairobi shows the FigBud origin, and every listed product links onwards", async ({
  page,
  isMobile,
}) => {
  await page.goto("/en");
  const africa = section(page);
  await africa.scrollIntoViewIfNeeded();
  await expect(africa).toContainText("FigBud Global");
  await expect(africa).toContainText("Nairobi, Kenya");
  // The routes stay labelled as illustrative.
  await expect(africa).toContainText(
    "Routes are illustrative of our expansion architecture, not current operations.",
  );

  const links = africa
    .getByRole("list", { name: "FigBud products" })
    .getByRole("link")
    .filter({ visible: true });
  await expect(links).toHaveCount(4);
  await expect(links.filter({ hasText: /ZiraHR/ })).toHaveAttribute("href", "/en/products#zirahr");
  await expect(links.filter({ hasText: /Ziwa LMS/ })).toHaveAttribute(
    "href",
    "/en/contact?kind=waitlist&product=ziwa",
  );
  await expect(links.filter({ hasText: /ZiraHR/ }).locator('img[src^="/brand/assets/"]')).toBeVisible();
  if (!isMobile) {
    await expect(africa).toContainText("Where our vision begins.");
  }
});

test("product logos describe themselves on hover and focus", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones show the products as a grid beneath the map");
  await page.goto("/en");
  const africa = section(page);
  await africa.scrollIntoViewIfNeeded();
  const links = africa
    .getByRole("list", { name: "FigBud products" })
    .getByRole("link")
    .filter({ visible: true });
  const card = africa
    .getByRole("tooltip")
    .filter({ hasText: "Spend smarter" })
    .or(africa.getByRole("tooltip").filter({ hasText: "Expense controls" }));
  await links.filter({ hasText: /Expense Now/ }).hover();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Join the waitlist");
  await page.mouse.move(0, 0);
  await links.filter({ hasText: /ZiraHR/ }).focus();
  await expect(africa.getByRole("tooltip").filter({ hasText: "Explore ZiraHR" })).toBeVisible();
});

test("the Africa map setting is managed in Admin → Websites", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "virtual authenticators are a Chromium DevTools feature");
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

  // A fresh website, so parallel runs never change what the public map shows.
  const run = randomBytes(3).toString("hex");
  await page.goto("/admin/sites/new");
  // Retry until hydrated, so the identifier suggestion follows the name.
  await expect(async () => {
    await page.getByLabel("Website name").fill(`Mapless ${run}`);
    await expect(page.getByLabel("Identifier")).not.toHaveValue("", { timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: "Create draft website" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Mapless ${run}`);

  const settings = page.getByRole("region", { name: "Settings" });
  const toggle = settings.getByLabel(/Show on the Africa expansion map/);
  const save = settings.getByRole("button", { name: "Save settings" });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(save).toBeEnabled();
  await toggle.check();
  await expect(save).toBeDisabled();
  await toggle.uncheck();
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();

  const sites = await (await page.request.get("/admin/api/sites")).json();
  expect(sites.find((s: { slug: string }) => s.slug === `mapless_${run}`).show_on_map).toBe(false);
});
