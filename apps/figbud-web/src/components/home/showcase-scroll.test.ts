import { DEFAULT_SHOWCASE, orderBySlug, showcaseSettings } from "@figbud/site-kit";
import { describe, expect, it } from "vitest";

import { HEADER, chooseMode, fit, follow, panelStyle, settle } from "./showcase-scroll";

describe("scroll-driven Our Platforms (UI-MO5)", () => {
  it("rests each product in place around its stop and moves continuously in between", () => {
    expect(settle(0)).toBe(0);
    expect(settle(0.1)).toBe(0);
    expect(settle(0.5)).toBeCloseTo(0.5);
    expect(settle(0.9)).toBe(1);
    expect(settle(2)).toBe(2);
    // Monotonic: reverse scrolling retraces exactly the same path.
    let last = -1;
    for (let p = 0; p <= 3; p += 0.01) {
      const v = settle(p);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it("fits the showcase under the header and centres it, never enlarging it", () => {
    expect(fit(600, 900)).toEqual({ scale: 1, top: HEADER + 16 + (900 - HEADER - 32 - 600) / 2 });
    const tall = fit(1000, 800);
    expect(tall.scale).toBeCloseTo((800 - HEADER - 32) / 1000);
    expect(tall.top).toBe(HEADER + 16);
  });

  it("follows the scroll at the same pace on any display", () => {
    expect(follow("direct", 16)).toBe(1);
    // Two 60 Hz frames move as far as one 30 Hz frame.
    const at60 = follow("smooth", 1000 / 60);
    expect(1 - (1 - at60) ** 2).toBeCloseTo(follow("smooth", 2000 / 60));
    expect(follow("gentle", 16)).toBeLessThan(follow("smooth", 16));
  });

  it("adds depth without zooming: products off centre shrink and fade only a little", () => {
    expect(panelStyle(0, "standard")).toEqual({ opacity: 1, scale: 1 });
    const off = panelStyle(3, "bold");
    expect(off.scale).toBeGreaterThanOrEqual(0.9);
    expect(off.opacity).toBeGreaterThan(0.3);
    expect(panelStyle(-0.5, "subtle")).toEqual(panelStyle(0.5, "subtle"));
  });

  it("pins only where it fits, and falls back to the carousel otherwise", () => {
    const on = DEFAULT_SHOWCASE;
    const desk = { wide: true, pinnable: true, reducedMotion: false, scale: 0.9 };
    expect(chooseMode(on, desk)).toBe("pinned");
    expect(chooseMode(on, { ...desk, scale: 0.6 })).toBe("carousel");
    expect(chooseMode(on, { ...desk, pinnable: false })).toBe("carousel");
    expect(chooseMode(on, { ...desk, reducedMotion: true })).toBe("carousel");
    expect(chooseMode({ ...on, scroll_driven: false }, desk)).toBe("carousel");
    expect(chooseMode({ ...on, sticky: false }, desk)).toBe("flowing");
    // Phones swipe unless the Studio asks for scrolling, and then only where it fits.
    const phone = { wide: false, pinnable: false, reducedMotion: false, scale: 0.95 };
    expect(chooseMode(on, phone)).toBe("carousel");
    const comfortable = { ...on, mobile: "scroll_where_comfortable" as const };
    expect(chooseMode(comfortable, phone)).toBe("pinned");
    expect(chooseMode(comfortable, { ...phone, scale: 0.6 })).toBe("carousel");
  });

  it("orders products as configured, keeping the rest in their usual order", () => {
    const items = ["zirahr", "jasiri", "expense-now", "ziwa"].map((slug) => ({ slug }));
    expect(orderBySlug(items, ["ziwa", "jasiri"]).map((p) => p.slug)).toEqual([
      "ziwa",
      "jasiri",
      "zirahr",
      "expense-now",
    ]);
    expect(orderBySlug(items, ["unknown"]).map((p) => p.slug)).toEqual(items.map((p) => p.slug));
    expect(showcaseSettings({ intensity: "bold" })).toEqual({ ...DEFAULT_SHOWCASE, intensity: "bold" });
    expect(showcaseSettings(null)).toEqual(DEFAULT_SHOWCASE);
  });
});
