import { describe, expect, it } from "vitest";

import { type NavPreviewContent, resolveNavPreviews } from "./brand";

const defaults: Record<string, NavPreviewContent> = {
  about: { icon: "compass", headline: "Approved headline.", description: "Approved line." },
  blog: { icon: "book-open", headline: "Fresh thinking.", description: "Ideas." },
};

describe("hover previews (UI-NAV2)", () => {
  it("shows the approved wording until the Studio changes it", () => {
    expect(resolveNavPreviews(undefined, defaults)).toEqual(defaults);
    expect(resolveNavPreviews({ items: [] }, defaults)).toEqual(defaults);
  });

  it("applies the Studio's edits field by field; empty keeps the approved wording", () => {
    const out = resolveNavPreviews(
      { items: [{ key: "about", headline: "Edited.", icon: "rocket" }] },
      defaults,
    );
    expect(out.about).toEqual({ icon: "rocket", headline: "Edited.", description: "Approved line." });
    expect(out.blog).toEqual(defaults.blog);
  });

  it("keeps each language's own wording where edits don't apply", () => {
    const out = resolveNavPreviews({ items: [{ key: "about", headline: "Edited." }] }, defaults, false);
    expect(out.about?.headline).toBe("Approved headline.");
  });

  it("can be switched off for the website or for one link", () => {
    expect(resolveNavPreviews({ enabled: false, items: [] }, defaults)).toEqual({});
    const out = resolveNavPreviews({ items: [{ key: "about", enabled: false }] }, defaults);
    expect(out.about).toBeUndefined();
    expect(out.blog).toBeDefined();
  });

  it("gives product websites nothing until they write their own, so nothing is copied", () => {
    expect(resolveNavPreviews(undefined)).toEqual({});
    expect(resolveNavPreviews({ items: [{ key: "/platform", description: "No headline" }] })).toEqual({});
    const out = resolveNavPreviews({ items: [{ key: "/platform", headline: "Payroll you can see." }] });
    expect(out["/platform"]).toEqual({ icon: "sparkles", headline: "Payroll you can see.", description: "" });
  });

  it("ignores icons outside the offered set", () => {
    const out = resolveNavPreviews({ items: [{ key: "about", icon: "skull" }] }, defaults);
    expect(out.about?.icon).toBe("compass");
  });
});
