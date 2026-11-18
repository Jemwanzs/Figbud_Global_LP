import { describe, expect, it } from "vitest";

import { platformMenu } from "./platform-menu";

const href = (path: string) => `/zirahr/${path}`;
const pages = [{ path: "" }, { path: "platform" }, { path: "about" }];
const tour = [{ type: "hero" }, { type: "modules" }];
const entries = (input: Partial<Parameters<typeof platformMenu>[0]>) =>
  platformMenu({ pages, platformSections: tour, payrollOn: false, pricingShown: false, href, ...input }).map(
    (e) => e.entry,
  );

describe("the Platform menu (owner's brief, 14 Nov 2026)", () => {
  it("lists only what the website publishes", () => {
    expect(entries({})).toEqual(["overview", "modules"]);
    expect(entries({ payrollOn: true, pricingShown: true })).toEqual([
      "overview",
      "modules",
      "payroll",
      "pricing",
    ]);
  });

  it("shows Pricing & plans only while prices are shown on the website", () => {
    expect(entries({ pricingShown: false })).not.toContain("pricing");
    expect(entries({ pricingShown: true })).toContain("pricing");
  });

  it("leaves out a module tour that's hidden, and an Integrations page hidden from navigation", () => {
    expect(entries({ platformSections: [{ type: "modules", hidden: true }] })).toEqual(["overview"]);
    expect(entries({ pages: [...pages, { path: "integrations", show_in_nav: false }] })).not.toContain(
      "integrations",
    );
    expect(entries({ pages: [...pages, { path: "integrations" }] })).toContain("integrations");
  });

  it("is empty without a published Platform page, and links each entry to its page", () => {
    expect(entries({ pages: [{ path: "" }] })).toEqual([]);
    const menu = platformMenu({ pages, platformSections: tour, payrollOn: true, pricingShown: true, href });
    expect(menu.map((e) => e.href)).toEqual([
      "/zirahr/platform",
      "/zirahr/platform#modules",
      "/zirahr/payroll-calculator",
      "/zirahr/pricing",
    ]);
  });
});
