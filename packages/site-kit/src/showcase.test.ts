import { describe, expect, it } from "vitest";

import { showcaseProducts, showcaseSettings } from "./brand";

// Our Platforms visibility (P14-W13): which products the home page shows.

const products = [
  { slug: "zirahr", name: "ZiraHR" },
  { slug: "jasiri", name: "Jasiri LMS" },
  { slug: "expense_now", name: "Expense Now" },
  { slug: "ziwa", name: "Master Lender" },
];
const names = (s: Parameters<typeof showcaseSettings>[0]) =>
  showcaseProducts(products, showcaseSettings(s)).map((p) => p.name);

describe("showcaseProducts", () => {
  it("shows every product by default, in the registry's order", () => {
    expect(names(undefined)).toEqual(["ZiraHR", "Jasiri LMS", "Expense Now", "Master Lender"]);
  });

  it("leaves hidden products out and keeps the others' order", () => {
    expect(names({ hidden: ["expense_now"] })).toEqual(["ZiraHR", "Jasiri LMS", "Master Lender"]);
    expect(names({ order: ["ziwa", "zirahr"], hidden: ["jasiri"] })).toEqual([
      "Master Lender",
      "ZiraHR",
      "Expense Now",
    ]);
  });

  it("restores a product to its configured place when shown again", () => {
    const order = ["ziwa", "expense_now", "zirahr", "jasiri"];
    expect(names({ order, hidden: ["expense_now"] })).toEqual(["Master Lender", "ZiraHR", "Jasiri LMS"]);
    expect(names({ order, hidden: [] })).toEqual(["Master Lender", "Expense Now", "ZiraHR", "Jasiri LMS"]);
  });

  it("shows nothing when the section is off or every product is hidden", () => {
    expect(names({ enabled: false })).toEqual([]);
    expect(names({ hidden: ["zirahr", "jasiri", "expense_now", "ziwa"] })).toEqual([]);
  });

  it("lists products added later at the end, shown", () => {
    expect(names({ order: ["jasiri"], hidden: ["zirahr"] })).toEqual([
      "Jasiri LMS",
      "Expense Now",
      "Master Lender",
    ]);
  });
});
