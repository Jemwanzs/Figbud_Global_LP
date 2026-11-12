import { describe, expect, it } from "vitest";

import { areaOf, studioNav } from "./studio-nav";

const sites = [
  { slug: "figbud", name: "FigBud Global", kind: "corporate" as const, status: "active" as const },
  { slug: "zirahr", name: "ZiraHR", kind: "product" as const, status: "active" as const },
];
const hrefs = (groups: ReturnType<typeof studioNav>) =>
  groups.flatMap((g) => [
    g.href,
    ...g.links.flatMap((l) => [l.href, ...(l.children ?? []).map((c) => c.href)]),
  ]);

describe("Studio areas in the sidebar (P13-B3)", () => {
  it("map pages to the areas the API checks", () => {
    expect(areaOf("/admin/sites/zirahr/hero")).toBe("hero");
    expect(areaOf("/admin/sites/zirahr/theme")).toBe("website_settings");
    expect(areaOf("/admin/sites/zirahr/payroll-calculator")).toBe("pricing");
    expect(areaOf("/admin/enquiries?kind=referral")).toBe("enquiries");
    expect(areaOf("/admin/sites/zirahr")).toBeNull();
    expect(areaOf("/admin/settings/security")).toBeNull();
  });

  it("show only the areas someone may open", () => {
    const all = hrefs(studioNav({ role: "editor", modules: null }, sites, "zirahr"));
    expect(all).toContain("/admin/sites/zirahr/hero");
    const pricing = hrefs(
      studioNav({ role: "editor", modules: { pricing: ["view", "edit"] } }, sites, "zirahr"),
    );
    expect(pricing).toContain("/admin/sites/zirahr/pricing");
    expect(pricing).toContain("/admin/sites/zirahr");
    expect(pricing).not.toContain("/admin/sites/zirahr/hero");
    expect(pricing).not.toContain("/admin/enquiries");
    expect(pricing).not.toContain("/admin/approvals");
  });
});
