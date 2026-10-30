import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("renders the hero, platforms and footer without horizontal scroll", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Built for complexity.");
    await expect(page.locator("#platforms")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("redirects the bare domain to a locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
  });

  test("is not indexable outside production", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("platform tabs support keyboard navigation", async ({ page }) => {
    await page.goto("/en#platforms");
    const zira = page.getByRole("tab", { name: /ZiraHR/ });
    const jasiri = page.getByRole("tab", { name: /Jasiri LMS/ });
    // Keyboard handlers attach on hydration, which WebKit reaches later; retry until React responds.
    await expect(async () => {
      await zira.click();
      await zira.focus();
      await page.keyboard.press("ArrowRight");
      await expect(jasiri).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass();
    await expect(jasiri).toBeFocused();
    await page.keyboard.press("End");
    // Registry order: Ziwa LMS follows Expense Now.
    await expect(page.getByRole("tab", { name: /Ziwa LMS/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Join the waitlist/ })).toBeVisible();
  });

  test("platform tabs show each product's published logo", async ({ page }) => {
    await page.goto("/en#platforms");
    const tabs = page.getByRole("tablist");
    const logo = (name: RegExp) => tabs.getByRole("tab", { name }).locator('img[src^="/brand/assets/"]');
    // Symbols for ZiraHR, Expense Now and Ziwa LMS; Jasiri's official logo carries its name.
    for (const name of [/ZiraHR/, /Expense Now/, /Ziwa LMS/, /Jasiri LMS/])
      await expect(logo(name).filter({ visible: true }).first()).toBeVisible();
    await expect(
      tabs
        .getByRole("tab", { name: /Jasiri LMS/ })
        .getByRole("img", { name: "Jasiri LMS" })
        .first(),
    ).toBeVisible();
    // The panel follows the tab, with the same logo.
    await tabs.getByRole("tab", { name: /Ziwa LMS/ }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("heading", { name: "Ziwa LMS" })).toBeVisible();
    await expect(panel.locator('img[src^="/brand/assets/"]').filter({ visible: true }).first()).toBeVisible();
    // On phones the tabs scroll sideways inside their row; the page never does.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe("theme and language", () => {
  test("dark by default whatever the device prefers; one button switches and is remembered", async ({
    page,
  }) => {
    const html = page.locator("html");
    // A first-time visitor whose device prefers light still gets dark.
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/en");
    await expect(html).toHaveAttribute("data-theme", "dark");
    const toLight = page.getByRole("button", { name: "Switch to light theme" });
    await expect(toLight).toBeVisible();
    // Dark shows the sun, light shows the moon.
    await expect(toLight.locator('[data-theme-icon="sun"]')).toHaveCSS("opacity", "1");
    await expect(async () => {
      await toLight.click();
      await expect(html).toHaveAttribute("data-theme", "light", { timeout: 1_000 });
    }).toPass();
    const toDark = page.getByRole("button", { name: "Switch to dark theme" });
    await expect(toDark.locator('[data-theme-icon="moon"]')).toHaveCSS("opacity", "1");
    // The choice is remembered, applied before first paint (no flash of dark).
    await page.goto("/en/products");
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
    // Keyboard: Enter flips it back.
    await toDark.focus();
    await page.keyboard.press("Enter");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeFocused();
    // A device switching to light later changes nothing.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("an older saved preference to follow the device starts dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => localStorage.setItem("fb-theme", "system"));
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Arabic renders right-to-left with a review notice", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByText("هذه الترجمة قيد المراجعة")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("navigation", () => {
  test("mobile menu opens, traps focus and closes with Escape", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/en");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Contact" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("navbar dropdowns use the opposite theme, stay on screen and close with Escape", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop navbar");
    // Light page first, then dark: the panels always take the other theme.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("fb-nav-test")) {
        sessionStorage.setItem("fb-nav-test", "1");
        localStorage.setItem("fb-theme", "light");
      }
    });
    await page.goto("/en/contact");
    const nav = page.getByRole("navigation").first();
    const products = nav.getByRole("button", { name: "Products" });
    const language = page.getByRole("banner").getByRole("button", { name: /^EN/ });
    const background = (panel: ReturnType<typeof page.locator>) =>
      panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    const lightness = (rgb: string) =>
      rgb
        .match(/\d+/g)!
        .slice(0, 3)
        .reduce((sum, v) => sum + Number(v), 0) / 3;

    for (const [pageTheme, panelTheme] of [
      ["light", "dark"],
      ["dark", "light"],
    ] as const) {
      await expect(page.locator("html")).toHaveAttribute("data-theme", pageTheme);

      await products.click();
      await expect(products).toHaveAttribute("aria-expanded", "true");
      const menu = page.locator(`#${await products.getAttribute("aria-controls")} > [data-inverse]`);
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute("data-theme", panelTheme);
      const shade = lightness(await background(menu));
      expect(panelTheme === "dark" ? shade < 80 : shade > 200, `${panelTheme} panel`).toBe(true);
      await expect(menu.locator('[data-product="zirahr"]')).toContainText(
        "HR Simplified. Business Amplified.",
      );
      const box = (await menu.boundingBox())!;
      const width = page.viewportSize()!.width;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(products).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeHidden();

      // Keyboard: open with Enter; Escape from a link in the list goes back to the trigger
      // (focused directly, as Safari's Tab skips links by default).
      await language.focus();
      await page.keyboard.press("Enter");
      const list = page.locator(`#${await language.getAttribute("aria-controls")} > [data-inverse]`);
      await expect(list).toHaveAttribute("data-theme", panelTheme);
      await expect(list.getByRole("link", { name: /English/ })).toHaveAttribute("aria-current", "true");
      await list.getByRole("link", { name: /English/ }).focus();
      await page.keyboard.press("Escape");
      await expect(list).toBeHidden();
      await expect(language).toBeFocused();

      if (pageTheme === "light") {
        await page.getByRole("button", { name: "Switch to dark theme" }).click();
      }
    }
  });

  test("inner pages show breadcrumbs with matching structured data", async ({ page }) => {
    await page.goto("/en/products");
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/en");
    await expect(trail.locator('[aria-current="page"]')).toHaveText("Products");

    const schemas = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? "{}")));
    const breadcrumbs = schemas.find((s) => s["@type"] === "BreadcrumbList");
    expect(breadcrumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Home", "Products"]);
    expect(breadcrumbs.itemListElement[1].item).toMatch(/^https?:\/\/[^/]+\/en\/products$/);
  });

  test("Arabic breadcrumbs are localised and right-to-left", async ({ page }) => {
    await page.goto("/ar/contact");
    const trail = page.getByRole("navigation", { name: "مسار التنقل" });
    await expect(trail.getByRole("link")).toHaveAttribute("href", "/ar");
  });

  test("unknown URLs return a branded 404", async ({ page }) => {
    const response = await page.goto("/en/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("different route");
  });
});

test.describe("about page", () => {
  test("tells the company story from approved copy, with the products and their status", async ({ page }) => {
    await page.goto("/en/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("About Us");
    await expect(page.getByText("One Vision. Endless Solutions.")).toBeVisible();
    // A finished page, not the holding notice.
    await expect(page.getByText("In progress")).toHaveCount(0);
    for (const name of ["Who we are", "What we believe", "What we build", "What we engineer"])
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText("Nairobi, Kenya")).toBeVisible();
    const products = page.locator("#about-build").locator("xpath=ancestor::section").getByRole("listitem");
    await expect(products).toHaveCount(4);
    await expect(products.filter({ hasText: "Expense Now" })).toContainText("Coming soon");
    await expect(page.getByRole("link", { name: /Talk to Our Team/ }).last()).toHaveAttribute(
      "href",
      "/en/contact",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/about$/);
  });
});

test.describe("products page", () => {
  test("comparison links straight to the pre-filled enquiry form", async ({ page, isMobile }) => {
    await page.goto("/en/products");
    const compare = isMobile
      ? page.locator("ul").filter({ has: page.getByRole("heading", { level: 3, name: "Expense Now" }) })
      : page.getByRole("region", { name: "Comparison of FigBud products" });
    const waitlists = compare.getByRole("link", { name: "Join the waitlist" });
    await expect(waitlists.first()).toHaveAttribute("href", "/en/contact?kind=waitlist&product=expense_now");
    if (!isMobile) {
      await expect(waitlists.nth(1)).toHaveAttribute("href", "/en/contact?kind=waitlist&product=ziwa");
    }
    await expect(compare.getByRole("link", { name: "Request a demo" }).first()).toHaveAttribute(
      "href",
      "/en/contact?kind=demo_request&product=zirahr",
    );
    await expect(page.getByRole("link", { name: "Start a conversation" })).toHaveAttribute(
      "href",
      "/en/contact?kind=partnership",
    );
  });
});

test.describe("contact form", () => {
  test("validates on the client before calling the API", async ({ page }) => {
    let called = false;
    await page.route("**/v1/enquiries", (route) => {
      called = true;
      return route.abort();
    });
    await page.goto("/en/contact");
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByText("Please correct the highlighted fields.")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
    expect(called).toBe(false);
  });

  test("submits once with an idempotency key and shows the reference", async ({ page }) => {
    const keys: string[] = [];
    await page.route("**/v1/enquiries", async (route) => {
      keys.push(route.request().headers()["idempotency-key"] ?? "");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ reference: "FBG-2610-TEST42", status: "received" }),
      });
    });
    await page.goto("/en/contact?kind=waitlist&product=expense_now");
    await expect(page.getByRole("radio", { name: "Join a waitlist" })).toBeChecked();
    await expect(page.getByLabel("Product")).toHaveValue("expense_now");
    await page.getByLabel("Full name").fill("Amina Wanjiru");
    await page.getByLabel("Work email").fill("amina@example.co.ke");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByText("FBG-2610-TEST42")).toBeVisible();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

test.describe("smart contact fields", () => {
  test("country selector, international phones and a dependent second number", async ({ page }) => {
    let sent: Record<string, unknown> = {};
    await page.route("**/v1/enquiries", async (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ reference: "FBG-2610-PHONE1", status: "received" }),
      });
    });
    await page.goto("/en/contact?kind=waitlist&product=ziwa");
    // The email label prefers a company address but accepts any valid one.
    const email = page.getByLabel(/^Work email/);
    await expect(page.getByText("company email preferred")).toBeVisible();
    await email.fill(" amina@");
    await email.blur();
    await expect(page.getByText("Enter a valid email address, like name@company.com.")).toBeVisible();
    await email.fill(" amina.wanjiru@gmail.com ");
    await email.blur();
    await expect(email).toHaveValue("amina.wanjiru@gmail.com");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");

    // Searchable country list; an empty phone follows the chosen country.
    await page.getByRole("button", { name: /^Country/ }).click();
    const search = page.getByRole("combobox", { name: "Search countries" });
    await search.fill("ugan");
    await expect(page.getByRole("option", { name: /Uganda \+256/ })).toBeVisible();
    await search.press("Enter");
    await expect(page.getByRole("button", { name: /^Country/ })).toContainText("Uganda");
    await expect(page.getByRole("button", { name: /Phone country: Uganda \+256/ })).toBeVisible();

    // Country-aware validation when leaving the field.
    const phone = page.getByLabel("Phone", { exact: true });
    await phone.fill("0772");
    await phone.blur();
    await expect(page.getByText("Enter a valid phone number for the selected country.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add another number" })).toHaveCount(0);
    await phone.fill("0772 123456");
    await phone.blur();
    await expect(page.getByText("Enter a valid phone number for the selected country.")).toHaveCount(0);

    // A second number starts in the first one's country and can't repeat it.
    await page.getByRole("button", { name: "Add another number" }).click();
    await expect(page.getByRole("button", { name: /Phone country: Uganda/ })).toHaveCount(2);
    const second = page.getByLabel("Second phone", { exact: true });
    await second.fill("+256 772 123 456");
    await second.blur();
    await expect(page.getByText("This is the same number as the first one.")).toBeVisible();
    // Clearing the first number removes the second.
    await phone.fill("");
    await expect(second).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add another number" })).toHaveCount(0);

    // Two valid numbers, in different countries, are sent in E.164.
    await phone.fill("0772123456");
    await phone.blur();
    await page.getByRole("button", { name: "Add another number" }).click();
    await page
      .getByRole("button", { name: /Phone country: Uganda/ })
      .nth(1)
      .click();
    await page.getByRole("combobox", { name: "Search countries" }).fill("254");
    await page.getByRole("option", { name: /Kenya/ }).first().click();
    await page.getByLabel("Second phone", { exact: true }).fill("0712 345 678");
    await page.getByLabel("Full name").fill("Amina Wanjiru");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send enquiry" }).click();
    await expect(page.getByText("FBG-2610-PHONE1")).toBeVisible();
    expect(sent).toMatchObject({
      email: "amina.wanjiru@gmail.com",
      country: "UG",
      phone: "+256772123456",
      phone_country: "UG",
      phone_secondary: "+254712345678",
      phone_secondary_country: "KE",
    });
  });
});

test.describe("narrow screens", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const route of ["/en", "/en/products", "/en/contact", "/ar", "/zh"]) {
    test(`${route} has no horizontal scroll at 360 px`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test("the corporate site shares a 1200 × 630 image on Open Graph and X", async ({ page, request }) => {
  await page.goto("/en");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  const twitter = await page.locator('meta[name="twitter:image"]').getAttribute("content");
  expect(og).toMatch(/\/en\/opengraph-image/);
  expect(twitter).toMatch(/\/en\/twitter-image/);
  for (const url of [og!, twitter!]) {
    const image = await request.get(new URL(url).pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
});
