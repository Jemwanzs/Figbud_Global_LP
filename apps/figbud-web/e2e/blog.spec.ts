import { expect, test } from "@playwright/test";

// Content comes from e2e/mock-api.mjs (synthetic articles in English, none in Swahili).

test.describe("blog index", () => {
  test("lists published articles with topics and search", async ({ page }) => {
    await page.goto("/en/blog");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blog & Insights");
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().getByRole("link")).toHaveAttribute("href", "/en/blog/effective-dated-payroll");
    await expect(cards.first()).toContainText("4 min read");

    const topics = page.getByRole("navigation", { name: "Topics" });
    await expect(topics.getByRole("link", { name: "All topics" })).toHaveAttribute("aria-current", "page");
    await topics.getByRole("link", { name: "Lending" }).click();
    await expect(page).toHaveURL(/\?category=lending$/);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(topics.getByRole("link", { name: "Lending" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("searchbox", { name: "Search articles" }).fill("payroll");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=payroll/);
    await expect(page.getByText("Results for “payroll”")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No articles match" })).toBeVisible();

    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/blog$/);
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("shows an honest empty state when nothing is published", async ({ page }) => {
    await page.goto("/sw/blog");
    await expect(page.getByRole("heading", { name: "Insights are on their way" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });
});

test.describe("article page", () => {
  test("renders the article with breadcrumbs, contents, related and structured data", async ({ page }) => {
    const response = await page.goto("/en/blog/effective-dated-payroll");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Why payroll rules must be effective-dated",
    );
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/en/blog");
    await expect(page.getByText("By FigBud Editorial")).toBeVisible();

    const toc = page.getByRole("complementary", { name: "On this page" });
    await expect(toc.getByRole("link", { name: "The approach" })).toHaveAttribute("href", "#the-approach");
    await expect(page.locator("#the-approach")).toHaveText("The approach");
    await expect(page.getByRole("link", { name: "Compliance" })).toHaveAttribute(
      "href",
      "/en/blog?tag=compliance",
    );

    const related = page.getByRole("region", { name: "Related insights" });
    await expect(related.getByRole("link", { name: "Maker-checker approvals in lending" })).toBeVisible();

    const schemas = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? "{}")));
    const posting = schemas.find((s) => s["@type"] === "BlogPosting");
    expect(posting.headline).toBe("Why payroll rules must be effective-dated");
    expect(posting.datePublished).toBe("2026-10-01T08:00:00Z");
    expect(posting.author.name).toBe("FigBud Editorial");
  });

  test("unknown articles return 404", async ({ page }) => {
    const response = await page.goto("/en/blog/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});
