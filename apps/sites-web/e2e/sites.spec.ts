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

test("a website's published Brand & Theme Studio colours apply to it alone, in both themes", async ({
  page,
}) => {
  // Expense Now has a published theme in the mock API; Ziwa LMS doesn't.
  await page.goto("/expense_now");
  await expect(page.locator("style[data-site-theme]")).toHaveCount(1);
  const bodyColours = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { bg: style.getPropertyValue("--bg").trim(), action: style.getPropertyValue("--action").trim() };
    });
  for (const [theme, bg] of [
    ["dark", "#1a1410"],
    ["light", "#fffaf3"],
  ] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await expect.poll(bodyColours).toEqual({ bg, action: "#ff7a00" });
  }
  await page.goto("/ziwa");
  // Ziwa's stylesheet carries only its section bands: none of Expense Now's colours.
  const ziwaCss = page.locator("style[data-site-theme]");
  await expect(ziwaCss).toHaveCount(1);
  expect(await ziwaCss.textContent()).not.toMatch(/--bg:|expense_now|#1a1410/);
  await expect.poll(bodyColours).not.toEqual(expect.objectContaining({ bg: "#1a1410" }));
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

test("major section headings carry the accent line; heroes and call-to-action panels don't (13 Nov 2026)", async ({
  page,
}) => {
  await page.goto("/zirahr/platform");
  // Measured together, so entrance animations can't move one between readings.
  const accents = await page.evaluate(() =>
    [...document.querySelectorAll("main [data-heading-accent]")].map((accent) => {
      const a = accent.getBoundingClientRect();
      const heading = accent.nextElementSibling!;
      const h = heading.getBoundingClientRect();
      return {
        tag: heading.tagName,
        width: a.width,
        height: a.height,
        gap: h.top - a.bottom,
        dx: h.left - a.left,
      };
    }),
  );
  expect(accents.length).toBeGreaterThan(2);
  for (const a of accents) {
    // 48 by 2 px, left-aligned with the heading right after it, 12–16 px above it.
    expect(a).toMatchObject({ tag: "H2", width: 48, height: 2 });
    expect(Math.abs(a.dx)).toBeLessThanOrEqual(1);
    expect(a.gap).toBeGreaterThanOrEqual(12);
    expect(a.gap).toBeLessThanOrEqual(16);
  }
  await expect(page.locator("main h1 ~ [data-heading-accent], main [data-heading-accent] + h1")).toHaveCount(
    0,
  );
  await expect(page.locator('main [data-section="call_to_action"] [data-heading-accent]')).toHaveCount(0);
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

  test("premium footer: accented column headings, floating dividers, link hover, and icons linked only when configured", async ({
    page,
    isMobile,
  }) => {
    // Owner's brief, 13 Nov 2026.
    await page.goto("/zirahr/about");
    const footer = page.getByRole("contentinfo");
    // Each column heading has its short accent line underneath.
    const accent = footer.locator('[data-footer-column="Platform"] h2 + span[aria-hidden]');
    const box = (await accent.boundingBox())!;
    expect(Math.round(box.width)).toBe(32);
    expect(Math.round(box.height)).toBe(2);
    // Floating dividers between columns on wide screens (part of the row, never full height); none on phones.
    const divider = await footer.locator('[data-footer-column="Explore"]').evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      return {
        content: before.content,
        height: parseFloat(before.height),
        column: el.getBoundingClientRect().height,
      };
    });
    if (isMobile) expect(["none", "normal"]).toContain(divider.content);
    else {
      expect(divider.content).not.toBe("none");
      expect(divider.height / divider.column).toBeGreaterThan(0.5);
      expect(divider.height / divider.column).toBeLessThan(0.7);
    }
    // Links turn to the accent with an underline on hover; the demo link carries a little more weight.
    const overview = footer.getByRole("link", { name: "Platform overview" });
    if (!isMobile) {
      await overview.hover();
      await expect
        .poll(() =>
          overview
            .locator("span")
            .first()
            .evaluate((el) => getComputedStyle(el).backgroundSize),
        )
        .toBe("100% 1px");
      expect(await overview.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
    }
    // ZiraHR lists no profiles yet: the common networks show, not linked, not focusable, no hand cursor.
    const icons = footer.getByRole("list", { name: "ZiraHR on social media" });
    for (const name of ["Facebook", "Instagram", "X", "LinkedIn"])
      await expect(icons.getByRole("img", { name, exact: true })).toBeVisible();
    await expect(icons.getByRole("link")).toHaveCount(0);
    expect(
      await icons
        .locator("[data-social] > span")
        .first()
        .evaluate((el) => getComputedStyle(el).cursor),
    ).toBe("default");
    // App store icons only when a website adds them (ZiraHR is browser-based).
    await expect(icons.getByRole("img", { name: /Google Play|App Store/ })).toHaveCount(0);

    // A configured profile is a safe external link; one without an address stays a mark.
    await page.goto("/ziwa");
    const ziwa = page.getByRole("contentinfo").getByRole("list", { name: /on social media$/ });
    const linkedin = ziwa.getByRole("link", { name: /LinkedIn/ });
    await expect(linkedin).toHaveAttribute("href", "https://www.linkedin.com/company/example");
    await expect(linkedin).toHaveAttribute("target", "_blank");
    await expect(linkedin).toHaveAttribute("rel", /noopener/);
    await expect(ziwa.getByRole("img", { name: "App Store" })).toBeVisible();
    await expect(ziwa.getByRole("img", { name: "Facebook" })).toHaveCount(0);
    const results = await new AxeBuilder({ page: await themeSettled(page) })
      .include("footer")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
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
  // Mock fixture: Ziwa's feature grid is on its brand band; Ziwa overrides its bands
  // with its brown and ivory (migration 40 kept them as overrides).
  await page.goto("/ziwa");
  const band = page.locator('section[data-tone="brand"]');
  const heading = band.getByRole("heading", { name: "Built for the whole journey" });
  await expect(band).toHaveCSS("background-color", "rgb(78, 45, 23)");
  // The band's contents take the dark mode's colours (its text, links and buttons).
  await expect(heading).toHaveCSS("color", "rgb(248, 250, 252)");
  // The brand band stays brown with the dark mode's text in light mode.
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(band).toHaveCSS("background-color", "rgb(78, 45, 23)");
  await expect(heading).toHaveCSS("color", "rgb(248, 250, 252)");
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .include('section[data-tone="brand"]')
    .withTags(["wcag2aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("ZiraHR's bands come from its palette in both modes, not a fixed colour (owner's brief, 13 Nov 2026)", async ({
  page,
}) => {
  await page.goto("/zirahr");
  const band = (name: string) =>
    page.evaluate((n) => getComputedStyle(document.body).getPropertyValue(n).trim(), name);
  // Brand band: the dark mode's cards and panels (Charcoal Mocha), whichever the mode.
  await expect.poll(() => band("--section-brand")).toBe("#38302d");
  await expect.poll(() => band("--section-brand-text")).toBe("#fff5e6");
  // Soft band: each mode's own deeper surface (cards and panels, 6 % towards the text).
  await expect.poll(() => band("--section-soft")).toBe("#443c38");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => band("--section-brand")).toBe("#38302d");
  await expect.poll(() => band("--section-soft")).toBe("#f2e9da");
});

test("product websites have the shared language selector, staying on the website (P7-L1)", async ({
  page,
}) => {
  await page.goto("/zirahr");
  const header = page.getByRole("banner");
  const selector = header.getByRole("button", { name: /^EN/ });
  await expect(selector).toBeVisible();
  await selector.click();
  // English only until reviewed translations of its pages exist; the link stays on ZiraHR.
  const options = header.getByRole("link", { name: /English/ });
  await expect(options).toHaveCount(1);
  await expect(options).toHaveAttribute("aria-current", "true");
  await expect(options).toHaveAttribute("href", "/zirahr");
  await expect(header.getByRole("link", { name: /Kiswahili|Français|العربية|中文/ })).toHaveCount(0);
  const results = await new AxeBuilder({ page: await themeSettled(page) })
    .include("header")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test.describe("pages in other languages (P7-L2b)", () => {
  // Mock fixture (MOCK_TRANSLATED_ZIWA): Arabic reviewed and switched on for
  // Ziwa LMS, with its Platform page translated; nothing else translated.
  test("a translated page has its own address, language, direction and alternates", async ({ page }) => {
    await page.goto("/ziwa/ar/platform");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("[data-page-locale]")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "عربي: One platform for lending operations",
    );
    // Search engines learn each language's address.
    const alternate = (lang: string) => page.locator(`link[rel="alternate"][hreflang="${lang}"]`);
    await expect(alternate("ar")).toHaveAttribute("href", /\/ziwa\/ar\/platform$/);
    await expect(alternate("en")).toHaveAttribute("href", /\/ziwa\/platform$/);
    await expect(alternate("x-default")).toHaveAttribute("href", /\/ziwa\/platform$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/ziwa\/ar\/platform$/);
    // The menu follows the page's language where a translation exists; the selector too.
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "المنصة" })).toHaveAttribute("href", "/ziwa/ar/platform");
    const selector = header.getByRole("button", { name: /^AR/ });
    await expect(async () => {
      await selector.click();
      await expect(header.getByRole("link", { name: /English/ })).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(header.getByRole("link", { name: /English/ })).toHaveAttribute("href", "/ziwa/platform");
    await expect(header.getByRole("link", { name: /العربية/ })).toHaveAttribute("aria-current", "true");
    const results = await new AxeBuilder({ page: await themeSettled(page) })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });

  test("the selector offers a language only where that page exists in it, staying on the website", async ({
    page,
  }) => {
    const header = page.getByRole("banner");
    // Opens the selector once the header is interactive (a click before hydration is lost).
    const open = async () =>
      expect(async () => {
        await header.getByRole("button", { name: /^EN/ }).click();
        await expect(header.getByRole("link", { name: /English/ })).toBeVisible({ timeout: 1_000 });
      }).toPass();
    await page.goto("/ziwa/platform");
    await open();
    await expect(header.getByRole("link", { name: /العربية/ })).toHaveAttribute("href", "/ziwa/ar/platform");
    // Security isn't translated (nor is the home page): English only there.
    await page.goto("/ziwa/security");
    await open();
    await expect(header.getByRole("link", { name: /العربية/ })).toHaveCount(0);
  });

  test("an untranslated page goes to its English version; languages a website doesn't show aren't addresses", async ({
    page,
    request,
  }) => {
    await page.goto("/ziwa/ar/security");
    await expect(page).toHaveURL(/\/ziwa\/security$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // ZiraHR hasn't switched Arabic on: /zirahr/ar/platform is no page at all.
    expect((await request.get("/zirahr/ar/platform")).status()).toBe(404);
    // (The sitemap's translated addresses are unit-tested: e2e builds don't index.)
  });
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

test("ZiraHR's dark sections use the dark palette in light mode, with no brown cast (owner's brief, 12 Nov 2026)", async ({
  page,
}) => {
  // The Platform page's contrasting band (the test data's; on the live home page it's the second section).
  await page.goto("/zirahr/platform");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  const band = page.locator('section[data-tone="inverse"]').first();
  await expect(band).toBeAttached();
  const colours = await band.evaluate((el) => {
    const css = getComputedStyle(el, "::before").backgroundImage + " " + getComputedStyle(el).backgroundImage;
    return [...css.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)].map((m) => m.slice(1, 4).map(Number));
  });
  expect(colours.length).toBeGreaterThan(0);
  // Deep Charcoal, Charcoal Mocha and a faint orange lift only: no stop brighter than #43362E.
  for (const [r, g, b] of colours) expect(Math.max(r!, g!, b!)).toBeLessThanOrEqual(0x43);
});

test("public pricing in three steps: modules, configuration, optional services, with a live estimate", async ({
  page,
  isMobile,
}) => {
  // Owner's brief, 12 Nov 2026. Jasiri LMS has a synthetic published, visible price book in the mock API.
  await page.goto("/jasiri/pricing");
  for (const step of ["Choose your modules", "Configure your subscription", "Add optional services"])
    await expect(page.getByRole("heading", { name: step })).toBeVisible();
  await expect(page.getByText("Pick your modules. We'll do the math.")).toBeVisible();
  // Only public items; quoted services show without a price.
  await expect(page.getByText("Private module (test)")).toHaveCount(0);
  await expect(page.locator('[data-service="integration"]')).toContainText("Request a quote");

  const summary = isMobile
    ? page.locator("#pricing-summary-compact")
    : page.getByRole("complementary", { name: "Your quotation" });
  // On phones the summary is a compact bar that opens over the page and closes again.
  const show = async () => {
    if (!isMobile) return;
    await page.getByRole("button", { name: /View summary/ }).click();
    await expect(page.getByRole("button", { name: /Hide summary/ })).toHaveAttribute("aria-expanded", "true");
  };
  const hide = async () => {
    if (isMobile) await page.getByRole("button", { name: /Hide summary/ }).click();
  };
  // Two core modules start on: 50 employees × 100, plus a flat 2,000 a month.
  await show();
  await expect(summary.getByText("KES 7,000.00").first()).toBeVisible({ timeout: 15_000 });
  await hide();
  // A module counts its own employees.
  await page.getByLabel("Core module (test): employees").fill("20");
  await show();
  await expect(summary.getByText("KES 4,000.00").first()).toBeVisible();
  await hide();
  // Optional services: one-off charges apart from the subscription, quotes out of the totals.
  await page.getByRole("switch", { name: "Training (test)" }).click();
  await page.getByLabel("Number of participants").fill("4");
  await page.getByRole("switch", { name: "Custom integration (test)" }).click();
  // Annual billing with its discount.
  await page
    .getByRole("radiogroup", { name: "Billing cycle" })
    .getByRole("radio", { name: /Annual/ })
    .click();
  await show();
  await expect(summary.getByText("One-off · charged once")).toBeVisible();
  await expect(summary.getByText("KES 6,000.00").first()).toBeVisible();
  await expect(summary.getByText("Not included in the totals")).toBeVisible();
  await expect(summary.getByText("Subscription · per year")).toBeVisible();
  await expect(summary.getByRole("link", { name: "Request a quote" })).toBeVisible();
  await expect(summary.getByRole("link", { name: "Book a demo" })).toHaveAttribute(
    "href",
    /kind=demo_request/,
  );
  expect(await axe(page)).toEqual([]);
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
  // The panel, or the stage alone where the heading scrolls by above it (as the site measures it).
  const panel = section.firstElementChild as HTMLElement;
  const compact = getComputedStyle(panel).display === "contents";
  const stage = compact ? panel.querySelector<HTMLElement>("[data-stage-pin]")! : panel;
  const before = compact ? stage.previousElementSibling : null;
  const offset = before instanceof HTMLElement ? before.offsetHeight : 0;
  const top = Math.max(header, Math.round((innerHeight + header - stage.offsetHeight) / 2));
  const travel = section.querySelector<HTMLElement>("[data-runway]")!.offsetHeight;
  window.scrollTo({
    top: section.getBoundingClientRect().top + window.scrollY + offset - top + travel * fraction,
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

test("ZiraHR's demo call opens the two-stage enquiry form on ZiraHR, and one complete enquiry is sent", async ({
  page,
  isMobile,
}) => {
  // Two stages in one card (owner's brief, 13 Nov 2026).
  const sent: Record<string, unknown>[] = [];
  let failNext = true;
  await page.route("**/v1/enquiries", async (route) => {
    sent.push(route.request().postDataJSON());
    // The first attempt fails (a recoverable error): nothing typed may be lost.
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Try again." } } });
      return;
    }
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
  // POST, never GET: an early submission can't put anyone's details in a URL.
  await expect(form).toHaveAttribute("method", "post");
  const one = form.locator("[data-stage-one]");
  const two = form.locator("[data-stage-two]");
  // The product is ZiraHR, fixed: no product choice to make.
  await expect(form.getByLabel("Product")).toHaveCount(0);
  await expect(form.getByRole("radio", { name: "Request a demo" })).toBeChecked();
  await expect(one.getByRole("heading", { name: /Let's get acquainted/ })).toBeVisible();
  // The second stage waits, inactive, until the first is right.
  await expect(two).toHaveAttribute("inert", "");
  if (isMobile) {
    await expect(two).toBeHidden();
    await expect(form.getByText("Step 1 of 2")).toBeVisible();
  } else {
    await expect(two.getByRole("heading", { name: /Tell us more/ })).toBeVisible();
    await expect(form.locator(".fb-enquiry-divider")).toBeVisible();
    // Side by side, the first on the left.
    expect((await two.boundingBox())!.x).toBeGreaterThan((await one.boundingBox())!.x + 200);
  }
  expect(await axe(page)).toEqual([]);

  // Nothing filled in: it says what's needed and stays on the first stage.
  await expect(async () => {
    await one.getByRole("button", { name: "Continue" }).click();
    await expect(one.getByText("This field is required.").first()).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(two).toHaveAttribute("inert", "");
  await one.getByLabel("Full name").fill("Libbie Sonia");
  await one.getByLabel("Work email").fill("libbie@");
  await one.getByLabel("Company or organisation").fill("Mfano Ltd");
  await one.getByRole("button", { name: "Continue" }).click();
  await expect(one.getByText("Enter a valid email address")).toBeVisible();
  await expect(two).toHaveAttribute("inert", "");
  await one.getByLabel("Work email").fill("libbie@mfano.co.ke");
  await one.getByRole("button", { name: "Continue" }).click();

  // The second stage is active, and focus has moved into it.
  await expect(two).not.toHaveAttribute("inert");
  await expect.poll(() => two.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  if (isMobile) {
    await expect(form.getByText("Step 2 of 2")).toBeVisible();
    await expect(one).toBeHidden();
  } else await expect(one.getByRole("button", { name: "Continue" })).toHaveCount(0);
  // Company size only where it helps: a general question doesn't ask for it.
  await expect(two.getByLabel("Company size")).toBeVisible();
  if (isMobile) {
    await two.getByRole("button", { name: "Back to your details" }).click();
    await expect(one).toBeVisible();
  }
  await one.locator("label", { hasText: "General question" }).click();
  await expect(one.getByRole("radio", { name: "General question" })).toBeChecked();
  if (isMobile) await one.getByRole("button", { name: "Continue" }).click();
  await expect(two.getByLabel("Company size")).toHaveCount(0);
  if (isMobile) {
    await two.getByRole("button", { name: "Back to your details" }).click();
  }
  await one.locator("label", { hasText: "Request a demo" }).click();
  await expect(one.getByRole("radio", { name: "Request a demo" })).toBeChecked();
  if (isMobile) await one.getByRole("button", { name: "Continue" }).click();
  await two.getByLabel("Company size").selectOption({ index: 2 });

  // Editing the first stage after moving on: a mistake there is caught before sending.
  if (!isMobile) {
    await one.getByLabel("Work email").fill("not-an-email");
    await two.getByRole("checkbox").check();
    await two.getByRole("button", { name: "Send enquiry" }).click();
    await expect(one.getByText("Enter a valid email address")).toBeVisible();
    expect(sent).toHaveLength(0);
    await one.getByLabel("Work email").fill("libbie@mfano.co.ke");
    await one.getByRole("button", { name: "Continue" }).click();
  }
  await two.getByRole("checkbox").check();

  // A recoverable failure keeps everything; the retry sends one enquiry (same key), only then the thanks.
  await two.getByRole("button", { name: "Send enquiry" }).click();
  await expect(form.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByText("You're all set!")).toHaveCount(0);
  await expect(two.getByRole("checkbox")).toBeChecked();
  await two.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("You're all set! Your enquiry is on its way.")).toBeVisible();
  await expect(page.getByText("ZR-DEMO-0001")).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({
    kind: "demo_request",
    product: "zirahr",
    name: "Libbie Sonia",
    email: "libbie@mfano.co.ke",
    company: "Mfano Ltd",
    source_path: "/zirahr/contact",
    // The form names its website, so the API applies ZiraHR's form settings (UI-EF3).
    form: "zirahr",
  });
  expect(sent[1]!.company_size).not.toBe("");
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
  await form.getByLabel("Your name").fill("Libbie Sonia");
  await form.getByLabel("Work email").fill("libbie@example.co.ke");
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
    // The chosen step shows at once; the page then arrives at it.
    await expect(story).toHaveAttribute("data-step", "3");
    await expect
      .poll(async () => Number(await story.evaluate((el) => el.style.getPropertyValue("--story-progress"))))
      .toBeGreaterThan(0.5);
    await expect(story).toHaveAttribute("data-step", "3");
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
    // Either may be a gradient (ZiraHR, 11 Nov 2026): then its first colour stop.
    const background = (el: typeof band) =>
      el.evaluate((node) => {
        const paint = (style: CSSStyleDeclaration) =>
          style.backgroundColor !== "rgba(0, 0, 0, 0)"
            ? style.backgroundColor
            : (/rgba?\([^)]*\)/.exec(style.backgroundImage)?.[0] ?? style.backgroundColor);
        const own = paint(getComputedStyle(node));
        return own === "rgba(0, 0, 0, 0)" ? paint(getComputedStyle(node, "::before")) : own;
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
    isMobile,
  }) => {
    // Wide screens guide these demonstrations by scrolling instead (next test); phones play them.
    test.skip(!isMobile, "phones and tablets play demonstrations by themselves");
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

  test("smart scroll: on wide screens scrolling guides a demonstration through its steps, both ways, and it can be skipped", async ({
    page,
    isMobile,
  }) => {
    // Owner's brief, 12 Nov 2026.
    test.skip(isMobile, "phones play demonstrations by themselves");
    test.setTimeout(60_000);
    await page.goto("/zirahr/platform");
    const guided = page.locator("[data-guided]").filter({ has: page.locator("#demo-slip-gross") });
    await expect(guided).toBeAttached();
    // No clock to pause: scrolling is the control.
    await expect(guided.getByRole("button", { name: /Pause demonstration/ })).toHaveCount(0);
    // To where it settles, then down through its steps with the wheel.
    await guided.evaluate((el) =>
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "instant" }),
    );
    await expect(guided).toHaveAttribute("data-step", "0");
    await expect(page.locator("#demo-slip-gross")).toHaveAttribute("aria-selected", "true");
    const step = async () => Number(await guided.getAttribute("data-step"));
    await page.mouse.move(700, 450);
    await expect(async () => {
      await page.mouse.wheel(0, 400);
      expect(await step()).toBeGreaterThanOrEqual(3);
    }).toPass({ timeout: 15_000 });
    await expect(page.locator("#demo-slip-panel")).not.toContainText("Monthly earnings before any deduction");
    // Back up, it reverses.
    await expect(async () => {
      await page.mouse.wheel(0, -400);
      expect(await step()).toBe(0);
    }).toPass({ timeout: 15_000 });
    // Choosing a line takes the page to that step, and it stays.
    await page.locator("#demo-slip-net").click();
    await expect(guided).toHaveAttribute("data-step", "5", { timeout: 5_000 });
    await expect(page.locator("#demo-slip-panel")).toContainText("103,618.15");
    await page.waitForTimeout(1_500);
    await expect(guided).toHaveAttribute("data-step", "5");
    // Skip leaves it: the page carries on below.
    await guided.getByRole("button", { name: /^Skip this demonstration: .+[^.]$/ }).click();
    await expect.poll(() => guided.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(200);
    expect(await axe(page)).toEqual([]);
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
    // All eight modules both ways, plus a fast flick through them: longer than most.
    test.setTimeout(60_000);
    await page.goto("/zirahr/platform");
    const showcase = page.locator("[data-modules]");
    // What stays in view: the panel with its heading, or on phones and short
    // screens the stage alone (the heading then scrolls by, never clipped).
    const travels = await showcase
      .locator(".fb-modules-pin")
      .evaluate((el) => getComputedStyle(el).display !== "contents");
    const pinned = travels ? showcase.locator(".fb-modules-pin") : showcase.locator(".fb-modules-stage");
    const stage = showcase.locator(".fb-modules-stage");
    const heading = showcase.getByRole("heading", { level: 2 });
    const lead = showcase.locator(".fb-modules-intro p").first();
    // The heading and lead belong to the showcase, once (no duplicate heading).
    await expect(heading).toHaveCount(1);
    // Right under the introduction: no blank band before the stage.
    const gap =
      (await stage.boundingBox())!.y - ((await lead.boundingBox())!.y + (await lead.boundingBox())!.height);
    expect(gap).toBeLessThanOrEqual(48);
    expect(gap).toBeGreaterThanOrEqual(8);
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
      // Pinned below the header the whole way, the stage whole on screen.
      const header = (await page.getByRole("banner").boundingBox())!;
      const box = (await pinned.boundingBox())!;
      expect(Math.round(box.y)).toBeGreaterThanOrEqual(Math.floor(header.y + header.height) - 1);
      // Each module plays while the stage is actually pinned, not on its way up.
      const rest = parseFloat(
        await showcase.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--story-top")),
      );
      expect(Math.abs(box.y - rest), `module ${i + 1}`).toBeLessThanOrEqual(2);
      const s = (await stage.boundingBox())!;
      expect(s.y + s.height).toBeLessThanOrEqual(viewport + 1);
      if (travels) {
        // The heading stays with the stage, still just above it.
        const h = (await heading.boundingBox())!;
        expect(h.y).toBeGreaterThanOrEqual(Math.floor(header.y + header.height) - 1);
        expect(s.y - (h.y + h.height)).toBeLessThanOrEqual(160);
      }
    }
    // Released after the eighth: scrolling on moves it away.
    await at(1.4);
    await expect(showcase).toHaveAttribute("data-step", "7");
    expect((await pinned.boundingBox())!.y).toBeLessThan(0);
    // Back up, it reverses through the modules.
    await at((5 + 0.5) / 8);
    await expect(showcase).toHaveAttribute("data-step", "5");
    await at(0.02);
    await expect(showcase).toHaveAttribute("data-step", "0");

    // A fast flick from the first module to the last still passes through
    // every one, in order, and back again (never several at once).
    await showcase.evaluate((el) => {
      const steps: string[] = [];
      (window as unknown as { steps: string[] }).steps = steps;
      new MutationObserver(() => steps.push(el.getAttribute("data-step") ?? "")).observe(el, {
        attributes: true,
        attributeFilter: ["data-step"],
      });
    });
    await at(7.5 / 8);
    await expect(showcase).toHaveAttribute("data-step", "7");
    await at(0.02);
    await expect(showcase).toHaveAttribute("data-step", "0");
    const seen = await page.evaluate(() => (window as unknown as { steps: string[] }).steps);
    expect(seen).toEqual(["1", "2", "3", "4", "5", "6", "7", "6", "5", "4", "3", "2", "1", "0"]);

    // Choosing a module scrolls to it; "Skip the modules" leaves the sequence.
    await tabs.nth(4).click();
    await expect(showcase).toHaveAttribute("data-step", "4");
    await expect(showcase).toContainText("Performance");
    await showcase.getByRole("button", { name: "Skip the modules" }).click();
    await expect.poll(async () => (await pinned.boundingBox())!.y, { timeout: 5_000 }).toBeLessThan(0);
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
    await form.getByLabel("Contact person").fill("James Sammy");
    await form.getByLabel("Their email").fill("james@example.co.ke");
    await form.getByLabel("Your name").fill("Libbie Sonia");
    await form.getByLabel("Your email").fill("libbie@example.co.ke");
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

test.describe("Choose a module: a guided tour (owner's brief, 11 Nov 2026)", () => {
  test("wide screens: pinned, scrolling steps through the modules both ways, then lets go", async ({
    page,
  }) => {
    test.skip(page.viewportSize()!.width < 1024, "the tour pins on wide screens");
    await page.goto("/zirahr/platform");
    const tour = page.locator("[data-module-tour]");
    const tabs = tour.getByRole("tablist", { name: "Modules" }).getByRole("tab");
    const count = await tabs.count();
    const at = (fraction: number) => tour.evaluate(scrollToFraction, fraction);
    await at(0.05);
    await expect
      .poll(() => tour.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--story-top")))
      .not.toBe("");
    for (const i of [...Array(count).keys(), ...[...Array(count).keys()].reverse()]) {
      await at((i + 0.5) / count);
      await expect(tour).toHaveAttribute("data-step", String(i));
      await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
      await expect(tour.getByRole("tabpanel")).toHaveCount(1);
    }
    // Its demonstration sits with the module's words.
    await at(0.5 / count);
    await expect(tour.getByRole("tabpanel").locator('[data-module-preview="payroll"]')).toBeVisible();
    // A tab goes to its module; "Skip the tour" leaves the section.
    await tabs.nth(count - 1).click();
    await expect(tour).toHaveAttribute("data-step", String(count - 1));
    await tour.getByRole("button", { name: "Skip the tour" }).click();
    await expect
      .poll(async () => (await tour.boundingBox())!.y + (await tour.boundingBox())!.height)
      .toBeLessThan(200);
    // Only this section pins: the page goes on scrolling normally after it.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test("laptops and tablets: the pinned panels, heading included, fit the screen (12 Nov 2026)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "sizes set here");
    test.setTimeout(60_000);
    for (const size of [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/zirahr/platform");
      const panels = [page.locator("[data-modules]")];
      if (size.width >= 1024) panels.push(page.locator("[data-module-tour]"));
      for (const panel of panels) {
        await panel.evaluate(scrollToFraction, 0.5);
        await expect
          .poll(() => panel.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--story-top")))
          .not.toBe("");
        await panel.evaluate(scrollToFraction, 0.5);
        const header = (await page.getByRole("banner").boundingBox())!;
        // Whatever stays in view: the panel with its heading, or the stage alone.
        const box = await panel.evaluate((el) => {
          const first = el.firstElementChild as HTMLElement;
          const pinned =
            getComputedStyle(first).display === "contents"
              ? first.querySelector<HTMLElement>("[data-stage-pin]")!
              : first;
          const r = pinned.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        });
        const where = `${size.width}x${size.height}`;
        expect(box.top, where).toBeGreaterThanOrEqual(Math.floor(header.y + header.height) - 1);
        expect(box.bottom, where).toBeLessThanOrEqual(size.height + 1);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
    }
  });

  test("phones: no pinning; it plays by itself in view, and a choice holds", async ({ page }) => {
    test.skip(page.viewportSize()!.width >= 1024, "phones and narrow screens");
    await page.goto("/zirahr/platform");
    const tour = page.locator("[data-module-tour]");
    await tour.scrollIntoViewIfNeeded();
    expect(await tour.locator(".fb-tour-pin").evaluate((el) => getComputedStyle(el).position)).not.toBe(
      "sticky",
    );
    await expect(tour).toHaveAttribute("data-step", "1", { timeout: 10_000 });
    await tour.getByRole("tab").first().click();
    await expect(tour).toHaveAttribute("data-step", "0");
    await page.waitForTimeout(5_000);
    await expect(tour).toHaveAttribute("data-step", "0");
  });
});

test.describe("hero module messages (owner's brief, 11 Nov 2026)", () => {
  test("hovering a card shows its message and holds the journey; Escape puts it away", async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1024, "hover is a pointer feature");
    await page.goto("/zirahr/platform");
    const hero = page.locator("[data-hero-modules]");
    await hero.scrollIntoViewIfNeeded();
    const card = hero.locator('[data-module="payroll"] [data-card]');
    await card.hover();
    const tip = hero.locator('[data-hero-tip="payroll"]');
    await expect(tip).toContainText("Payroll & Statutory Compliance");
    await expect(tip).toContainText("Payday without the headaches. Now that's smart!");
    const held = await hero.getAttribute("data-current");
    await page.waitForTimeout(3_500);
    await expect(hero).toHaveAttribute("data-current", held!);
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
    // Inside the hero column, never off the side of the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      0,
    );
  });

  test("keyboard and screen readers get the same messages from the dots", async ({ page }) => {
    await page.goto("/zirahr/platform");
    const dot = page.getByRole("button", { name: "Show Learning & Development" });
    await expect(dot).toHaveAttribute("aria-description", "New skills unlocked. Growth looks good on you!");
    // Focused again until the page is interactive (hydration can trail the first paint).
    await expect(async () => {
      await dot.blur();
      await dot.focus();
      await expect(page.getByText("New skills unlocked. Growth looks good on you!").first()).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 20_000 });
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-hero-tip]")).toHaveCount(0);
  });

  test("on phones, the lit module's message shows as the journey plays", async ({ page }) => {
    test.skip(page.viewportSize()!.width >= 640, "narrow stages");
    await page.goto("/zirahr/platform");
    const hero = page.locator("[data-hero-modules]");
    await hero.scrollIntoViewIfNeeded();
    const caption = hero.locator("[data-hero-caption]");
    await expect(caption).toContainText("Core HR: Your people, their records.");
    await expect(caption).not.toContainText("Core HR:", { timeout: 8_000 });
  });

  test("a tap shows a card's message on touch screens", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch");
    await page.goto("/zirahr/platform");
    const hero = page.locator("[data-hero-modules]");
    await hero.scrollIntoViewIfNeeded();
    const shown = hero.locator("[data-module][data-shown]").first();
    const key = await shown.getAttribute("data-module");
    await shown.locator("[data-card]").tap();
    await expect(hero.locator(`[data-hero-tip="${key}"]`)).toBeVisible();
  });
});

test("numbered steps: the selected number is solid brand colour, its heading and bar follow", async ({
  page,
}) => {
  await page.goto("/zirahr/platform");
  const rows = page.locator("[data-numbered] .fb-numbered-row");
  const centre = (i: number) =>
    rows.nth(i).evaluate((el) => {
      const box = el.getBoundingClientRect();
      window.scrollBy({ top: box.top + box.height / 2 - innerHeight / 2, behavior: "instant" });
    });
  const look = (i: number) =>
    rows.nth(i).evaluate((el) => {
      const text = el.querySelector(".fb-outline-num text")!;
      return {
        fill: getComputedStyle(text).fill,
        product: getComputedStyle(el).getPropertyValue("--product").trim(),
        heading: getComputedStyle(el.querySelector("h3")!).color,
        bar: getComputedStyle(el, "::before").transform,
      };
    });
  await expect(async () => {
    await centre(1);
    await expect(rows.nth(1)).toHaveAttribute("data-current", { timeout: 1_000 });
  }).toPass();
  await page.waitForTimeout(400);
  const on = await look(1);
  const off = await look(0);
  expect(on.fill).not.toBe("none");
  expect(on.fill).not.toBe(off.fill);
  expect(off.fill).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(on.heading).not.toBe(off.heading);
  expect(on.bar).not.toBe(off.bar);
});
