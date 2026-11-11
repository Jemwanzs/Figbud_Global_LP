import { afterEach, describe, expect, it, vi } from "vitest";

async function loadSite(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./site");
}

afterEach(() => vi.unstubAllEnvs());

describe("productLink", () => {
  it("falls back to the Products page while a product site is not deployed", async () => {
    const { productLink } = await loadSite({ NEXT_PUBLIC_ZIRAHR_URL: "" });
    expect(productLink("zirahr", "en")).toEqual({ href: "/en/products#zirahr", external: false });
  });

  it("opens configured product websites externally, at the address they're served from", async () => {
    const { productLink } = await loadSite({ NEXT_PUBLIC_JASIRI_URL: "https://sites.example.com/jasiri/" });
    expect(productLink("jasiri", "sw", "active")).toEqual({
      href: "https://sites.example.com/jasiri",
      external: true,
    });
  });

  it("sends coming-soon products to their Coming Soon page, or the waitlist without one", async () => {
    const { productLink } = await loadSite({
      NEXT_PUBLIC_EXPENSE_NOW_URL: "https://sites.example.com/expense_now",
    });
    expect(productLink("expense_now", "en")).toEqual({
      href: "https://sites.example.com/expense_now",
      external: true,
    });
    expect(productLink("ziwa", "en")).toEqual({
      href: "/en/contact?kind=waitlist&product=ziwa",
      external: false,
    });
  });
});

describe("pageMetadata", () => {
  it("is noindex unless indexing is explicitly enabled", async () => {
    const { pageMetadata } = await loadSite({ NEXT_PUBLIC_ALLOW_INDEXING: "" });
    expect(pageMetadata({ locale: "en", path: "/", description: "d" }).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("indexes published pages in reviewed locales only", async () => {
    const { pageMetadata } = await loadSite({
      NEXT_PUBLIC_ALLOW_INDEXING: "true",
      NEXT_PUBLIC_SITE_URL: "https://figbud.example",
    });
    const en = pageMetadata({ locale: "en", path: "/products", description: "d" });
    expect(en.robots).toEqual({ index: true, follow: true });
    expect(en.alternates?.canonical).toBe("https://figbud.example/en/products");
    expect(pageMetadata({ locale: "sw", path: "/", description: "d" }).robots).toMatchObject({
      index: false,
    });
    expect(
      pageMetadata({ locale: "en", path: "/blog", description: "d", published: false }).robots,
    ).toMatchObject({
      index: false,
    });
  });

  it("follows the languages published in the Studio (P7-G2)", async () => {
    const { pageMetadata } = await loadSite({
      NEXT_PUBLIC_ALLOW_INDEXING: "true",
      NEXT_PUBLIC_SITE_URL: "https://figbud.example",
    });
    const sw = pageMetadata({ locale: "sw", path: "/", description: "d", languages: ["en", "sw"] });
    expect(sw.robots).toEqual({ index: true, follow: true });
    expect(sw.alternates?.languages).toMatchObject({
      sw: "https://figbud.example/sw",
      en: "https://figbud.example/en",
    });
    const fr = pageMetadata({ locale: "fr", path: "/", description: "d", languages: ["en", "sw"] });
    expect(fr.robots).toMatchObject({ index: false });
    expect(Object.keys(fr.alternates?.languages ?? {})).not.toContain("fr");
  });
});
