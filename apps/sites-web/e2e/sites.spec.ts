import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { themeSettled } from "./theme-settled";

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
  await expect(page.getByRole("contentinfo")).toContainText("Ziwa LMS is a product of FigBud Global.");
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
  const results = await new AxeBuilder({ page: await themeSettled(page) })
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
  // Active website with its own enquiry form: demo requests stay on ZiraHR (owner, 6 Nov 2026).
  await expect(page.getByRole("banner").getByRole("link", { name: "Request a demo" })).toHaveAttribute(
    "href",
    "/zirahr/contact?kind=demo_request#enquire",
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

test.describe("ZiraHR footer (owner's brief, 7 Nov 2026)", () => {
  test("its own call to action, tagline and groups, named as a FigBud Global product", async ({ page }) => {
    await page.goto("/zirahr/about");
    const footer = page.getByRole("contentinfo");
    const cta = footer.locator("[data-footer-cta]");
    await expect(cta.getByRole("heading", { level: 2 })).toHaveText("Ready to make HR feel effortless?");
    await expect(cta).toContainText("Discover a smarter way to manage your people, payroll and workforce.");
    await expect(cta.getByRole("link", { name: "Book a Demo" })).toHaveAttribute(
      "href",
      "/zirahr/contact?kind=demo_request#enquire",
    );
    await expect(footer).toContainText("HR Simplified. Business Amplified.");
    await expect(footer).not.toContainText("One Vision. Endless Solutions.");
    for (const name of ["Platform", "Explore", "Company", "Legal & Support"])
      await expect(footer.locator(`[data-footer-column="${name}"]`)).toBeVisible();
    await expect(footer.getByRole("link", { name: "Referral programme" })).toHaveAttribute(
      "href",
      "/zirahr/refer",
    );
    await expect(footer).toContainText("ZiraHR is a product of FigBud Global.");
    // ZiraHR's own identity, never FigBud Global's logo.
    await expect(footer.getByRole("img", { name: "FigBud Global" })).toHaveCount(0);

    // Every link in the columns is distinct and leads to a live page. The payroll
    // calculator is published separately (its own tests switch it on and off).
    const hrefs = await footer
      .locator("nav a")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    expect(new Set(hrefs).size, "no link repeats").toBe(hrefs.length);
    for (const href of hrefs.filter((h) => h.startsWith("/zirahr") && !h.includes("payroll-calculator"))) {
      expect((await page.request.get(href.split("#")[0]!)).status(), href).toBeLessThan(400);
    }
    // Cookie settings open the existing preferences.
    await footer.getByRole("button", { name: "Cookie settings" }).click();
    await expect(page.getByRole("dialog", { name: "Cookie preferences" })).toBeVisible();
  });

  test("a page ending with its own call to action doesn't get a second one", async ({ page }) => {
    await page.goto("/zirahr");
    await expect(page.locator('main [data-section="call_to_action"]').last()).toBeVisible();
    await expect(page.locator("[data-footer-cta]")).toBeHidden();
  });

  test("readable in both themes, on the warm palette", async ({ page }) => {
    await page.goto("/zirahr/about");
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const results = await new AxeBuilder({ page: await themeSettled(page) })
        .include("footer")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${theme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    }
  });
});

test("product websites load the flag face for the phone picker (UI-MO9)", async ({ page }) => {
  await page.goto("/zirahr/contact");
  // Systems without flag emoji (Windows) showed letters such as "KE" instead of a flag.
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--font-flags").trim(),
    ),
  ).not.toBe("");
});

test.describe("cookie consent", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("product websites ask once, link FigBud Global's policies and reopen from the footer", async ({
    page,
  }) => {
    await page.route("**/v1/privacy/consent", (route) => route.fulfill({ status: 204 }));
    await page.goto("/ziwa");
    const banner = page.getByRole("dialog", { name: "Cookie consent" });
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
  const results = await new AxeBuilder({ page: await themeSettled(page) })
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

test("a product website shows its own hover previews, never FigBud Global's wording", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "hover needs a mouse");
  await page.goto("/ziwa");
  const nav = page.getByRole("navigation", { name: "Ziwa LMS navigation" });
  const platform = nav.getByRole("link", { name: "Platform" });
  await expect(platform).toHaveAttribute("aria-describedby", /.+/, { timeout: 20_000 });
  await platform.hover();
  const card = page.locator('[role="tooltip"]:visible');
  await expect(card).toContainText("One platform for lending operations.");
  const theme = await page.locator("html").getAttribute("data-theme");
  await expect(card.locator("[data-inverse]")).toHaveAttribute(
    "data-theme",
    theme === "dark" ? "light" : "dark",
  );
  await expect(page.locator("body")).not.toContainText("Where ideas become impact.");
  // Links it hasn't written a preview for simply have none.
  const others = nav.getByRole("link").filter({ hasNotText: "Platform" });
  if (await others.count()) await expect(others.first()).not.toHaveAttribute("aria-describedby", /.+/);
  await platform.click();
  await expect(page).toHaveURL(/\/ziwa\/platform$/);
});

/**
 * Scrolls a pinned section (story or module showcase) to a fraction of its
 * pinned stretch, from its own geometry: where the panel rests (`--story-top`)
 * and the spacer it's pinned over (`[data-runway]`).
 */
const scrollToFraction = (el: Element, fraction: number) => {
  const section = el as HTMLElement;
  const header = document.querySelector("header")!.offsetHeight;
  const pin = (section.firstElementChild as HTMLElement).offsetHeight;
  const top = Math.max(header, Math.round((innerHeight + header - pin) / 2));
  const travel = section.querySelector<HTMLElement>("[data-runway]")!.offsetHeight;
  window.scrollTo({
    top: section.getBoundingClientRect().top + window.scrollY - top + travel * fraction,
    behavior: "instant",
  });
};

/** Accessibility violations on the page, by rule and element. */
const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page: await themeSettled(page) })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test("ZiraHR's demo call opens the same enquiry form on ZiraHR, without leaving it", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  await page.route("**/v1/enquiries", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { reference: "ZR-DEMO-0001", status: "received" } });
  });
  await page.goto("/zirahr");
  const origin = new URL(page.url()).origin;
  await page
    .getByRole("banner")
    .getByRole("link", { name: /Request a demo/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`^${origin}/zirahr/contact\\?kind=demo_request#enquire$`));
  const form = page.locator("#enquire form");
  await expect(form).toBeVisible();
  // The product is ZiraHR, fixed: no product choice to make.
  await expect(form.getByLabel("Product")).toHaveCount(0);
  await expect(form.getByRole("radio", { name: "Request a demo" })).toBeChecked();
  expect(await axe(page)).toEqual([]);

  await expect(async () => {
    await form.getByLabel("Full name").fill("Amina Wanjiru");
    await expect(form.getByLabel("Full name")).toHaveValue("Amina Wanjiru", { timeout: 1_000 });
  }).toPass();
  await form.getByLabel("Work email").fill("amina@mfano.co.ke");
  await form.getByLabel("Company or organisation").fill("Mfano Ltd");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Thank you. We've received your enquiry.")).toBeVisible();
  await expect(page.getByText("ZR-DEMO-0001")).toBeVisible();
  expect(sent).toMatchObject({ kind: "demo_request", product: "zirahr", source_path: "/zirahr/contact" });
  expect(new URL(page.url()).origin).toBe(origin);
});

test("a website that isn't launched shows a branded Coming Soon page with a working waitlist", async ({
  page,
}) => {
  await page.goto("/expense_now");
  const main = page.getByRole("main");
  await expect(main.getByText("Coming soon", { exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Expense Now");
  // No feature claims: only what the registry approves, and a way to wait for it.
  const form = main.getByRole("form", { name: "Join the waitlist" });
  await expect(form).toBeVisible();
  await expect(main.getByRole("link", { name: /Explore the FigBud Global ecosystem/ })).toHaveAttribute(
    "href",
    /\/en\/products$/,
  );
  expect(await axe(page)).toEqual([]);

  await expect(async () => {
    await form.getByRole("button", { name: "Join the waitlist" }).click();
    await expect(form.getByRole("alert")).toContainText("highlighted", { timeout: 2_000 });
  }).toPass();
  await expect(page.getByText("You're on the list")).toHaveCount(0);
  await form.getByLabel("Your name").fill("Amina Wanjiru");
  await form.getByLabel("Work email").fill("amina@example.co.ke");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByText("You're on the list")).toBeVisible();
  await expect(page.getByText("WL-TEST-0001")).toBeVisible();

  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  expect(await axe(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // A launched website without pages keeps its plain holding page, and nobody can join a waitlist for it.
  const response = await page.request.post("/jasiri/waitlist-submit", { data: {} });
  expect(response.status()).toBe(404);
});

test.describe("ZiraHR: payroll calculator and demonstrations (P14)", () => {
  test.describe.configure({ mode: "serial" });
  const API = "http://localhost:3199";
  const scan = async (page: Page) =>
    (
      await new AxeBuilder({ page: await themeSettled(page) })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

  test("the calculator doesn't exist until it's published and switched on", async ({ page, request }) => {
    // Other tests in this run may have switched it on: the mock has no way back, so this only runs first.
    const state = await (await request.get(`${API}/v1/sites/zirahr/payroll-calculator`)).json();
    test.skip(state.calculator !== null, "already switched on by an earlier project");
    expect((await page.goto("/zirahr/payroll-calculator"))?.status()).toBe(404);
  });

  test("both directions, from the API, reconciled; errors clear the figures", async ({ page, request }) => {
    test.setTimeout(90_000);
    await request.get(`${API}/v1/__test/payroll-on`);
    await expect
      .poll(async () => (await page.goto("/zirahr/payroll-calculator"))?.status(), {
        timeout: 70_000,
        intervals: [3000],
      })
      .toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Know the numbers before payday.");
    await expect(page.getByTestId("payroll-disclaimer")).toContainText("Estimate only");

    const answer = page.getByTestId("payroll-answer");
    const amount = page.getByLabel("Gross monthly pay (KES)");
    await expect(amount).toHaveValue("100000");
    await amount.fill("150000");
    await expect(answer).toContainText("103,618.15", { timeout: 15_000 });
    const calculator = page.getByTestId("payroll-calculator");
    for (const text of [
      "NSSF Tier I",
      "NSSF Tier II",
      "SHIF",
      "Affordable Housing Levy",
      "Taxable pay",
      "Tax before relief",
      "Personal relief",
    ])
      await expect(calculator.getByText(text, { exact: true }).first()).toBeVisible();
    await expect(calculator).toContainText("137,145.00");
    await expect(calculator).toContainText("33,526.85");
    await expect(page.getByTestId("payroll-rules")).toContainText("2026-02-01");

    // Employer cost is separate, and never in take-home pay.
    await page.getByText("What the employer pays").click();
    await expect(page.getByTestId("payroll-employer")).toContainText("NITA levy");

    // A bad amount removes the figures rather than leaving stale ones.
    await amount.fill("abc");
    await expect(calculator).toContainText("Use digits only");
    await expect(answer).toHaveCount(0);
    await amount.fill("150000");
    await expect(answer).toContainText("103,618.15");

    // Net to gross, with the forward check shown.
    await page.getByRole("radio", { name: "Net to gross" }).click();
    await page.getByLabel("Net monthly pay you want (KES)").fill("103618.15");
    await expect(answer).toContainText("150,000.00");
    await expect(page.getByTestId("payroll-proof")).toContainText("Checked forward");

    // The pay month changes the rules, and the answer.
    await page.getByRole("radio", { name: "Gross to net" }).click();
    await page.getByText("More options").click();
    await page.getByLabel("Pay month").fill("2026-01");
    await expect(page.getByTestId("payroll-rules")).toContainText("2025-02-01");
    await expect(answer).toContainText("105,130.15");
    await page.getByLabel("Pay month").fill("2020-01");
    await expect(calculator).toContainText("There are no rules for that month");
    await expect(answer).toHaveCount(0);
    await page.getByLabel("Pay month").fill("");

    await expect(answer).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await scan(page)).toEqual([]);
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    expect(await scan(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test("scroll stories follow normal scrolling, read without the visual and don't overflow", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/zirahr/platform");
    const story = page.locator('[data-story="scattered-to-connected"]');
    const steps = story.locator("[data-story-step]");
    await expect(steps).toHaveCount(4);
    // Right under its heading and introduction: no blank band before the panel.
    const lead = page.locator("section").filter({ has: story }).locator("p").first();
    const leadBox = (await lead.boundingBox())!;
    expect((await story.boundingBox())!.y - (leadBox.y + leadBox.height)).toBeLessThanOrEqual(64);
    // All the words are there at once, in order, whatever the visual is doing.
    await expect(steps.nth(3)).toContainText("So the work moves by itself.");
    await expect(story.locator('[aria-hidden="true"]').first()).toBeAttached();

    // Compact (owner's brief, 7 Nov 2026): one screen to settle, about a third of a screen per further step.
    const viewport = page.viewportSize()!.height;
    expect((await story.boundingBox())!.height).toBeLessThanOrEqual(viewport * (1 + 3 * 0.34) + 2);

    // Scrolling moves the words and the visual on together, step by step, and back again.
    const dot = (i: number) => story.getByRole("button", { name: new RegExp(`^Step ${i + 1}:`) });
    const scrollTo = (fraction: number) => story.evaluate(scrollToFraction, fraction);
    for (const [fraction, i] of [
      [0.1, 0],
      [0.35, 1],
      [0.6, 2],
      [0.9, 3],
      [0.35, 1],
      [0.1, 0],
    ] as const) {
      await scrollTo(fraction);
      await expect(story).toHaveAttribute("data-step", String(i));
      await expect(steps.nth(i)).toHaveAttribute("data-place", "current");
      await expect(dot(i)).toHaveAttribute("aria-current", "step");
      await expect(story).toContainText(`0${i + 1} / 04`);
    }
    // The dots jump to a step.
    await dot(3).click();
    await expect(story).toHaveAttribute("data-step", "3");
    expect(
      Number(await story.evaluate((el) => el.style.getPropertyValue("--story-progress"))),
    ).toBeGreaterThan(0.5);
    // The visual stays in view while the steps go past.
    const stage = story.locator(".fb-story-stage");
    await expect(stage).toBeInViewport();
    // Clear of the website's header, which is taller on phones.
    const headerBottom = (await page.getByRole("banner").boundingBox())!;
    expect((await stage.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom.y + headerBottom.height);
    // The pay run moves on by itself once it's reached, and stops at Locked.
    await expect(stage.getByText("Locked", { exact: true })).toBeVisible();
    await expect(stage.locator("li.bg-product")).toHaveCount(4, { timeout: 10_000 });
    // The trail's last entry has finished fading in before contrast is checked.
    const lastEntry = stage.locator('.fb-story-rise[data-open="true"]').last();
    await expect.poll(() => lastEntry.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

    const journey = page.locator('[data-story="employee-journey"]');
    await journey.scrollIntoViewIfNeeded();
    await journey.getByRole("button", { name: /^Step 4:/ }).click();
    await expect(journey).toHaveAttribute("data-step", "3");
    await expect(journey.locator('[data-place="now"]')).toContainText("103,618.15");

    expect(await scan(page)).toEqual([]);
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    expect(await scan(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test("contrasting bands and their stages flip with the theme, without moving the page", async ({
    page,
  }) => {
    await page.goto("/zirahr/platform");
    const band = page.locator('section[data-tone="inverse"]').first();
    const stage = band.locator(".fb-demo-stage, [data-tone='inverse']").first();
    // The band paints its colour from a layer behind it; a stage paints its own.
    const background = (el: typeof band) =>
      el.evaluate((node) => {
        const own = getComputedStyle(node).backgroundColor;
        return own === "rgba(0, 0, 0, 0)" ? getComputedStyle(node, "::before").backgroundColor : own;
      });
    const lightness = (rgb: string) => {
      const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
      return (r! + g! + b!) / 3;
    };
    await band.scrollIntoViewIfNeeded();
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    const pageIsDark = theme !== "light";
    // On a dark page the band is light and its stage dark; the opposite on a light page.
    expect(lightness(await background(band)) > 128).toBe(pageIsDark);
    expect(lightness(await background(stage)) > 128).toBe(!pageIsDark);

    const y = await page.evaluate(() => window.scrollY);
    // Clicked from inside the page, as a visitor's click is: Playwright's own click
    // scrolls its target into view first, which isn't what's being measured.
    await page
      .getByRole("button", { name: /Switch to (light|dark) theme/ })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.locator("html")).toHaveAttribute("data-theme", pageIsDark ? "light" : "dark");
    // Colours ease over one shared clock, then the temporary rule is gone.
    await expect
      .poll(async () => lightness(await background(band)) > 128, { timeout: 2_000 })
      .toBe(!pageIsDark);
    expect(lightness(await background(stage)) > 128).toBe(pageIsDark);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThanOrEqual(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.head.querySelectorAll("style")].some((s) =>
            s.textContent?.includes("transition-property:color"),
          ),
        ),
      )
      .toBe(false);
    expect(await scan(page)).toEqual([]);
  });

  test("with reduced motion, a story's states change without any transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/zirahr/platform");
    const story = page.locator('[data-story="scattered-to-connected"]');
    await story.scrollIntoViewIfNeeded();
    await story.getByRole("button", { name: /^Step 3:/ }).click();
    await expect(story).toHaveAttribute("data-step", "2");
    // The words change without moving, too.
    expect(
      await story.locator('[data-story-step="2"]').evaluate((el) => getComputedStyle(el).transitionProperty),
    ).toBe("none");
    const duration = await story
      .locator(".fb-story-unfold")
      .evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(duration).toBe("none");
    await expect(story.locator('.fb-story-unfold[data-open="true"]')).toBeVisible();
  });

  test("the attendance demonstration: location check, late arrival and overtime approval (P4-Z5)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/zirahr/platform");
    const day = page.getByTestId("attendance-day");
    const week = page.getByTestId("attendance-week");
    const today = page.getByTestId("attendance-today");
    await day.scrollIntoViewIfNeeded();
    // Mon 8h + Tue 8h + Wed 7h 30m, then today's 8h on time.
    await expect(day).toContainText("Location check: inside the branch's area.");
    await expect(week).toHaveText("31h 30m");

    await page.getByRole("group", { name: "Clock-in" }).getByRole("button", { name: "Late" }).click();
    await expect(day).toContainText("41 minutes late");
    await expect(today).toContainText("7h 21m");

    // Away from the branch: the day waits for the supervisor, then counts.
    await page
      .getByRole("group", { name: "Clock-in" })
      .getByRole("button", { name: "Away from the branch" })
      .click();
    await expect(today).toContainText("Pending");
    await page.getByRole("button", { name: "Approve as supervisor" }).click();
    await expect(day).toContainText("approved by the supervisor");
    await expect(today).toContainText("7h 57m");

    // A late finish: overtime reaches payroll only once approved.
    await page.getByRole("group", { name: "Clock-in" }).getByRole("button", { name: "On time" }).click();
    await page
      .getByRole("group", { name: "Clock-out" })
      .getByRole("button", { name: "After a late finish" })
      .click();
    await expect(day).toContainText("2h overtime: waiting for the supervisor");
    await expect(week).toHaveText("31h 30m");
    await page.getByRole("button", { name: "Approve overtime" }).click();
    await expect(day).toContainText("sent to the November pay run");
    await expect(week).toHaveText("33h 30m");
    await expect(
      page.getByText("Location checks apply where your organisation turns them on."),
    ).toBeVisible();
  });

  test("demonstrations show themselves, hold a visitor's choice, pause and replay (auto-demo engine)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/zirahr/platform");
    const slip = page.locator("[data-demo]").filter({ has: page.locator("#demo-slip-gross") });
    const tab = (key: string) => page.locator(`#demo-slip-${key}`);
    await slip.scrollIntoViewIfNeeded();
    // It starts by itself once in view, and moves from gross pay to PAYE with its working.
    await expect(slip).toHaveAttribute("data-demo", "playing", { timeout: 5_000 });
    await expect(tab("paye")).toHaveAttribute("aria-selected", "true", { timeout: 6_000 });
    await expect(page.locator("#demo-slip-panel")).toContainText("How PAYE was worked out");
    await expect(tab("nssf")).toHaveAttribute("aria-selected", "true", { timeout: 8_000 });

    // A choice by hand holds; the demonstration doesn't fight it.
    await tab("shif").click();
    await expect(slip).toHaveAttribute("data-demo", "manual");
    await page.waitForTimeout(4_000);
    await expect(tab("shif")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#demo-slip-panel")).toContainText("150,000.00 at 2.75%");

    // Pause stops it; play carries on.
    await slip.getByRole("button", { name: "Pause demonstration" }).click();
    await expect(slip).toHaveAttribute("data-demo", "paused");
    await page.waitForTimeout(3_500);
    await expect(tab("shif")).toHaveAttribute("aria-selected", "true");
    await slip.getByRole("button", { name: "Play demonstration" }).click();
    // On a phone, the tap leaves most of the payslip below the screen, where it rightly waits.
    await slip.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect(tab("ahl")).toHaveAttribute("aria-selected", "true", { timeout: 6_000 });
    await expect(tab("net")).toHaveAttribute("aria-selected", "true", { timeout: 6_000 });
    await expect(page.locator("#demo-slip-panel")).toContainText("103,618.15");

    // Off screen, it pauses.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(slip).toHaveAttribute("data-demo", "paused", { timeout: 3_000 });

    // Keyboard focus inside holds it still, so nothing changes under a keyboard user.
    await slip.scrollIntoViewIfNeeded();
    await tab("gross").focus();
    await page.keyboard.press("ArrowDown");
    await expect(tab("paye")).toBeFocused();
    await page.waitForTimeout(13_000);
    await expect(tab("paye")).toHaveAttribute("aria-selected", "true");
  });

  test("with reduced motion, nothing plays by itself and there's nothing to pause", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/zirahr/platform");
    await page.locator("#demo-slip-gross").scrollIntoViewIfNeeded();
    await page.waitForTimeout(3_000);
    await expect(page.locator("#demo-slip-gross")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-demo="playing"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Pause demonstration/ })).toHaveCount(0);
  });

  test("the eight modules: pinned, every module in turn by scrolling, then released (and back)", async ({
    page,
  }) => {
    await page.goto("/zirahr/platform");
    const showcase = page.locator("[data-modules]");
    const pin = showcase.locator(".fb-modules-pin");
    // Right under its heading and introduction: no blank band before the showcase.
    const intro = page.locator("section").filter({ has: showcase }).locator("p").first();
    const gap =
      (await pin.boundingBox())!.y - ((await intro.boundingBox())!.y + (await intro.boundingBox())!.height);
    expect(gap).toBeLessThanOrEqual(64);
    const viewport = page.viewportSize()!.height;
    // About a fifth of a screen per module after the first, no more.
    expect((await showcase.boundingBox())!.height).toBeLessThanOrEqual(viewport * (1 + 7 * 0.22) + 2);
    const at = (fraction: number) => showcase.evaluate(scrollToFraction, fraction);
    const tabs = showcase.getByRole("tab");
    // Measured once the page is interactive (the first module is also the starting state).
    await at(0.05);
    await expect
      .poll(() => showcase.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--story-top")))
      .not.toBe("");
    for (let i = 0; i < 8; i++) {
      await at((i + 0.5) / 8);
      await expect(showcase).toHaveAttribute("data-step", String(i));
      await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
      await expect(showcase).toContainText(`0${i + 1} / 08`);
      // Pinned below the header the whole way.
      const header = (await page.getByRole("banner").boundingBox())!;
      expect(Math.round((await pin.boundingBox())!.y)).toBeGreaterThanOrEqual(
        Math.floor(header.y + header.height) - 1,
      );
    }
    // Released after the eighth: scrolling on moves it away.
    await at(1.4);
    await expect(showcase).toHaveAttribute("data-step", "7");
    expect((await pin.boundingBox())!.y).toBeLessThan(0);
    // Back up, it reverses through the modules.
    await at((5 + 0.5) / 8);
    await expect(showcase).toHaveAttribute("data-step", "5");
    await at(0.02);
    await expect(showcase).toHaveAttribute("data-step", "0");

    // Choosing a module scrolls to it; "Skip the modules" leaves the sequence.
    await tabs.nth(4).click();
    await expect(showcase).toHaveAttribute("data-step", "4");
    await expect(showcase).toContainText("Performance");
    await showcase.getByRole("button", { name: "Skip the modules" }).click();
    await expect.poll(async () => (await pin.boundingBox())!.y, { timeout: 5_000 }).toBeLessThan(0);
    expect(await scan(page)).toEqual([]);
  });

  test("the leave, calendar and outputs demonstrations work, by keyboard too", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/zirahr/platform");

    // Approving each step updates the balance, only at the end. (With reduced motion
    // nothing plays by itself: it rests on the walkthrough's first state, single stage.)
    const balance = page.getByTestId("leave-balance");
    await expect(balance).toHaveText("14");
    await page.getByRole("button", { name: "Multi-stage" }).click();
    await expect(balance).toHaveText("14");
    await page.getByRole("button", { name: "Approve as Line manager" }).click();
    await expect(balance).toHaveText("14");
    await page.getByRole("button", { name: "Approve as HR" }).click();
    await expect(balance).toContainText("11");
    await expect(page.getByText("Approved. Balance updated.")).toBeVisible();
    await page.getByRole("button", { name: "Single stage" }).click();
    await expect(balance).toHaveText("14");
    await page.getByRole("button", { name: "Approve as Line manager" }).click();
    await expect(balance).toContainText("11");

    // The calendar: weekends and public holidays aren't counted (December 2026).
    const people = page.getByRole("tablist", { name: "Team members" }).getByRole("tab");
    await expect(page.getByTestId("calendar-summary")).toContainText("Wanjiru K.: 8 days counted");
    await people.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(people.nth(1)).toBeFocused();
    await expect(page.getByTestId("calendar-summary")).toContainText("Otieno P.: 5 days counted");
    await expect(page.getByTestId("calendar-summary")).toContainText("Overlaps with Mutua J.");

    await expect(page.getByRole("heading", { name: "Annual P9 forms" })).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test("refer and earn: mistakes are shown, and success only after the server accepts", async ({ page }) => {
    await page.goto("/zirahr/refer");
    const form = page.getByRole("main").locator("form");
    await expect(page.getByRole("main").locator('a[href^="tel:"]')).toHaveCount(0);
    expect(await scan(page)).toEqual([]);
    await expect(async () => {
      await form.getByRole("button", { name: "Submit referral" }).click();
      await expect(form.getByRole("alert")).toContainText("highlighted", { timeout: 2_000 });
    }).toPass();
    await expect(form.getByText("Enter the business's name.")).toBeVisible();
    await expect(page.getByText("Thanks for the introduction")).toHaveCount(0);

    await form.getByLabel("Business name").fill("Mfano Ltd");
    await form.getByLabel("Contact person").fill("Baraka Otieno");
    await form.getByLabel("Their email").fill("baraka@example.co.ke");
    await form.getByLabel("Your name").fill("Amina Wanjiru");
    await form.getByLabel("Your email").fill("amina@example.co.ke");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Submit referral" }).click();
    await expect(page.getByText("Thanks for the introduction")).toBeVisible();
    await expect(page.getByText("ZR-TEST-0001")).toBeVisible();
    await expect(page.getByText("You earn once the deal has closed.")).toBeVisible();
  });

  test("the platform page: modules and demonstrations work by mouse and keyboard, in both themes", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/zirahr/platform");

    // Modules: one open at a time, every module's words in the page, planned ones labelled.
    const tabs = page.getByRole("tablist", { name: "Modules" }).getByRole("tab");
    await expect(
      page.getByRole("tabpanel").filter({ hasText: "Payroll day, minus the drama." }),
    ).toBeVisible();
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toContainText("Planned");
    await expect(page.getByRole("tabpanel").filter({ hasText: "This module is planned." })).toBeVisible();

    // The module ring moves by keyboard.
    const ring = page.getByRole("tablist", { name: "Platform modules" }).getByRole("tab");
    await expect(ring).toHaveCount(8);
    await ring.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(ring.nth(1)).toBeFocused();
    // The approved order (owner's brief, 8 Nov 2026): Core HR, then Payroll.
    await expect(page.locator("#demo-module-panel")).toContainText("Payroll");

    // Stages, payslip lines and self-service screens.
    await page
      .getByRole("tablist", { name: "Payroll stages" })
      .getByRole("tab", { name: /Approve/ })
      .click();
    await expect(page.locator("#demo-run-panel")).toContainText("Your approvers sign off");
    await page.getByRole("tab", { name: /NSSF/ }).click();
    await expect(page.locator("#demo-slip-panel")).toContainText("Tier II: 99,000.00 at 6%");
    await page
      .getByRole("tablist", { name: "Employee self-service" })
      .getByRole("tab", { name: "Leave" })
      .click();
    await expect(page.locator("#demo-ess-panel")).toContainText("Annual leave balance");

    // Sample data is always labelled.
    await expect(page.getByText("Illustrative product activity · synthetic data").first()).toBeVisible();
    await expect(page.getByText(/Illustrative figures for a sample monthly pay/)).toBeVisible();

    expect(await scan(page)).toEqual([]);
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    expect(await scan(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });
});

test.describe("ZiraHR hero: all eight modules and self-service (owner's brief, 8 Nov 2026)", () => {
  test("every module takes its turn by itself, five at a time, and can be chosen or paused", async ({
    page,
  }) => {
    await page.goto("/zirahr/platform");
    const hero = page.locator("[data-hero-modules]");
    await expect(hero).toHaveAttribute("data-hero-modules", "8");
    const cards = hero.locator("[data-module]");
    await expect(cards).toHaveCount(8);
    // Five places on the line on wide screens (three on phones), never all eight squeezed in.
    const places = page.viewportSize()!.width < 640 ? 3 : 5;
    await expect(hero.locator("[data-module][data-shown]")).toHaveCount(places);
    // Moves on without a click, once it's on screen (below the words on phones).
    await hero.scrollIntoViewIfNeeded();
    const first = await hero.getAttribute("data-current");
    await expect(hero).not.toHaveAttribute("data-current", first!, { timeout: 8_000 });
    // Every module can be shown: the dot names it, and its card comes onto the line, lit.
    for (const [i, name] of ["Core HR & Employee 360", "Recruitment", "Learning & Development"].entries()) {
      const dot = page.getByRole("button", { name: `Show ${name}` });
      await dot.click();
      await expect(dot).toHaveAttribute("aria-pressed", "true");
      const key = ["core_hr", "recruitment", "learning"][i]!;
      await expect(hero.locator(`[data-module="${key}"]`)).toHaveAttribute("data-shown");
      await expect(hero.locator(`[data-module="${key}"] [data-on]`)).toHaveCount(1);
    }
    // Pause holds it still.
    await page.getByRole("button", { name: "Show Payroll & Statutory Compliance" }).click();
    await expect(hero.getByRole("button", { name: "Pause demonstration" })).toBeVisible({ timeout: 15_000 });
    await hero.getByRole("button", { name: "Pause demonstration" }).click();
    const held = await hero.getAttribute("data-current");
    await page.waitForTimeout(3_500);
    await expect(hero).toHaveAttribute("data-current", held!);
    // Nothing spills sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test("Employee Self-Service is highlighted as a browser portal, never an app download", async ({
    page,
  }) => {
    await page.goto("/zirahr/platform");
    const ess = page.getByRole("complementary", { name: "Your team. Their HR. One simple portal." });
    await expect(ess).toBeVisible();
    await expect(ess.getByRole("list", { name: "Works in the browser on" })).toContainText("Phone browser");
    await expect(ess).not.toContainText(/app store|google play|download the app/i);
  });

  test("with reduced motion, the modules don't move by themselves, but the dots still choose", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/zirahr/platform");
    const hero = page.locator("[data-hero-modules]");
    await page.waitForTimeout(3_500);
    await expect(hero).toHaveAttribute("data-current", "0");
    await expect(hero.getByRole("button", { name: /Pause demonstration/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Show Teams & Collaboration" }).click();
    await expect(hero).toHaveAttribute("data-current", "5");
  });
});

test.describe("numbered storytelling (owner's brief, 8 Nov 2026)", () => {
  test("outlined numbers follow the scroll both ways; numbers and dots are decoration only", async ({
    page,
  }) => {
    await page.goto("/zirahr/platform");
    const story = page.locator("[data-numbered]");
    const rows = story.locator(".fb-numbered-row");
    await expect(rows).toHaveCount(6);
    await expect(story.locator(".fb-outline-num")).toHaveText(["01", "02", "03", "04", "05", "06"]);
    await expect(story.locator(".fb-outline-num").first()).toHaveAttribute("aria-hidden", "true");
    // The row nearest the middle of the screen is current, going down and coming back up.
    const centre = (i: number) =>
      rows.nth(i).evaluate((el) => {
        const box = el.getBoundingClientRect();
        window.scrollBy({ top: box.top + box.height / 2 - innerHeight / 2, behavior: "instant" });
      });
    for (const i of [0, 2, 4, 5, 3, 1]) {
      // Centred again until the page above has settled.
      await expect(async () => {
        await centre(i);
        await expect(rows.nth(i)).toHaveAttribute("data-current", { timeout: 1_000 });
      }).toPass();
      await expect(story.locator(".fb-numbered-row[data-current]")).toHaveCount(1);
    }
    // Words show once their row has been reached; nothing waits behind a scroll.
    await expect(rows.nth(5).locator("h3")).toBeVisible();
    // The dots never take a pointer (wide screens only).
    const dots = story.locator("svg.fb-dots");
    if (await dots.isVisible()) {
      expect(await dots.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
      await expect(dots).toHaveAttribute("aria-hidden", "true");
    }
    // Rows are as tall as their words: no tall blank containers.
    for (const i of [0, 5]) expect((await rows.nth(i).boundingBox())!.height).toBeLessThan(260);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test("readable in both themes, and switching keeps the current step", async ({ page }) => {
    await page.goto("/zirahr/platform");
    const story = page.locator("[data-numbered]");
    const row = story.locator(".fb-numbered-row").nth(2);
    await row.evaluate((el) => {
      const box = el.getBoundingClientRect();
      window.scrollBy({ top: box.top + box.height / 2 - innerHeight / 2, behavior: "instant" });
    });
    await expect(row).toHaveAttribute("data-current");
    const scan = async () =>
      (
        await new AxeBuilder({ page: await themeSettled(page) })
          .include("[data-numbered]")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations.map((v) => v.id);
    expect(await scan()).toEqual([]);
    // Clicked where it is: a pointer click would first scroll the header back into view on phones.
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).dispatchEvent("click");
    await expect(row).toHaveAttribute("data-current");
    expect(await scan()).toEqual([]);
  });
});
