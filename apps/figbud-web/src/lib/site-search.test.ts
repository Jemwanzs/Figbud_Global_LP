import { describe, expect, it } from "vitest";

import { normalise, searchEntries, type SearchEntry } from "./site-search";

const entry = (title: string, description = "", text = ""): SearchEntry => ({
  title,
  description,
  text,
  href: `/${title}`,
});

describe("site search (P3-12)", () => {
  const entries = [
    entry("Contact", "Talk to FigBud Global about ZiraHR", "partnerships"),
    entry("ZiraHR", "Workforce operations and payroll", "Employee 360 payroll"),
    entry("Products", "Explore ZiraHR, Jasiri LMS and Ziwa LMS"),
  ];

  it("ignores case and accents", () => {
    expect(normalise("Équipe PAYROLL")).toBe("equipe payroll");
  });

  it("needs every word, and ranks a title match first", () => {
    expect(searchEntries(entries, "zirahr").map((e) => e.title)).toEqual(["ZiraHR", "Contact", "Products"]);
    expect(searchEntries(entries, "zirahr payroll").map((e) => e.title)).toEqual(["ZiraHR"]);
    expect(searchEntries(entries, "nothing here")).toEqual([]);
  });

  it("finds nothing for an empty query", () => {
    expect(searchEntries(entries, "   ")).toEqual([]);
  });
});
