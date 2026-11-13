import { describe, expect, it } from "vitest";

import {
  builtInLanguages,
  fallbackChain,
  hreflangAlternates,
  liveLanguages,
  localizePath,
  mergeDictionary,
  negotiateLocale,
  stripLocale,
} from "./index";

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

describe("website languages (P7-L1)", () => {
  it("start as FigBud Global's five and a product website's English", () => {
    expect(builtInLanguages("corporate").enabled).toEqual(["en", "sw", "fr", "ar", "zh"]);
    expect(builtInLanguages("product")).toEqual({ enabled: ["en"], default: "en", fallback: "en" });
    expect(liveLanguages(null, "corporate", []).enabled).toHaveLength(5);
  });

  it("hide unreviewed languages on product websites, and never open in one", () => {
    const config = { enabled: ["en", "fr", "sw"] as const, default: "fr", fallback: "sw" } as const;
    const zirahr = liveLanguages({ ...config, enabled: [...config.enabled] }, "product", ["fr"]);
    expect(zirahr).toEqual({ enabled: ["en", "fr"], default: "fr", fallback: "en" });
    // FigBud Global lists them "In review", but still opens in English until reviewed.
    const figbud = liveLanguages({ ...config, enabled: [...config.enabled] }, "corporate", []);
    expect(figbud).toEqual({ enabled: ["en", "sw", "fr"], default: "en", fallback: "sw" });
    // English is always offered, in the usual order.
    expect(liveLanguages({ enabled: ["zh"] }, "corporate", []).enabled).toEqual(["en", "zh"]);
  });

  it("look for text in the language, then the fallback, then English", () => {
    expect(fallbackChain("ar", "fr")).toEqual(["ar", "fr", "en"]);
    expect(fallbackChain("sw", "en")).toEqual(["sw", "en"]);
  });
});
