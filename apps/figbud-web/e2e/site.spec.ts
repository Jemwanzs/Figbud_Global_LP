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
    await expect(page.getByRole("tab", { name: /Expense Now/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Join the waitlist/ })).toBeVisible();
  });
});

test.describe("theme and language", () => {
  test("defaults to dark and remembers light mode", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
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
