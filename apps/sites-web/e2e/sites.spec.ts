import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The product-site renderer (D16): websites, pages and brands from the
// registry, through the mock API (synthetic Ziwa LMS pages).

test("a published home page renders with the website's brand, navigation and call to action", async ({
  page,
}) => {
  const response = await page.goto("/ziwa");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Ziwa LMS — Lending that flows with your business");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every loan. A smoother journey.");
  await expect(page.locator("[data-product]").first()).toHaveAttribute("data-product", "ziwa");

  const nav = page.getByRole("navigation", { name: "Ziwa LMS navigation" });
  await expect(nav.getByRole("link", { name: "Platform" })).toHaveAttribute("href", "/ziwa/platform");
  // Coming soon: the call to action is the corporate waitlist for this product.
  await expect(page.getByRole("banner").getByRole("link", { name: "Join the waitlist" })).toHaveAttribute(
    "href",
    /\/en\/contact\?kind=waitlist&product=ziwa$/,
  );
  // Block links: site paths get the website prefix; /contact without a contact page goes to the enquiry form.
  await expect(page.getByRole("link", { name: "Explore Ziwa" })).toHaveAttribute("href", "/ziwa/platform");
  await expect(page.getByRole("main").getByRole("link", { name: "Request a demo" })).toHaveAttribute(
    "href",
    /\/en\/contact\?kind=waitlist&product=ziwa$/,
  );
  // Markdown arrives sanitised from the API.
  await page.getByText("Is Ziwa available today?").click();
  await expect(page.locator("strong", { hasText: "coming soon" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("Ziwa LMS is a FigBud Global platform.");
});

test("inner pages render, and unknown addresses are real 404s", async ({ page }) => {
  await page.goto("/ziwa/platform");
  await expect(page).toHaveTitle("Platform · Ziwa LMS");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One platform for lending operations");
  await expect(
    page.getByRole("navigation", { name: "Ziwa LMS navigation" }).getByRole("link", { name: "Platform" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("strong", { hasText: "one record" })).toBeVisible();

  expect((await page.goto("/ziwa/not-a-page"))?.status()).toBe(404);
  // Websites that aren't listed (drafts, unknown) have no pages here.
  expect((await page.goto("/not-a-website"))?.status()).toBe(404);
  expect((await page.goto("/figbud"))?.status()).toBe(404);
  expect((await page.goto("/~ziwa"))?.status()).toBe(404);
});

test("a listed website without a published home page shows an honest holding page", async ({ page }) => {
  const response = await page.goto("/expense_now");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Expense Now");
  await expect(page.getByText("Spend smarter. Move money better.").first()).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("not indexed outside production; the shared root goes to FigBud Global", async ({ page, request }) => {
  await page.goto("/ziwa");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/ziwa$/);
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers().location).toMatch(/^http:\/\/localhost:3000\/$/);
});

test("fits phones and is accessible", async ({ page }) => {
  await page.goto("/ziwa");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
});

test("the website's own favicons, touch icon and app manifest", async ({ page, request }) => {
  await page.goto("/ziwa");
  // The approved Ziwa LMS logo in the header.
  await expect(page.getByRole("banner").locator('img[src^="/brand/assets/"]').first()).toBeVisible();
  const icons = page.locator('link[rel="icon"]');
  await expect(icons.first()).toHaveAttribute("type", "image/svg+xml");
  for (const size of [16, 32, 48]) {
    await expect(page.locator(`link[rel="icon"][sizes="${size}x${size}"]`)).toHaveAttribute(
      "href",
      new RegExp(`^/brand/assets/[0-9a-f-]+[?]icon=${size}$`),
    );
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(apple).toMatch(/\?icon=180$/);
  expect((await request.get(apple!)).headers()["content-type"]).toBe("image/png");
  // Never another site's favicon.ico.
  await expect(page.locator('link[href="/favicon.ico"]')).toHaveCount(0);

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest?site=ziwa");
  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({ name: "Ziwa LMS", start_url: "/ziwa", theme_color: "#0b6edb" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
  expect((await request.get("/manifest.webmanifest?site=nope")).status()).toBe(404);
});
