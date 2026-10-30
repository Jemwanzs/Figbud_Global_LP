import { expect, test } from "@playwright/test";

// Homepage hero ecosystem: product nodes show published logos (Admin →
// Websites → Branding, via e2e/mock-api.mjs), link to configured destinations
// and describe each product on hover, focus or first tap.

const hero = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: /The FigBud ecosystem/ });

test("nodes show the published logos and link to configured destinations", async ({ page }) => {
  await page.goto("/en");
  const visual = hero(page);
  await expect(visual.getByRole("img", { name: "FigBud Global" })).toBeVisible();

  const zirahr = visual.getByRole("link", { name: /ZiraHR/ });
  await expect(zirahr).toHaveAttribute("href", "/en/products#zirahr");
  await expect(zirahr.locator('img[src^="/brand/assets/"]')).toBeVisible();

  const jasiri = visual.getByRole("link", { name: /Jasiri LMS/ });
  await expect(jasiri.getByRole("img", { name: "Jasiri LMS" }).first()).toBeVisible();

  // Coming soon: the approved symbol (30 Oct 2026) and the waitlist.
  const expense = visual.getByRole("link", { name: /Expense Now/ });
  await expect(expense).toHaveAttribute("href", "/en/contact?kind=waitlist&product=expense_now");
  // Symbols for dark and light backgrounds; the theme shows one.
  await expect(expense.locator('img[src^="/brand/assets/"]').filter({ visible: true })).toHaveCount(1);
  await expect(expense).toContainText("Coming soon");

  // No research reference sites anywhere in the hero.
  expect(await visual.locator('a[href*="zirahrapp"], a[href*="figbudglobal.online"]').count()).toBe(0);
});

test("descriptions appear on hover and keyboard focus", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover and keyboard are desktop interactions");
  await page.goto("/en");
  const visual = hero(page);
  const tooltip = visual.getByRole("tooltip").filter({ hasText: "Workforce operations" });
  await expect(tooltip).toBeHidden();
  await visual.getByRole("link", { name: /ZiraHR/ }).hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Explore ZiraHR");

  await page.mouse.move(0, 0);
  await visual.getByRole("link", { name: /Expense Now/ }).focus();
  const waitlist = visual.getByRole("tooltip").filter({ hasText: "Join the waitlist" });
  await expect(waitlist).toBeVisible();
  await expect(visual.getByRole("link", { name: /Expense Now/ })).toHaveAccessibleDescription(
    /Expense controls/,
  );
});

test("on touch screens the first tap describes, the second opens", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch behaviour");
  await page.goto("/en");
  const visual = hero(page);
  const node = visual.getByRole("link", { name: /Expense Now/ });
  await node.scrollIntoViewIfNeeded();
  await node.tap();
  await expect(visual.getByRole("tooltip").filter({ hasText: "Join the waitlist" })).toBeVisible();
  await expect(page).toHaveURL(/\/en$/);
  // Headless WebKit (iPhone project) stops producing animation frames while the
  // card overlaps the animated orbit, so Playwright never sees the node as
  // "stable"; the tap itself works, so skip that wait.
  await node.tap({ force: true });
  await expect(page).toHaveURL(/kind=waitlist&product=expense_now/);
});

test("the hero fits small screens without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/en");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of [/ZiraHR/, /Jasiri LMS/, /Expense Now/]) {
    const box = await hero(page).getByRole("link", { name }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  }
});

test("Ziwa LMS appears across the corporate site as coming soon", async ({ page }) => {
  await page.goto("/en");
  const node = hero(page).getByRole("link", { name: /Ziwa LMS/ });
  await expect(node).toHaveAttribute("href", "/en/contact?kind=waitlist&product=ziwa");
  await expect(node).toContainText("Coming soon");
  // The final Ziwa LMS symbol (29 Oct 2026), from its published brand.
  await expect(node.locator('img[src^="/brand/assets/"]').filter({ visible: true }).first()).toBeVisible();

  await page.goto("/en/products");
  const card = page.locator("#ziwa");
  // The heading is the approved logo, named for screen readers.
  await expect(card.getByRole("heading", { level: 2 })).toHaveAccessibleName("Ziwa LMS");
  await expect(
    card
      .getByRole("heading", { level: 2 })
      .locator('img[src^="/brand/assets/"]')
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(card).toContainText("Lending that flows with your business.");
  await expect(card.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute(
    "href",
    "/en/contact?kind=waitlist&product=ziwa",
  );
  // Jasiri keeps its own, different positioning.
  await expect(page.locator("#jasiri")).toContainText("Every loan. Every decision. Connected.");

  await page.goto("/en/contact?kind=waitlist&product=ziwa");
  await expect(page.getByLabel("Product")).toHaveValue("ziwa");
});
