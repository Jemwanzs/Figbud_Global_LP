import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/** WCAG 2.2 AA plus axe best practices, on every public route. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const ROUTES = [
  "/en",
  "/en/products",
  "/en/contact",
  "/en/about",
  "/en/blog",
  "/en/legal/privacy",
  "/en/does-not-exist",
  "/ar",
];

// Reduced motion from the first paint, so reveals render in their final state;
// axe on the long homepage needs more than the default test budget.
test.use({ reducedMotion: "reduce" });
test.describe.configure({ timeout: 60_000 });

// axe rules are engine-independent; Chromium and WebKit cover them, and
// Firefox's slower axe runs add minutes without adding coverage.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === "firefox", "axe covered by Chromium and WebKit");
});

async function scan(page: Page) {
  // Motion runs some fades in JavaScript (invisible to getAnimations), so wait
  // until no element's opacity changes, then measure contrast on final colours.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const snapshot = () =>
            Array.from(document.querySelectorAll("body *"), (el) => getComputedStyle(el).opacity).join();
          const before = snapshot();
          await new Promise((resolve) => setTimeout(resolve, 300));
          return before === snapshot();
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

for (const route of ROUTES) {
  test(`${route} has no accessibility violations (dark)`, async ({ page }) => {
    await page.goto(route);
    await scan(page);
  });
}

for (const route of ["/en", "/en/products", "/en/contact"]) {
  test(`${route} has no accessibility violations (light)`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("fb-theme", "light"));
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await scan(page);
  });
}

test("contact form errors are announced and accessible", async ({ page }) => {
  await page.goto("/en/contact");
  await page.getByRole("button", { name: /send/i }).click();
  await scan(page);
});
