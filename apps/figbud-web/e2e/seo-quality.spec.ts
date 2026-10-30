import { randomBytes } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

// SEO quality gate (P9-S2), run in CI on every push: every public corporate
// page must render its content on the server with one h1, a unique title and
// description, a canonical URL, valid structured data and working internal
// links; drafts, pending legal pages and the Studio must never be indexable.

const PUBLIC = [
  "/en",
  "/en/products",
  "/en/about",
  "/en/contact",
  "/en/blog",
  "/en/blog/effective-dated-payroll",
];
const NOT_INDEXABLE = ["/ar", "/en/legal/privacy", "/en/legal/terms", "/admin/login"];
const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "engine-independent checks");
});

const head = (page: Page) =>
  page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "",
    h1: document.querySelectorAll("h1").length,
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => s.textContent ?? "",
    ),
    links: [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href") ?? ""),
  }));

test("public pages: server-rendered, one h1, unique metadata, canonical and valid structured data", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const links = new Set<string>();
  for (const path of PUBLIC) {
    // The HTML itself (no JavaScript) carries the main heading: content isn't client-only.
    const html = await (await request.get(path)).text();
    expect(html, `${path} server-renders its h1`).toMatch(/<h1[\s>]/);

    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const meta = await head(page);
    expect(meta.h1, `${path} has one h1`).toBe(1);
    expect(meta.title.length, `${path} title`).toBeGreaterThan(10);
    expect(meta.title.length, `${path} title length`).toBeLessThanOrEqual(70);
    expect(meta.description.length, `${path} description`).toBeGreaterThanOrEqual(50);
    expect(meta.description.length, `${path} description length`).toBeLessThanOrEqual(170);
    expect(meta.ogTitle, `${path} Open Graph title`).not.toBe("");
    expect(meta.canonical, `${path} canonical`).toBe(`${ORIGIN}${path}`);
    for (const block of meta.jsonLd) {
      const data = JSON.parse(block) as Record<string, unknown> | Record<string, unknown>[];
      for (const item of Array.isArray(data) ? data : [data])
        expect(String(item["@context"] ?? ""), `${path} JSON-LD context`).toContain("schema.org");
    }
    expect(
      titles.get(meta.title),
      `${path} duplicates the title of ${titles.get(meta.title)}`,
    ).toBeUndefined();
    titles.set(meta.title, path);
    expect(descriptions.get(meta.description), `${path} duplicates a description`).toBeUndefined();
    descriptions.set(meta.description, path);
    for (const href of meta.links) links.add(href.split("#")[0]!.split("?")[0]!);
  }

  // Every internal link resolves (no 404s, no redirect loops).
  for (const href of [...links].filter((h) => h && !h.startsWith("/admin"))) {
    const response = await request.get(href, { maxRedirects: 3 });
    expect(response.status(), `link ${href}`).toBeLessThan(400);
  }
});

test("drafts, pending legal pages and the Studio are never indexable; unknown pages are real 404s", async ({
  page,
  request,
}) => {
  for (const path of NOT_INDEXABLE) {
    await page.goto(path);
    expect((await head(page)).robots, `${path} robots`).toContain("noindex");
  }
  const missing = await request.get(`/en/not-a-page-${randomBytes(3).toString("hex")}`);
  expect(missing.status()).toBe(404);
  // Outside production, nothing is indexable and the sitemap is empty.
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
});

test("structured data: organisation, website and the products, without ratings or offers", async ({
  page,
}) => {
  await page.goto("/en");
  const home = (await head(page)).jsonLd.join("\n");
  expect(home).toContain('"@type":"Organization"');
  expect(home).toContain('"@type":"WebSite"');
  await page.goto("/en/products");
  const products = (await head(page)).jsonLd.join("\n");
  expect(products).toContain('"@type":"ItemList"');
  expect(products).toContain('"@type":"SoftwareApplication"');
  for (const fabricated of ["aggregateRating", "review", "offers"])
    expect(products).not.toContain(fabricated);
});
