import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("ZiraHR website", () => {
  test("home page presents ZiraHR with links back to FigBud Global", async ({ page, isMobile }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("People. Payroll. Progress. Connected.");
    await expect(page.locator("html")).toHaveAttribute("data-product", "zirahr");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const demo = page
      .getByRole("main")
      .getByRole("link", { name: /Book a demo/ })
      .first();
    await expect(demo).toHaveAttribute(
      "href",
      "http://localhost:3000/en/contact?kind=demo_request&product=zirahr",
    );
    await expect(demo).toHaveAttribute("target", "_blank");
    await expect(demo).toHaveAttribute("rel", "noopener");

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: /Jasiri LMS/ })).toHaveAttribute(
      "href",
      "http://localhost:3000/en/products#jasiri",
    );
    if (!isMobile) {
      await expect(page.getByRole("link", { name: /Back to FigBud Global/ })).toHaveAttribute(
        "href",
        "http://localhost:3000/en",
      );
    }
  });

  test("navigation pages are honest placeholders, never dead links and never indexed", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop navigation");
    await page.goto("/en");
    await page.getByRole("navigation", { name: "ZiraHR", exact: true }).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/en\/pricing$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pricing");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const response = await page.goto("/en/not-a-section");
    expect(response?.status()).toBe(404);
  });

  test("mobile menu lists every page plus the demo and FigBud links", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/en");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Company" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Back to FigBud Global/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("redirects the bare domain and keeps 360 px layouts in bounds", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/en");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("pages have no accessibility violations", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "axe covered by Chromium and WebKit");
    for (const path of ["/en", "/en/modules"]) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    }
  });
});
