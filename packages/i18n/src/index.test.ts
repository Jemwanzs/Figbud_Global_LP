import { describe, expect, it } from "vitest";

import { hreflangAlternates, localizePath, mergeDictionary, negotiateLocale, stripLocale } from "./index";

describe("locale paths", () => {
  it("prefixes and strips locales", () => {
    expect(localizePath("sw")).toBe("/sw");
    expect(localizePath("fr", "/about")).toBe("/fr/about");
    expect(localizePath("ar", "contact")).toBe("/ar/contact");
    expect(stripLocale("/sw/about")).toBe("/about");
    expect(stripLocale("/en")).toBe("/");
    expect(stripLocale("/about")).toBe("/about");
  });
});

describe("negotiateLocale", () => {
  it("falls back to English for missing or unknown preferences", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("en");
  });

  it("never redirects visitors into unreviewed (draft) locales", () => {
    expect(negotiateLocale("sw-KE,sw;q=0.9,en;q=0.5")).toBe("en");
  });
});

describe("hreflangAlternates", () => {
  it("lists only published locales plus x-default", () => {
    expect(hreflangAlternates("https://example.com", "/products")).toEqual({
      en: "https://example.com/en/products",
      "x-default": "https://example.com/en/products",
    });
  });
});

describe("mergeDictionary", () => {
  it("overlays translations deeply and keeps English fallbacks", () => {
    const base = { nav: { home: "Home", blog: "Blog" }, items: ["a", "b"] };
    const merged = mergeDictionary(base, { nav: { home: "Nyumbani" }, items: ["x"] });
    expect(merged).toEqual({ nav: { home: "Nyumbani", blog: "Blog" }, items: ["x"] });
    expect(base.nav.home).toBe("Home");
  });
});
