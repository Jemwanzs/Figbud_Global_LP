import { describe, expect, it } from "vitest";

import { autoSurfaces } from "./blocks";

const s = (type: string, tone?: Parameters<typeof autoSurfaces>[0][number]["tone"]) => ({ type, tone });

describe("automatic section alternation (owner's brief, 14 Nov 2026)", () => {
  it("alternates sections without a style of their own, after the hero", () => {
    expect(autoSurfaces([s("hero"), s("text"), s("faq"), s("proof"), s("proof")])).toEqual([
      null,
      "alternate",
      "page",
      "alternate",
      "page",
    ]);
  });

  it("continues from bands, explicit styles and sections with their own design", () => {
    // After a band (or the alternate surface), the page; after a demonstration, the alternate.
    expect(autoSurfaces([s("text", "inverse"), s("faq"), s("demo"), s("steps")])).toEqual([
      null,
      "page",
      null,
      "alternate",
    ]);
    // "Page background" never alternates, and the next one does.
    expect(autoSurfaces([s("text", "plain"), s("faq")])).toEqual([null, "alternate"]);
  });

  it("recalculates when a section is hidden, removed or moved", () => {
    const trusted = s("proof");
    const testimonials = s("proof");
    expect(autoSurfaces([s("text"), trusted, testimonials])).toEqual(["alternate", "page", "alternate"]);
    // Trusted By unpublished: testimonials take its place in the sequence.
    expect(autoSurfaces([s("text"), testimonials])).toEqual(["alternate", "page"]);
    // Two consecutive sections never share a background.
    const order = autoSurfaces([s("faq"), s("text"), s("steps"), s("stats")]);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });
});
