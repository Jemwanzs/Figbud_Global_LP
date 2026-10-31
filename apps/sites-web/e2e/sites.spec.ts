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
  // Whichever of its two variants suits the theme in use.
  await expect(
    page.getByRole("banner").locator('img[src^="/brand/assets/"]').filter({ visible: true }).first(),
  ).toBeVisible();
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
  expect(manifest).toMatchObject({ name: "Ziwa LMS", start_url: "/ziwa", theme_color: "#fb7a1a" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
  expect((await request.get("/manifest.webmanifest?site=nope")).status()).toBe(404);
});

test("ZiraHR is served from the page imported into the Studio", async ({ page }) => {
  const response = await page.goto("/zirahr");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("People. Payroll. Progress. Connected.");
  await expect(page.locator("[data-product]").first()).toHaveAttribute("data-product", "zirahr");
  await expect(
    page.getByRole("heading", { name: "One platform for the whole employee journey" }),
  ).toBeVisible();
  // Active website: demo requests, through the corporate enquiry form.
  await expect(page.getByRole("banner").getByRole("link", { name: "Request a demo" })).toHaveAttribute(
    "href",
    /\/en\/contact\?kind=demo_request&product=zirahr$/,
  );
});

test("navigation and offline pages follow the Studio's visibility settings", async ({ page }) => {
  await page.goto("/ziwa");
  const nav = page.getByRole("navigation", { name: "Ziwa LMS navigation" });
  await expect(nav.getByRole("link", { name: "Platform" })).toBeVisible();
  // Left out of the navigation, still reachable at its address.
  await expect(nav.getByRole("link", { name: "Resources" })).toHaveCount(0);
  expect((await page.goto("/ziwa/resources"))?.status()).toBe(200);
  // Offline: not found, and never listed.
  expect((await page.goto("/ziwa/legacy"))?.status()).toBe(404);
});

test.describe("cookie consent", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("product websites ask once, link FigBud Global's policies and reopen from the footer", async ({
    page,
  }) => {
    await page.route("**/v1/privacy/consent", (route) => route.fulfill({ status: 204 }));
    await page.goto("/ziwa");
    const banner = page.getByRole("region", { name: "Cookie consent" });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      /\/en\/legal\/privacy$/,
    );
    await banner.getByRole("button", { name: "Reject optional" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(banner).toBeHidden();
    await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
    await expect(page.getByRole("dialog", { name: "Cookie preferences" })).toBeVisible();
  });
});

test("the Studio's menu, footer note and closed enquiries reach the website", async ({ page }) => {
  // Mock fixture: Jasiri LMS has its own menu and isn't taking enquiries.
  await page.goto("/jasiri");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Lending platform" })).toHaveAttribute(
    "href",
    "/jasiri/platform",
  );
  await expect(header.getByRole("link", { name: "FigBud Global" })).toHaveAttribute(
    "href",
    "https://figbud.example.com",
  );
  // No enquiry button while closed.
  await expect(
    header.getByRole("link", { name: /Request a demo|Join the waitlist|Request early access/ }),
  ).toHaveCount(0);
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("Lending software for African lenders.");
  await expect(footer.getByRole("link", { name: "Security" })).toHaveAttribute("href", "/jasiri/security");
  // Other websites keep their call to action.
  await page.goto("/ziwa");
  await expect(page.getByRole("banner").getByRole("link", { name: "Join the waitlist" })).toBeVisible();
});

test("sections styled in the Studio sit on the website's theme bands, in both themes", async ({ page }) => {
  // Mock fixture: Ziwa's feature grid is on its brand band; Ziwa's theme is brown and ivory.
  await page.goto("/ziwa");
  const band = page.locator('section[data-tone="brand"]');
  await expect(band).toHaveCSS("background-color", "rgb(78, 45, 23)");
  await expect(band.getByRole("heading", { name: "Built for the whole journey" })).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  // The brand band stays brown with white text in light mode.
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(band).toHaveCSS("background-color", "rgb(78, 45, 23)");
  await expect(band.getByRole("heading", { name: "Built for the whole journey" })).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  const results = await new AxeBuilder({ page })
    .include('section[data-tone="brand"]')
    .withTags(["wcag2aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("images from the media library render responsively with their alt text", async ({ page, request }) => {
  // Mock fixture: Ziwa's published Platform page has a library image.
  await page.goto("/ziwa/platform");
  const image = page.getByRole("img", { name: "The Ziwa LMS team planning a loan product" });
  await expect(image).toBeVisible();
  await expect(page.locator("figcaption")).toHaveText("Planning a loan product");
  const src = await image.getAttribute("src");
  expect(src).toMatch(/^\/media\/[0-9a-f-]{36}/);
  // Space is reserved before it loads, and it isn't loaded until needed.
  await expect(image).toHaveAttribute("width", /\d+/);
  await expect(image).toHaveAttribute("loading", "lazy");
  // Served from the website's own origin, locked down like logo files.
  const response = await request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["content-security-policy"]).toContain("sandbox");
  // Unknown or unpublished images aren't served.
  expect((await request.get("/media/00000000-0000-7000-8000-000000000000")).status()).toBe(404);
});

test("each website shares with a card generated from its brand", async ({ page, request }) => {
  await page.goto("/ziwa");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toMatch(/\/ziwa\/opengraph-image/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  const image = await request.get(new URL(og!).pathname);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  // A real 1200 × 630 PNG.
  const bytes = await image.body();
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});

test("a moved page's old address forwards permanently, and pages can share their own image", async ({
  page,
  request,
}) => {
  // Mock fixtures: /lending-platform was Ziwa's Platform page, which has its own sharing image.
  const moved = await request.get("/ziwa/lending-platform", { maxRedirects: 0 });
  expect(moved.status()).toBe(308);
  expect(moved.headers()["location"]).toBe("/ziwa/platform");
  await page.goto("/ziwa/lending-platform");
  await expect(page).toHaveURL(/\/ziwa\/platform$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One platform for lending operations");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toMatch(/\/media\/[0-9a-f-]{36}\?w=1440$/);
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "The Ziwa LMS team planning a loan product",
  );
  // Addresses that never existed are still real 404s.
  expect((await request.get("/ziwa/never-existed", { maxRedirects: 0 })).status()).toBe(404);
});

test("shared content from the library renders like any section, in the page's own style", async ({
  page,
}) => {
  // Mock fixture: Ziwa's Security page uses the published "Data promise" item on a soft band.
  await page.goto("/ziwa/security");
  const section = page.locator('section[data-tone="soft"]');
  await expect(section.getByRole("heading", { name: "Our data promise" })).toBeVisible();
  await expect(section.locator("strong", { hasText: "your" })).toBeVisible();
});

test("search identity and structured data from the Studio (SEO & search visibility)", async ({ page }) => {
  await page.goto("/zirahr");
  // Search Console verification tag set for ZiraHR in the Studio.
  await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute(
    "content",
    "mock-google-verification-1",
  );
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const data = blocks.flatMap((b) => {
    const parsed = JSON.parse(b) as Record<string, unknown> | Record<string, unknown>[];
    return Array.isArray(parsed) ? parsed : [parsed];
  });
  const app = data.find((d) => d["@type"] === "SoftwareApplication");
  expect(app).toMatchObject({
    name: "ZiraHR",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
  });
  expect(JSON.stringify(data)).not.toMatch(/aggregateRating|offers|review/);
  expect(data.some((d) => d["@type"] === "WebSite")).toBe(true);
  // Inner pages describe their place in the website.
  await page.goto("/ziwa/platform");
  const inner = (await page.locator('script[type="application/ld+json"]').allTextContents()).join(" ");
  expect(inner).toContain('"@type":"BreadcrumbList"');
});

test("pricing stays off the website until switched on: a request-a-quote page instead (P11)", async ({
  page,
}) => {
  await page.goto("/zirahr/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ZiraHR pricing");
  await expect(page.getByRole("link", { name: "Request a quote" })).toHaveAttribute(
    "href",
    /kind=demo_request|product=zirahr/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // No prices, cards or calculator while hidden.
  await expect(page.getByText(/KES/)).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: "Billing cycle" })).toHaveCount(0);
});
